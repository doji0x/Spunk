import { Buffer } from 'node:buffer';

export async function processCover(base44, job, signerSecretName, log, events) {
  if (!job.coverSourceUri) return true;
  const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: job.coverSourceUri, expires_in: 300 });
  const response = await fetch(signed.signed_url);
  if (!response.ok) throw new Error('The private cover image could not be loaded.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== job.coverSize) throw new Error('The stored cover size no longer matches this mint.');
  let offset = Number(job.coverOffset) || 0;
  for (let count = 0; offset < bytes.length && count < 6; count += 1) {
    const chunk = bytes.subarray(offset, Math.min(offset + 800, bytes.length));
    const result = await base44.functions.invoke('mintInscribedNft', { action: 'append', cover: true, mint: job.mint, offset, totalSize: bytes.length, mimeType: job.coverMime, data: chunk.toString('base64'), signerSecretName });
    if (result.data?.error || result.data?.nextOffset !== offset + chunk.length) throw new Error(result.data?.error || 'Cover chunk did not confirm.');
    offset += chunk.length;
    log('Cover artwork chunk confirmed', `${offset} / ${bytes.length} bytes`);
    await base44.asServiceRole.entities.MintRecord.update(job.id, { coverOffset: offset, events, processedAt: new Date().toISOString() });
  }
  if (offset < bytes.length) return false;
  const expectedHash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
  const proof = await base44.functions.invoke('mintInscribedNft', { action: 'coverProof', mint: job.mint, signerSecretName });
  if (proof.data?.hash !== expectedHash || proof.data?.bytes !== bytes.length) throw new Error('On-chain cover artwork does not match its source.');
  log('Cover artwork verified on-chain', `SHA-256 ${expectedHash}`);
  await base44.asServiceRole.entities.MintRecord.update(job.id, { coverHash: expectedHash, events });
  return true;
}