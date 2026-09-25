import { base44 } from '@/api/base44Client';
import { runWalletAction, uploadSocialMedia } from '@/lib/walletSocial';

export const coinEditorCall = async payload => (await base44.functions.invoke('updateCoinMetadata', payload)).data;
export const editorImageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export function mimeFromUrl(url, fallback = 'image/png') {
  const extension = url.split(/[?#]/)[0].split('.').pop().toLowerCase();
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' })[extension] || fallback;
}
export async function saveCreatorCoin({ wallet, launch, fields, file, clear, stage }) {
  if (!wallet.provider?.isPhantom) throw new Error('Install or open Phantom to edit this coin.');
  if (!wallet.provider.publicKey) { stage('Connect the launching wallet in Phantom…'); await wallet.connect(); }
  const address = wallet.provider.publicKey?.toString();
  if (!address || address !== launch.ownerWallet) throw new Error('Connect the wallet that originally launched this coin.');
  let imageUrl = fields.imageUrl.trim(), imageMime = fields.imageMime;
  if (!clear && file) {
    if (!editorImageTypes.includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) throw new Error('Choose a PNG, JPG, WebP or GIF image up to 5 MB.');
    stage('Uploading your replacement image…'); imageUrl = await uploadSocialMedia(file); imageMime = file.type;
  }
  if (wallet.provider.publicKey?.toString() !== address) throw new Error('Your wallet changed. Reconnect the launching wallet and try again.');
  const data = { walletAddress: address, coinMint: launch.coinMint, revision: launch.revision,
    ...(!clear ? { name: fields.name, imageUrl, imageMime, website: fields.website, twitter: fields.twitter, github: fields.github } : {}) };
  stage('Approve the metadata message in Phantom. No transaction or network fee is required.');
  return runWalletAction(wallet.provider, clear ? 'clearCoinMetadata' : 'updateCoinMetadata', data, 'updateCoinMetadata');
}