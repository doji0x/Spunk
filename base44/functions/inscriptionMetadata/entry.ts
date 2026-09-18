import { Buffer } from 'node:buffer';
import { solanaRpc } from '../../shared/solanaServices.ts';
import { programAddress, derive, decodeMetadata, associatedAddress, inscriptionTag } from '../../shared/inscriptionMetadata.ts';
import { detectImageMime } from '../../shared/imageMime.ts';
import { imageUri } from '../../shared/pumpLaunch.ts';
import { inscribedFields } from './inscribedFields.ts';
import { cached, remember, rateLimited } from './guard.ts';

const mintPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
// Inscriptions rarely change; a long shared max-age lets CDNs and marketplaces serve repeats without hitting this function.
const headers = { 'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400', 'access-control-allow-origin': '*' };
const progressHeaders = { 'cache-control': 'no-store, max-age=0', 'access-control-allow-origin': '*', 'content-type': 'image/svg+xml; charset=utf-8' };

function imageComplete(bytes, mime) {
  if (mime === 'image/png') return bytes.length >= 12 && bytes.subarray(bytes.length - 12).equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]));
  if (mime === 'image/jpeg') return bytes.length >= 2 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  if (mime === 'image/gif') return bytes.length >= 1 && bytes[bytes.length - 1] === 0x3b;
  if (mime === 'image/webp') return bytes.length >= 12 && bytes.length >= bytes.readUInt32LE(4) + 8;
  return false;
}

function progressImage(byteCount) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200"><rect width="1200" height="1200" fill="#f7f8f2"/><circle cx="600" cy="500" r="92" fill="none" stroke="#68894a" stroke-width="18" stroke-dasharray="420 160"/><text x="600" y="660" text-anchor="middle" fill="#25371d" font-family="system-ui,sans-serif" font-size="48" font-weight="700">INSCRIPTION IN PROGRESS</text><text x="600" y="725" text-anchor="middle" fill="#7c8275" font-family="system-ui,sans-serif" font-size="28">${byteCount.toLocaleString('en-US')} bytes currently on-chain</text></svg>`;
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
    if (asset === 'image') {
      const image = await account(associatedAddress(metadataKey, tag));
      if (!image || image.executable || image.owner !== programAddress) return Response.json({ error: 'The inscribed image account was not found.' }, { status: 404 });
      if (image.space > 5 * 1024 * 1024) return Response.json({ error: 'The inscribed image exceeds 5 MB.' }, { status: 413 });
      const bytes = Buffer.from(image.data[0], 'base64');
      const mime = detectImageMime(bytes);
      if (!mime) return new Response(progressImage(bytes.length), { headers: progressHeaders });
      if (!imageComplete(bytes, mime)) return new Response(progressImage(bytes.length), { headers: progressHeaders });
      return remember(cacheKey, bytes, { ...headers, 'content-type': mime, 'content-length': String(bytes.length) });
    }
    const rootAccount = await account(root);
    if (!rootAccount || rootAccount.executable || rootAccount.owner !== programAddress) return Response.json({ error: 'The root inscription account was not found.' }, { status: 404 });
    const fields = await inscribedFields(rootAccount, root, tag === 'image');
    return remember(cacheKey, JSON.stringify({ ...fields, image: imageUri(mint), showName: true, createdOn: 'https://pump.fun' }), { ...headers, 'content-type': 'application/json' });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to serve inscription metadata.' }, { status: 500 });
  }
}