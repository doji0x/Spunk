import { VersionedTransaction, PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { launchMintKey, hasLaunchMintKey } from '@/lib/launchMintKey';
import { encodeBase58 } from '@/lib/base58';
import { invokeLaunch, launchIntent, launchParams, normalizeLaunch, toBase64 } from '@/lib/unifiedLaunch';

export const waitForLaunch = () => new Promise(resolve => setTimeout(resolve, 2500));
export function assertLaunchWallet(wallet, address) {
  if (wallet.provider?.publicKey?.toString() !== address) throw new Error('Reconnect the wallet that started this launch.');
}
export async function checkLaunch(saved, persist) {
  const data = await invokeLaunch({ action: 'check', requestId: saved.requestId, walletAddress: saved.walletAddress, signature: saved.signature });
  if (!data.attempt) return persist({ ...saved, status: saved.signature ? 'pending' : 'draft' });
  return persist({ ...saved, ...data.attempt, signature: data.attempt.signature || saved.signature || '' });
}
export async function executeLaunch(saved, wallet, persist, progress, preflight) {
  assertLaunchWallet(wallet, saved.walletAddress);
  if (!hasLaunchMintKey(saved.requestId)) throw new Error('The mint key is stored in the original browser. Return there to resume; checking status works here.');
  const mint = await launchMintKey(saved.requestId);
  if (mint.address !== saved.coinMint) throw new Error('Saved mint key mismatch. Keep this launch for recovery.');
  const input = normalizeLaunch(launchParams(saved));
  const params = { requestId: saved.requestId, walletAddress: saved.walletAddress, coinMint: saved.coinMint, launchMode: input.launchMode, name: input.name, symbol: input.symbol, description: input.description, inscribedMint: input.inscribedMint, metadataUrl: input.metadataUrl || '', imageUrl: input.imageUrl || '', quoteMint: input.quoteMint, firstBuyAmount: input.firstBuyAmount, creatorFeePercent: input.creatorFeePercent, creatorFeeBps: input.creatorFeeBps, holderReward: input.holderReward, feeRecipients: input.feeRecipients, socials: input.socials, ...input.socials };
  progress('Preparing coin creation and first buy…');
  const data = await invokeLaunch({ ...params, action: 'prepare', mintAuthorization: toBase64(await mint.sign(new TextEncoder().encode(launchIntent(params)))) });
  preflight(data.preflight || null);
  if (data.alreadyLaunched) return persist({ ...saved, ...data, status: 'confirmed' });
  saved = persist({ ...saved, ...params, ...data, signature: '', signedTransaction: '', status: 'prepared' });
  assertLaunchWallet(wallet, saved.walletAddress);
  const transaction = VersionedTransaction.deserialize(Uint8Array.from(atob(data.transaction), c => c.charCodeAt(0)));
  const message = transaction.message.serialize(), mintSignature = await mint.sign(message);
  transaction.addSignature(new PublicKey(mint.address), mintSignature);
  progress('Approve coin creation and your first buy in Phantom…');
  const signed = await wallet.provider.signTransaction(transaction);
  assertLaunchWallet(wallet, saved.walletAddress);
  if (toBase64(signed.message.serialize()) !== toBase64(message) || !nacl.sign.detached.verify(message, signed.signatures[0], new PublicKey(saved.walletAddress).toBytes())) throw new Error('Phantom returned a different transaction. Nothing was submitted.');
  const signature = encodeBase58(signed.signatures[0]), encoded = toBase64(signed.serialize());
  saved = persist({ ...saved, signature, signedTransaction: encoded, mintSignature: toBase64(mintSignature), status: 'pending' });
  progress('Submitting your approved transaction…');
  await invokeLaunch({ action: 'submit', requestId: saved.requestId, transaction: encoded, mintSignature: saved.mintSignature, submitToken: data.submitToken });
  return saved;
}
export async function configureLaunchRewards(saved, wallet, persist, progress) {
  if (!saved.feeRecipients?.length || saved.rewardStatus === 'confirmed') return saved;
  assertLaunchWallet(wallet, saved.walletAddress);
  if (saved.rewardSignature) {
    const checked = await invokeLaunch({ action: 'confirmSharing', signature: saved.rewardSignature });
    saved = persist({ ...saved, rewardStatus: checked.status });
    if (checked.status !== 'failed') return saved;
  }
  try {
    progress('Preparing a separate fee-sharing approval…');
    saved = persist({ ...saved, rewardStatus: 'preparing', rewardSignature: '', rewardError: '' });
    const data = await invokeLaunch({ action: 'prepareSharing', walletAddress: saved.walletAddress, coinMint: saved.coinMint, quoteMint: saved.quoteMint, feeRecipients: saved.feeRecipients });
    assertLaunchWallet(wallet, saved.walletAddress);
    const transaction = VersionedTransaction.deserialize(Uint8Array.from(atob(data.transaction), c => c.charCodeAt(0)));
    const signed = await wallet.provider.signAndSendTransaction(transaction);
    saved = persist({ ...saved, rewardStatus: 'submitted', rewardSignature: signed.signature });
    for (let i = 0; i < 10; i++) {
      await waitForLaunch();
      const check = await invokeLaunch({ action: 'confirmSharing', signature: signed.signature });
      saved = persist({ ...saved, rewardStatus: check.status });
      if (check.status !== 'pending') break;
    }
    return saved;
  } catch (error) {
    return persist({ ...saved, rewardStatus: saved.rewardSignature ? 'pending' : 'failed', rewardError: error.response?.data?.error || error.message });
  }
}