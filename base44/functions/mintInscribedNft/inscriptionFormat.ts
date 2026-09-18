import { fetchMetadataFromSeeds } from 'npm:@metaplex-foundation/mpl-token-metadata@3.4.0';
import { rpcRequest } from '../../shared/mintWallet.ts';
import { decodeMetadata, inscriptionTag, derive } from '../../shared/inscriptionMetadata.ts';
import { metadataUri } from '../../shared/pumpLaunch.ts';

export async function storedInscriptionTag(rpcUrl, mint) {
  const root = derive(mint.toString());
  const response = await rpcRequest(rpcUrl, 'getAccountInfo', [derive(root), { encoding: 'base64', commitment: 'confirmed' }]);
  if (!response.value) return null;
  const metadata = decodeMetadata(response.value);
  if (!metadata || metadata.inscriptionAccount !== root || (metadata.mint?.__option === 'Some' ? metadata.mint.value !== mint.toString() : metadata.key !== 2)) throw new Error('The inscription metadata is not linked to this mint.');
  const tag = inscriptionTag(metadata);
  if (!tag && metadata.associatedInscriptions.length) throw new Error('This mint uses an unsupported inscription format; it will not be rewritten.');
  return tag;
}

export async function mintInscriptionFormat(umi, rpcUrl, mint, exists, mimeType = 'image/png') {
  const proxyUri = metadataUri(mint.toString());
  const requestedTag = mimeType === 'audio/mpeg' ? 'audio' : 'raw';
  if (!exists) return { tag: requestedTag, uri: proxyUri };
  // Preserve both the stored tag and URI, including retries interrupted before association initialization.
  const [tag, tokenMetadata] = await Promise.all([storedInscriptionTag(rpcUrl, mint), fetchMetadataFromSeeds(umi, { mint })]);
  const uri = tokenMetadata.uri.replace(/\0+$/, '');
  return { tag: tag || (requestedTag === 'audio' ? 'audio' : uri === proxyUri ? 'raw' : 'image'), uri };
}