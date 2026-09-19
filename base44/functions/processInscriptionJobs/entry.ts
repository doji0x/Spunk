import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { Buffer } from 'node:buffer';
import { processCover } from './cover.ts';

const maxJobs = 3;
const chunksPerJob = 6;
const maxEvents = 200;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const input = await req.json().catch(() => ({}));
    let lastSigner = '';
    const target = input.recordId ? await base44.asServiceRole.entities.MintRecord.get(String(input.recordId)).catch(() => null) : null;
    const jobs = input.recordId
      ? (target?.status === 'in_progress' ? [target] : [])
      : (await base44.asServiceRole.entities.MintRecord.filter({ status: 'in_progress' }, 'processedAt', 50)).filter(job => job.sourceUri || job.imageUri).slice(0, maxJobs);
    const results = [];
    for (const job of jobs) {
      const events = Array.isArray(job.events) ? [...job.events] : [];
      const log = (message, details = '') => {
        events.push({ at: new Date().toISOString(), message, details: String(details) });
        if (events.length > maxEvents) events.splice(0, events.length - maxEvents);
      };
      let offset = Math.max(0, Number(job.offset) || 0);
      const confirmed = new Set(Array.isArray(job.confirmedOffsets) ? job.confirmedOffsets : []);
      // Each job signs with the wallet stored on its own record: admin mints with the admin wallet, public mints with the public wallet.
      const signerSecretName = job.signerSecretName || '';
      const identity = await base44.functions.invoke('mintInscribedNft', { action: 'signer', signerSecretName });
      const signer = identity.data?.signer || '';
      lastSigner = signer || lastSigner;
      try {
        const sourceUri = job.sourceUri || job.imageUri;
        const mediaMime = job.mediaMime || job.imageMime;
        const mediaType = job.mediaType || 'image';
        if (!sourceUri || !Number.isInteger(job.totalSize) || !Number.isInteger(job.batchBytes)) continue;
        log('Worker run started', `signing wallet ${signer} (${signerSecretName}) · mint ${job.mint} · ${mediaType}`);
        await base44.asServiceRole.entities.MintRecord.update(job.id, { events, processedAt: new Date().toISOString() });
        if (job.prepared === false) {
          log('Preparing mint and inscription accounts', `signer ${signer}`);
          await base44.asServiceRole.entities.MintRecord.update(job.id, { events });
          const preparation = await base44.functions.invoke('mintInscribedNft', { action: 'start', requestId: job.requestId, name: job.name, symbol: job.symbol, details: job.description, totalSize: job.totalSize, mimeType: mediaMime, coverSize: job.coverSize || 0, coverMime: job.coverMime || '', signerSecretName });
          if (preparation.data?.error || preparation.data?.mint !== job.mint) throw new Error(preparation.data?.error || 'Prepared mint does not match this job.');
          job.maxSupply = preparation.data.maxSupply;
          log('On-chain preparation complete', `mint ${job.mint}`);
          await base44.asServiceRole.entities.MintRecord.update(job.id, { prepared: true, maxSupply: job.maxSupply, events });
        }
        // Cover-first: the cover artwork must be fully written and hash-verified on-chain before any audio byte is spent.
        const cover = await processCover(base44, job, signerSecretName, log, events, chunksPerJob);
        if (!cover.done) {
          await base44.asServiceRole.entities.MintRecord.update(job.id, { events, processedAt: new Date().toISOString() });
          results.push({ id: job.id, mint: job.mint, status: 'in_progress', offset, stage: 'cover', coverOffset: job.coverOffset });
          continue;
        }
        const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: sourceUri, expires_in: 300 });
        const fileResponse = await fetch(signed.signed_url);
        if (!fileResponse.ok) throw new Error('The private source media could not be loaded.');
        const bytes = Buffer.from(await fileResponse.arrayBuffer());
        if (bytes.length !== job.totalSize) throw new Error('The stored source media size no longer matches this mint.');
        let processed = cover.used;
        if (offset === 0 && processed < chunksPerJob && job.coverSourceUri) log('Audio inscription started', `cover verified · ${bytes.length} bytes of ${mediaType}`);
        while (offset < bytes.length && processed < chunksPerJob) {
          const chunk = bytes.subarray(offset, Math.min(offset + job.batchBytes, bytes.length));
          const response = await base44.functions.invoke('mintInscribedNft', { action: 'append', mint: job.mint, offset, totalSize: bytes.length, mimeType: mediaMime, data: chunk.toString('base64'), signerSecretName });
          if (response.data?.error || response.data?.nextOffset !== offset + chunk.length) {
            log('Chunk write failed', `offset ${offset} · ${response.data?.error || 'unexpected confirmation offset'}`);
            throw new Error(response.data?.error || 'A chunk did not confirm at the expected offset.');
          }
          confirmed.add(offset);
          offset += chunk.length;
          processed += 1;
          log('Chunk confirmed on-chain', `${chunk.length} bytes at offset ${offset - chunk.length} · ${offset} / ${bytes.length} bytes written · signer ${signer}`);
          await base44.asServiceRole.entities.MintRecord.update(job.id, { offset, confirmedOffsets: [...confirmed].sort((a, b) => a - b), events, processedAt: new Date().toISOString() });
        }
        const progress = { offset, confirmedOffsets: [...confirmed].sort((a, b) => a - b), processedAt: new Date().toISOString(), errorMessage: '', signerPublicKey: signer, signerSecretName, events };
        await base44.asServiceRole.entities.MintRecord.update(job.id, progress);
        if (offset === bytes.length) {
          const verification = await base44.functions.invoke('validateInscription', { address: job.mint });
          const proof = verification.data?.checks?.metaplex;
          if (proof?.status !== 'valid' || !proof.hash) {
            log('Verification pending', `all bytes written; the on-chain ${mediaType} has not finished confirming yet`);
            await base44.asServiceRole.entities.MintRecord.update(job.id, { ...progress, events });
            results.push({ id: job.id, mint: job.mint, status: 'in_progress', offset, verification: 'pending' });
            continue;
          }
          const expectedHash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
          if (proof.hash.toLowerCase() !== expectedHash) {
            log('Verification failed', `on-chain ${proof.hash} does not match source ${expectedHash}`);
            throw new Error(`On-chain ${mediaType} verification failed: the embedded bytes do not match the private source media.`);
          }
          log('Verification passed', `SHA-256 ${expectedHash}`);
          if (job.maxSupply === '1') {
            const finalized = await base44.functions.invoke('mintInscribedNft', { action: 'finalize', mint: job.mint, signerSecretName });
            if (finalized.data?.error) {
              log('Finalize failed', finalized.data.error);
              throw new Error(finalized.data.error);
            }
            log('Master Edition finalized', `maxSupply 1 · edition ${finalized.data?.editionMint || 'printed'} · signer ${signer}`);
          }
          if (job.destinationWallet) {
            const delivery = await base44.functions.invoke('mintInscribedNft', { action: 'transfer', mint: job.mint, destination: job.destinationWallet, signerSecretName });
            if (delivery.data?.error) {
              log('Delivery failed', delivery.data.error);
              throw new Error(delivery.data.error);
            }
            log('NFT delivered', `mint ${job.mint} · ${job.destinationWallet}`);
          }
          let archivedSourceUri = job.archivedSourceUri || job.archivedImageUri || '';
          try {
            const archive = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file: new File([bytes], `${job.mint}-source`, { type: mediaMime || 'application/octet-stream' }) });
            archivedSourceUri = archive.file_uri;
            log('Source media archived', `${bytes.length} bytes · ${archivedSourceUri}`);
          } catch (archiveError) {
            log('Source media archive failed', archiveError.message || 'The archive upload did not complete.');
            if (job.pof) throw archiveError;
          }
          if (job.coverSourceUri) {
            const coverLink = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: job.coverSourceUri, expires_in: 300 });
            const coverResponse = await fetch(coverLink.signed_url);
            if (!coverResponse.ok) throw new Error('Cover archive source is unavailable.');
            const coverBytes = await coverResponse.arrayBuffer();
            if (coverBytes.byteLength !== job.coverSize) throw new Error('Cover archive size mismatch.');
            const coverArchive = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file: new File([coverBytes], `${job.mint}-cover`, { type: job.coverMime }) });
            await base44.asServiceRole.entities.MintRecord.update(job.id, { archivedCoverUri: coverArchive.file_uri });
            log('Cover artwork archived', `${job.coverSize} bytes`);
          }
          log('Mint complete', `mint ${job.mint} · signer ${signer}`);
          await base44.asServiceRole.entities.MintRecord.update(job.id, { ...progress, status: 'success', mediaHash: proof.hash, archivedSourceUri, ...(mediaType === 'image' ? { imageHash: proof.hash, archivedImageUri: archivedSourceUri } : {}), events });
          results.push({ id: job.id, mint: job.mint, status: 'success', offset, archivedSourceUri });
        } else results.push({ id: job.id, mint: job.mint, status: 'in_progress', offset });
      } catch (error) {
        log('Background job stopped', error.message || 'Unknown failure');
        // Keep every chunk this run confirmed so the retry continues from the last confirmed offset.
        await base44.asServiceRole.entities.MintRecord.update(job.id, { status: 'failed', errorMessage: error.message || 'Background inscription stopped.', processedAt: new Date().toISOString(), signerPublicKey: signer, signerSecretName, offset, confirmedOffsets: [...confirmed].sort((a, b) => a - b), events });
        results.push({ id: job.id, mint: job.mint, status: 'failed', error: error.message });
      }
    }
    return Response.json({ processed: results.length, signer: lastSigner, results });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to process inscription jobs.' }, { status: 500 });
  }
}