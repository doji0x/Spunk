export async function queuePof(base44, input, mint, signer, signerSecretName) {
  const records = await base44.entities.MintRecord.filter({ requestId: input.requestId });
  if (records[0]) {
    if (!records[0].pof || records[0].submissionHash !== input.submissionHash) throw new Error('This request identifier belongs to another submission.');
    return records[0];
  }
  return await base44.entities.MintRecord.create({
    mint, requestId: input.requestId, name: input.name.trim(), symbol: input.symbol.trim().toUpperCase(), description: input.details.trim(),
    owner: signer, signerPublicKey: signer, signerSecretName, destinationWallet: input.destinationWallet,
    sourceUri: input.sourceUri, mediaType: input.mimeType === 'audio/mpeg' ? 'audio' : 'image', mediaMime: input.mimeType,
    ...(input.mimeType.startsWith('image/') ? { imageUri: input.sourceUri, imageMime: input.mimeType } : {}),
    totalSize: input.totalSize, batchBytes: 800, offset: 0, confirmedOffsets: [], status: 'in_progress', prepared: false, pof: true,
    submissionHash: input.submissionHash, coverSourceUri: input.coverSourceUri || '', coverSize: input.coverSize || 0,
    coverMime: input.coverMime || '', coverOffset: 0, processedAt: new Date().toISOString(),
    events: [{ at: new Date().toISOString(), message: 'Manual POF submission queued', details: 'Saved before on-chain preparation. The background worker will mint, inscribe, verify and deliver.' }]
  });
}