import { indexedAsset } from './solanaServices.ts';
import { verifyInscription } from './verifyInscription.ts';

const mintPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const metadataOrigin = 'https://solvalidate.base44.app';

export async function verifyUriLinkedInscription(address) {
  if (typeof address !== 'string' || !mintPattern.test(address)) {
    return { status: 'invalid', reason: 'This check applies to a token mint address, not a transaction signature.' };
  }
  const asset = await indexedAsset(address);
  if (asset.status === 'unavailable') return { status: 'unknown', message: 'The token metadata URI could not be read from the indexer.' };
  if (asset.status !== 'found' || !asset.uri) return { status: 'invalid', reason: 'This token has no indexed metadata URI linking to an inscription.' };
  let uri;
  try { uri = new URL(asset.uri); } catch { return { status: 'invalid', reason: 'This token metadata URI is malformed.' }; }
  if (uri.origin !== metadataOrigin || uri.pathname !== '/functions/inscriptionMetadata') {
    return { status: 'invalid', reason: 'This token metadata URI does not link to the supported inscription resolver.' };
  }
  const inscribedMint = uri.searchParams.get('mint') || '';
  if (!mintPattern.test(inscribedMint)) return { status: 'invalid', reason: 'The metadata URI does not identify a valid inscription mint.' };
  const proof = await verifyInscription(inscribedMint);
  if (proof.status !== 'valid') return { status: proof.status, reason: proof.reason, message: proof.message };
  return { ...proof, sourceMint: address, inscribedMint, metadataUri: asset.uri, standard: 'Token metadata URI linked inscription' };
}