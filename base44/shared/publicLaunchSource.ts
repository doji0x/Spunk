import { Buffer } from 'node:buffer';
import nacl from 'npm:tweetnacl@1.0.3';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { verifyInscription } from './verifyInscription.ts';
import { metadataUri, imageUri } from './pumpLaunch.ts';
import { checkMetadataProxy } from './pumpLaunchValidation.ts';

export function authorizeLaunch(body, input, walletAddress, coinMint, socials, recipients) {
  const source = input.launchMode === 'upload' ? [input.metadataUrl, input.imageUrl] : [input.inscribedMint];
  const intent = JSON.stringify(['curated-launch-v1', input.requestId, walletAddress, coinMint, input.launchMode, input.name, input.symbol, input.description, source, input.quoteMint, input.firstBuyAmount, input.creatorFeeBps, input.holderReward, recipients, socials]);
  const proof = Buffer.from(String(body.mintAuthorization || ''), 'base64');
  if (proof.length !== 64 || !nacl.sign.detached.verify(new TextEncoder().encode(intent), proof, new PublicKey(coinMint).toBytes())) throw new Error('Invalid mint authorization. Return to the original browser and review this launch again.');
}
export async function resolveLaunchSource(input, coinMint) {
  if (input.launchMode === 'upload') {
    for (const [value, limit, label] of [[input.metadataUrl, 200, 'Metadata'], [input.imageUrl, 2048, 'Image']]) {
      let url;
      try { url = new URL(value); } catch { throw new Error(`${label} needs a public HTTPS URL.`); }
      if (url.protocol !== 'https:' || url.username || url.password || Buffer.byteLength(value) > limit) throw new Error(`${label} needs an HTTPS URL of at most ${limit} bytes.`);
    }
    return { uri: input.metadataUrl, imageUrl: input.imageUrl };
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input.inscribedMint)) throw new Error('Enter a valid inscribed NFT mint address.');
  const proof = await verifyInscription(input.inscribedMint);
  if (proof.status !== 'valid') throw new Error(proof.reason || proof.message || 'This is not a valid image inscription.');
  const uri = metadataUri(input.inscribedMint, coinMint), imageUrl = imageUri(input.inscribedMint);
  const proxy = await checkMetadataProxy(uri, imageUrl);
  if (!proxy.ready) throw new Error(proxy.message);
  return { uri, imageUrl };
}