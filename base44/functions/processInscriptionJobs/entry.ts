import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { Buffer } from 'node:buffer';

const maxJobs = 3;
const chunksPerJob = 6;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const input = await req.json().catch(() => ({}));
    const target = input.recordId ? await base44.asServiceRole.entities.MintRecord.get(String(input.recordId)).catch(() => null) : null;
    const jobs = input.recordId
      ? (target?.status === 'in_progress' ? [target] : [])
      : (await base44.asServiceRole.entities.MintRecord.filter({ status: 'in_progress' }, 'processedAt', 50)).filter(job => job.imageUri).slice(0, maxJobs);
    const results = [];
    for (const job of jobs) {
      try {
        if (!job.imageUri || !Number.isInteger(job.totalSize) || !Number.isInteger(job.batchBytes)) continue;
        const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: job.imageUri, expires_in: 300 });
        const fileResponse = await fetch(signed.signed_url);
        if (!fileResponse.ok) throw new Error('The private source image could not be loaded.');
        const bytes = Buffer.from(await fileResponse.arrayBuffer());
        if (bytes.length !== job.totalSize) throw new Error('The stored source image size no longer matches this mint.');
        let offset = Math.max(0, Number(job.offset) || 0);
        const confirmed = new Set(Array.isArray(job.confirmedOffsets) ? job.confirmedOffsets : []);
        let processed = 0;
        while (offset < bytes.length && processed < chunksPerJob) {
          const chunk = bytes.subarray(offset, Math.min(offset + job.batchBytes, bytes.length));
          const response = await base44.functions.invoke('mintInscribedNft', { action: 'append', mint: job.mint, offset, totalSize: bytes.length, mimeType: job.imageMime, data: chunk.toString('base64') });
          if (response.data?.error || response.data?.nextOffset !== offset + chunk.length) throw new Error(response.data?.error || 'A chunk did not confirm at the expected offset.');
          confirmed.add(offset);
          offset += chunk.length;
          processed += 1;
        }
        const progress = { offset, confirmedOffsets: [...confirmed].sort((a, b) => a - b), processedAt: new Date().toISOString(), errorMessage: '' };
        await base44.asServiceRole.entities.MintRecord.update(job.id, progress);
        if (offset === bytes.length) {
          const verification = await base44.functions.invoke('validateInscription', { address: job.mint });
          const proof = verification.data?.checks?.metaplex;
          if (proof?.status !== 'valid' || !proof.hash) {
            results.push({ id: job.id, mint: job.mint, status: 'in_progress', offset, verification: 'pending' });
            continue;
          }
          const expectedHash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
          if (proof.hash.toLowerCase() !== expectedHash) throw new Error('On-chain image verification failed: the embedded bytes do not match the private source image.');
          if (job.maxSupply === '1') {
            const finalized = await base44.functions.invoke('mintInscribedNft', { action: 'finalize', mint: job.mint });
            if (finalized.data?.error) throw new Error(finalized.data.error);
          }
          await base44.asServiceRole.entities.MintRecord.update(job.id, { ...progress, status: 'success', imageHash: proof.hash });
          results.push({ id: job.id, mint: job.mint, status: 'success', offset });
        } else results.push({ id: job.id, mint: job.mint, status: 'in_progress', offset });
      } catch (error) {
        await base44.asServiceRole.entities.MintRecord.update(job.id, { status: 'failed', errorMessage: error.message || 'Background inscription stopped.', processedAt: new Date().toISOString() });
        results.push({ id: job.id, mint: job.mint, status: 'failed', error: error.message });
      }
    }
    return Response.json({ processed: results.length, results });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to process inscription jobs.' }, { status: 500 });
  }
}