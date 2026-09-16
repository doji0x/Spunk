import { Buffer } from 'node:buffer';

async function boundedBody(response, limit) {
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error('Gateway response exceeds the expected size.'); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export async function checkMetadataGateway(uri, proof) {
  try {
    const response = await fetch(uri, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if (!response.ok) return { ready: false, message: `The image is verified on-chain, but its Metaplex metadata gateway returned HTTP ${response.status}. Launch is blocked to avoid creating a coin with broken metadata. No SOL was spent. The gateway must serve the inscription metadata and image before launching.` };
    const metadata = JSON.parse((await boundedBody(response, 65536)).toString('utf8'));
    if (typeof metadata.image !== 'string' || !metadata.image) throw new Error('The gateway metadata has no image field.');
    const imageUrl = new URL(metadata.image, uri);
    if (imageUrl.origin !== 'https://igw.metaplex.com' || !imageUrl.pathname.startsWith('/mainnet/') || imageUrl.username || imageUrl.password) throw new Error('The metadata image must be served from the mainnet inscription gateway.');
    const imageResponse = await fetch(imageUrl, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if (!imageResponse.ok) throw new Error(`The gateway image returned HTTP ${imageResponse.status}.`);
    const bytes = await boundedBody(imageResponse, proof.bytes);
    const hash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
    if (hash !== proof.hash) throw new Error('The gateway image does not match the verified on-chain image bytes.');
    return { ready: true };
  } catch (error) {
    return { ready: false, message: `Launch blocked: the inscription gateway is not serving usable, matching image metadata. ${error.message} No SOL was spent.` };
  }
}