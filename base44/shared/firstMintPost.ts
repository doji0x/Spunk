import { imageUri } from './pumpLaunch.ts';

// Celebrates a wallet's first completed inscription with one automatic post on its
// profile. Silent when the wallet has no profile or has already inscribed before.
export async function postFirstMint(entities, record) {
  const wallet = String(record?.destinationWallet || '').trim();
  if (!wallet || !record?.mint) return null;
  const [profile] = await entities.Profile.filter({ walletAddress: wallet });
  if (!profile) return null;
  const earlier = await entities.MintRecord.filter({ destinationWallet: wallet, status: 'success' }, 'created_date', 5);
  if (earlier.some(entry => entry.id !== record.id)) return null;
  const label = record.mediaType === 'audio' ? 'audio' : 'image';
  return entities.Post.create({
    authorWallet: wallet,
    text: `Just inscribed my first NFT on Solana — "${record.name}" (${record.symbol}) with its full ${label} bytes stored on-chain. Mint ${record.mint}`,
    mediaUrl: record.mediaType === 'audio' ? '' : imageUri(record.mint)
  });
}