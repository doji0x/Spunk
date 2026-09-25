import { base44 } from '@/api/base44Client';
import { VersionedTransaction, PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { launchMintKey, hasLaunchMintKey } from '@/lib/launchMintKey';
import { encodeBase58 } from '@/lib/base58';
import timeout from '@/lib/atomicV1Timeout';

export const initialNormalInput = { name: '', symbol: '', description: '', website: '', twitter: '', github: '' };
const b64 = bytes => btoa(String.fromCharCode(...bytes));
export const normalStorageKey = address => `validate:normal-pump:${address}`;
export const invokeNormal = async payload => (await timeout(base44.functions.invoke('publicPumpLaunch', { network: 'mainnet-beta', ...payload }), 90000, 'The request timed out. Keep your saved launch and check its status before retrying.')).data;
export function saveNormal(attempt) { localStorage.setItem(normalStorageKey(attempt.walletAddress), JSON.stringify(attempt)); return attempt; }
export async function uploadNormalDraft(input, file, walletAddress, progress) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) throw new Error('Choose a PNG, JPG, WebP or GIF image up to 5 MB.');
  const name = input.name.trim(), symbol = input.symbol.trim().toUpperCase(), description = input.description.trim();
  if (!name || new TextEncoder().encode(name).length > 32 || !symbol || new TextEncoder().encode(symbol).length > 10) throw new Error('Name must fit 32 bytes and ticker 10 bytes.');
  const socials = Object.fromEntries(['website', 'twitter', 'github'].map(key => { const value = input[key].trim(); if (value && (value.length > 200 || !['https:', 'http:'].includes(new URL(value).protocol))) throw new Error(`Enter a valid ${key} URL of at most 200 characters.`); return [key, value]; }));
  const upload = file => timeout(base44.integrations.Core.UploadPublicFile({ file }), 60000, 'Upload timed out. No transaction was requested.');
  progress('Uploading the coin image…');
  const { file_url: imageUrl } = await upload(file);
  progress('Saving public metadata…');
  const metadata = { name, symbol, description, image: imageUrl, showName: true, ...socials };
  const { file_url: metadataUrl } = await upload(new File([JSON.stringify(metadata)], 'm.json', { type: 'application/json' }));
  if (new TextEncoder().encode(metadataUrl).length > 200) throw new Error('The uploaded metadata URL exceeds the 200-byte on-chain limit. Nothing has been signed.');
  const requestId = crypto.randomUUID(), mint = await launchMintKey(requestId);
  return { requestId, walletAddress, coinMint: mint.address, name, symbol, description, socials, metadataUrl, imageUrl, launchMode: 'normal', status: 'draft' };
}
export async function executeNormalLaunch(saved, wallet, persist, progress) {
  const assertWallet = () => { if (wallet.provider?.publicKey?.toString() !== saved.walletAddress) throw new Error('Reconnect the original launch wallet.'); };
  assertWallet();
  if (!hasLaunchMintKey(saved.requestId)) throw new Error('The mint key is only available in the original browser. Return there to continue; Check still works here.');
  const mint = await launchMintKey(saved.requestId);
  if (mint.address !== saved.coinMint) throw new Error('Saved mint key mismatch. Preserve this launch.');
  progress('Preparing coin creation…');
  const s = saved.socials || {};
  const intent = JSON.stringify(['validate-normal-pump-v1', saved.requestId, saved.walletAddress, saved.coinMint, saved.name, saved.symbol, saved.metadataUrl, saved.imageUrl, saved.description || '', s.website || '', s.twitter || '', s.github || '']);
  const data = await invokeNormal({ ...saved, action: 'prepare', launchMode: 'normal', mintAuthorization: b64(await mint.sign(new TextEncoder().encode(intent))) });
  if (data.alreadyLaunched) return persist({ ...saved, ...data, status: 'confirmed' });
  saved = persist({ ...saved, ...data, signature: '', status: 'prepared' });
  assertWallet();
  const transaction = VersionedTransaction.deserialize(Uint8Array.from(atob(data.transaction), c => c.charCodeAt(0)));
  const message = transaction.message.serialize();
  const mintSignature = await mint.sign(message);
  transaction.addSignature(new PublicKey(mint.address), mintSignature);
  progress('Approve coin creation in Phantom…');
  const signed = await wallet.provider.signTransaction(transaction);
  assertWallet();
  if (b64(signed.message.serialize()) !== b64(message) || !nacl.sign.detached.verify(message, signed.signatures[0], new PublicKey(saved.walletAddress).toBytes())) throw new Error('Phantom returned a signature for a different transaction. Nothing was submitted.');
  const encoded = b64(signed.serialize()), signature = encodeBase58(signed.signatures[0]);
  saved = persist({ ...saved, signature, signedTransaction: encoded, mintSignature: b64(mintSignature), status: 'pending' });
  progress('Submitting your approved transaction…');
  await invokeNormal({ action: 'submit', requestId: saved.requestId, transaction: encoded, mintSignature: saved.mintSignature, submitToken: data.submitToken });
  return saved;
}