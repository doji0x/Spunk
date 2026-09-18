import { Buffer } from 'node:buffer';
import { solanaRpc } from '../../shared/solanaServices.ts';
import { programAddress, derive, decodeMetadata, associatedAddress, inscriptionTag } from '../../shared/inscriptionMetadata.ts';
import { detectImageMime } from '../../shared/imageMime.ts';
import { imageUri } from '../../shared/pumpLaunch.ts';
import { inscribedFields } from './inscribedFields.ts';
import { cached, remember, rateLimited } from './guard.ts';
import { confirmedPrefixLength, expectedImage, partialImage } from './partialImage.ts';

const mintPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
// Inscriptions rarely change; a long shared max-age lets CDNs and marketplaces serve repeats without hitting this function.
const headers = { 'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400', 'access-control-allow-origin': '*' };
const progressHeaders = { 'cache-control': 'no-store, max-age=0', 'access-control-allow-origin': '*', 'content-type': 'image/png' };

function imageComplete(bytes, mime) {
  if (mime === 'image/png') return bytes.length >= 12 && bytes.subarray(bytes.length - 12).equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]));
  if (mime === 'image/jpeg') return bytes.length >= 2 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  if (mime === 'image/gif') return bytes.length >= 1 && bytes[bytes.length - 1] === 0x3b;
  if (mime === 'image/webp') return bytes.length >= 12 && bytes.length >= bytes.readUInt32LE(4) + 8;
  return false;
}

async function account(key) {
  return (await solanaRpc('getMultipleAccounts', [[key], { encoding: 'base64', commitment: 'confirmed' }])).value[0];
}

// Public, unauthenticated endpoint: it is the on-chain metadata URI of every launched coin.
export default async function(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const mint = (url.searchParams.get('mint') || '').trim();
    if (!mintPattern.test(mint)) return Response.json({ error: 'Provide a valid inscribed mint address.' }, { status: 400 });
    const asset = url.searchParams.get('asset') === 'image' ? 'image' : 'json';
    const cacheKey = `${mint}:${asset}:partial-safe-v1`;
    const hit = cached(cacheKey);
    if (hit) return hit;
    if (rateLimited(req)) return Response.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429, headers: { 'retry-after': '60' } });
    const root = derive(mint);
    const metadataKey = derive(root);
    const metadata = decodeMetadata(await account(metadataKey));
    const tag = inscriptionTag(metadata);
    const linked = metadata && metadata.inscriptionAccount === root && (metadata.mint?.__option === 'Some' ? metadata.mint.value === mint : metadata.key === 2);
    if (!linked || !tag) return Response.json({ error: 'No supported raw-data or image inscription is linked to this mint.' }, { status: 404 });
    const rootAccount = await account(root);
    if (asset === 'image') {
      const image = await account(associatedAddress(metadataKey, tag));
      if (!image || image.executable || image.owner !== programAddress) return Response.json({ error: 'The inscribed image account was not found.' }, { status: 404 });
      if (image.space > 5 * 1024 * 1024) return Response.json({ error: 'The inscribed image exceeds 5 MB.' }, { status: 413 });
      const bytes = Buffer.from(image.data[0], 'base64');
      const detectedMime = detectImageMime(bytes);
      if (detectedMime && imageComplete(bytes, detectedMime)) return remember(cacheKey, bytes, { ...headers, 'content-type': detectedMime, 'content-length': String(bytes.length) });
      const confirmedLength = confirmedPrefixLength(bytes);
      const confirmedBytes = bytes.subarray(0, confirmedLength);
      const plan = expectedImage(rootAccount, bytes.length, detectedMime);
      return new Response(partialImage(confirmedBytes, plan.mime, plan.total), { headers: progressHeaders });
    }
    if (!rootAccount || rootAccount.executable || rootAccount.owner !== programAddress) return Response.json({ error: 'The root inscription account was not found.' }, { status: 404 });
    const fields = await inscribedFields(rootAccount, root, tag === 'image');
    return remember(cacheKey, JSON.stringify({ ...fields, image: imageUri(mint), showName: true, createdOn: 'https://pump.fun' }), { ...headers, 'content-type': 'application/json' });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to serve inscription metadata.' }, { status: 500 });
  }
}