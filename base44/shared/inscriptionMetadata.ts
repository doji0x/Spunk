import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { getInscriptionMetadataAccountDataSerializer } from 'npm:@metaplex-foundation/mpl-inscription@0.8.1';
import { inscriptionHistoryAccounts } from './solanaServices.ts';

export const programAddress = '1NSCRfGeyo7wPUazGbaPBUsTM49e1k2aXewHGARfzSo';
export function derive(key) {
  const program = new PublicKey(programAddress);
  return PublicKey.findProgramAddressSync([Buffer.from('Inscription'), program.toBuffer(), new PublicKey(key).toBuffer()], program)[0].toBase58();
}
export function decodeMetadata(account) {
  if (!account || account.executable || account.owner !== programAddress || account.space > 65536) return null;
  const bytes = Buffer.from(account.data[0], 'base64');
  if (![1, 2].includes(bytes[0])) return null;
  // Program-owned image bytes can share a discriminator; only decodable metadata is a candidate.
  try { return getInscriptionMetadataAccountDataSerializer().deserialize(bytes)[0]; } catch { return null; }
}
export function linkedMint(key, account) {
  const metadata = decodeMetadata(account);
  const mint = metadata?.mint?.__option === 'Some' ? metadata.mint.value : null;
  return mint && metadata.inscriptionAccount === derive(mint) && key === derive(derive(mint)) ? mint : null;
}
export async function resolveIndexedMint(key, account) {
  const direct = linkedMint(key, account);
  if (direct) return direct;
  const metadata = decodeMetadata(account);
  if (!metadata || metadata.key !== 2 || metadata.mint?.__option === 'Some' || derive(metadata.inscriptionAccount) !== key) return null;
  const candidates = await inscriptionHistoryAccounts(key);
  return candidates.find(mint => derive(mint) === metadata.inscriptionAccount) || null;
}
export function inscriptionTag(metadata) {
  const tags = metadata?.associatedInscriptions || [];
  return ['raw', 'image', 'audio'].find(tag => tags.some(entry => entry.tag === tag)) || null;
}
export function associatedAddress(metadataKey, tag) {
  return PublicKey.findProgramAddressSync([Buffer.from('Inscription'), Buffer.from('Association'), Buffer.from(tag), new PublicKey(metadataKey).toBuffer()], new PublicKey(programAddress))[0].toBase58();
}
export function imageAddress(metadataKey) {
  return associatedAddress(metadataKey, 'image');
}