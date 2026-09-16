import { Buffer } from 'node:buffer';
import { solanaRpc } from '../../shared/solanaServices.ts';
import { programAddress, derive, decodeMetadata, imageAddress } from '../../shared/inscriptionMetadata.ts';
import { detectImageMime } from '../../shared/imageMime.ts';
import { imageUri } from '../../shared/pumpLaunch.ts';
import { inscribedFields } from './inscribedFields.ts';
import { cached, remember, rateLimited } from './guard.ts';

const mintPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
// Inscriptions rarely change; a long shared max-age lets CDNs and marketplaces serve repeats without hitting this function.
const headers = { 'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400', 'access-control-allow-origin': '*' };

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
    const cacheKey = `${mint}:${asset}`;
    const hit = cached(cacheKey);
    if (hit) return hit;
    if (rateLimited(req)) return Response.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429, headers: { 'retry-after': '60' } });
    const root = derive(mint);
    const metadataKey = derive(root);
    const metadata = decodeMetadata(await account(metadataKey));
    if (!metadata || metadata.inscriptionAccount !== root || !metadata.associatedInscriptions.some(a => a.tag === 'image')) return Response.json({ error: 'No Metaplex image inscription is linked to this mint.' }, { status: 404 });
    if (asset === 'image') {
      const image = await account(imageAddress(metadataKey));
      if (!image || image.owner !== programAddress) return Response.json({ error: 'The inscribed image account was not found.' }, { status: 404 });
      if (image.space > 5 * 1024 * 1024) return Response.json({ error: 'The inscribed image exceeds 5 MB.' }, { status: 413 });
      const bytes = Buffer.from(image.data[0], 'base64');
      const mime = detectImageMime(bytes);
      if (!mime) return Response.json({ error: 'The inscribed bytes are not a supported image.' }, { status: 415 });
      return remember(cacheKey, bytes, { ...headers, 'content-type': mime, 'content-length': String(bytes.length) });
    }
    const fields = await inscribedFields(await account(root), root);
    return remember(cacheKey, JSON.stringify({ ...fields, image: imageUri(mint), showName: true, createdOn: 'https://pump.fun' }), { ...headers, 'content-type': 'application/json' });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to serve inscription metadata.' }, { status: 500 });
  }
}