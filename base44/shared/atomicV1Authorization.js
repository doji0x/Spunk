import { base58Decode, invariant, solLamports, utf8, verifySignature } from './atomicV1Protocol.js';

function canonicalUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const url = new URL(text);
  invariant(['http:', 'https:'].includes(url.protocol) && text.length <= 200, 'Invalid launch social URL.');
  return url.toString();
}
/** The browser mint key authorizes the immutable preparation and preview. This
 * is not a Phantom authentication signature and cannot authorize SOL spending.
 * Both ends construct these bytes independently from the launch inputs.
 */
export function preparationAuthorizationBytes(input) {
  base58Decode(input.walletAddress); base58Decode(input.coinMint);
  invariant(typeof input.requestId === 'string' && /^[0-9a-f-]{36}$/i.test(input.requestId), 'Invalid request identity.');
  invariant(/^[a-f0-9]{64}$/.test(input.imageSha256) && Number.isSafeInteger(input.imageByteLength) && input.imageByteLength > 0, 'Invalid image commitment.');
  const url = new URL(input.imageUrl);
  invariant(url.protocol === 'https:' && input.imageUrl.length <= 2048, 'Public image URL must use HTTPS.');
  return utf8(JSON.stringify(['SPUNK_ATOMIC_PREPARATION_V1', input.requestId, input.walletAddress, input.coinMint,
    String(input.name).trim(), String(input.symbol).trim().toUpperCase(), String(input.description || '').trim(),
    solLamports(input.firstBuyAmount || '').toString(), input.imageSha256, input.imageByteLength, input.imageUrl,
    canonicalUrl(input.socials?.website), canonicalUrl(input.socials?.twitter), canonicalUrl(input.socials?.github)]));
}
export async function verifyPreparationAuthorization(input, signature) {
  invariant(signature instanceof Uint8Array && signature.length === 64 &&
    await verifySignature(signature, preparationAuthorizationBytes(input), input.coinMint), 'The mint key did not authorize these launch details.');
  return true;
}
