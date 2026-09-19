import { Buffer } from 'node:buffer';

// Inscribes and verifies the cover artwork. Returns { done, used } where `used` is the
// number of chunk writes consumed from the shared per-run budget.
export async function processCover(base44, job, signerSecretName, log, events, budget = 6) {
  if (!job.coverSourceUri) return { done: true, used: 0 };
  if (job.coverHash) return { done: true, used: 0 };
  const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: job.coverSourceUri, expires_in: 300 });
  const response = await fetch(signed.signed_url);
  if (!response.ok) throw new Error('The private cover image could not be loaded.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== job.coverSize) throw new Error('The stored cover size no longer matches this mint.');
  let offset = Number(job.coverOffset) || 0;
  let used = 0;
  if (offset === 0 && offset < bytes.length) log('Cover artwork inscription started', `${bytes.length} bytes · audio will not begin until the cover is verified on-chain`);
  for (; offset < bytes.length && used < budget; used += 1) {
    const chunk = bytes.subarray(offset, Math.min(offset + 800, bytes.length));
    const result = await base44.functions.invoke('mintInscribedNft', { action: 'append', cover: true, mint: job.mint, offset, totalSize: bytes.length, mimeType: job.coverMime, data: chunk.toString('base64'), signerSecretName });
    if (result.data?.error || result.data?.nextOffset !== offset + chunk.length) throw new Error(result.data?.error || 'Cover chunk did not confirm.');
    offset += chunk.length;
    log('Cover artwork chunk confirmed', `${offset} / ${bytes.length} bytes`);
    await base44.asServiceRole.entities.MintRecord.update(job.id, { coverOffset: offset, events, processedAt: new Date().toISOString() });
  }
  if (offset < bytes.length) return { done: false, used };
  const expectedHash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
  const proof = await base44.functions.invoke('mintInscribedNft', { action: 'coverProof', mint: job.mint, signerSecretName });
  if (proof.data?.hash !== expectedHash || proof.data?.bytes !== bytes.length) {
    log('Cover artwork verification failed', `on-chain ${proof.data?.hash || 'missing'} does not match source ${expectedHash}`);
    throw new Error('On-chain cover artwork does not match its source. Audio inscription was not started.');
  }
  log('Cover artwork verified on-chain', `SHA-256 ${expectedHash} · audio inscription may now begin`);
  job.coverHash = expectedHash;
  await base44.asServiceRole.entities.MintRecord.update(job.id, { coverHash: expectedHash, events });
  return { done: true, used };
}