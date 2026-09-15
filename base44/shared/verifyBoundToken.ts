import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { ExtensionType, TOKEN_2022_PROGRAM_ID, getExtensionData, unpackMint } from 'npm:@solana/spl-token@0.4.13';
import { unpack } from 'npm:@solana/spl-token-metadata@0.1.6';
import { solanaRpc } from './solanaServices.ts';
import { verifyInscription as verifyMetaplex } from './verifyInscription.ts';

const mintPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const authority = key => key && !key.equals(PublicKey.default) ? key.toBase58() : null;
const invalid = reason => ({ status: 'invalid', reason });

// Token-2022 mint → on-mint fields name the inscription NFT and image digest;
// inscription metadata → names the token mint back. Both directions must hold and the bytes must hash to the on-mint digest.
export async function verifyBoundToken(address) {
  try {
    if (typeof address !== 'string' || !mintPattern.test(address)) return invalid('This check applies to a token mint address, not a transaction signature.');
    const account = (await solanaRpc('getAccountInfo', [address, { encoding: 'base64', commitment: 'finalized' }]))?.value;
    if (!account) return invalid('No account exists at this address.');
    if (account.owner !== TOKEN_2022_PROGRAM_ID.toBase58()) return invalid('This is not a Token-2022 mint, so it cannot carry on-mint inscription fields.');
    let mint;
    try { mint = unpackMint(new PublicKey(address), { data: Buffer.from(account.data[0], 'base64'), owner: TOKEN_2022_PROGRAM_ID, executable: false, lamports: account.lamports }, TOKEN_2022_PROGRAM_ID); } catch { return invalid('This Token-2022 account is not a mint.'); }
    const raw = getExtensionData(ExtensionType.TokenMetadata, mint.tlvData);
    if (!raw) return invalid('This Token-2022 mint has no on-mint metadata extension.');
    const metadata = unpack(raw);
    const fields = Object.fromEntries(metadata.additionalMetadata);
    const nftMint = fields.inscription_nft_mint;
    if (!nftMint || !mintPattern.test(nftMint) || !/^[0-9a-f]{64}$/i.test(fields.image_sha256 || '')) return invalid('The mint carries no inscription binding fields (inscription_nft_mint, image_sha256).');
    const proof = await verifyMetaplex(nftMint);
    if (proof.status === 'unknown') return { status: 'unknown', message: proof.message };
    if (proof.status !== 'valid') return invalid(`The mint points to inscription NFT ${nftMint}, but it did not verify: ${proof.reason || proof.message}`);
    if (proof.hash !== fields.image_sha256.toLowerCase()) return invalid('The on-mint image_sha256 does not match the bytes read from the inscription.');
    if (fields.inscription_account && fields.inscription_account !== proof.root) return invalid('The on-mint inscription_account does not match the NFT’s inscription PDA.');
    if (fields.image_account && fields.image_account !== proof.imageAccount) return invalid('The on-mint image_account does not match the NFT’s image PDA.');
    const root = (await solanaRpc('getAccountInfo', [proof.root, { encoding: 'base64', commitment: 'finalized' }]))?.value;
    let named = null;
    try { named = JSON.parse(Buffer.from(root.data[0], 'base64').toString('utf8').replace(/\0+$/, '')); } catch { named = null; }
    if (named?.token_mint !== address) return invalid('The inscription metadata does not name this token, so the binding is only one-directional.');
    const authorities = { mintAuthority: authority(mint.mintAuthority), freezeAuthority: authority(mint.freezeAuthority), updateAuthority: authority(metadata.updateAuthority) };
    return { ...proof, status: 'valid', standard: 'Token-2022 bound inscription', tokenMint: address, nftMint, tokenName: metadata.name, tokenSymbol: metadata.symbol, fields, authorities, immutable: !authorities.mintAuthority && !authorities.freezeAuthority && !authorities.updateAuthority, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { status: 'unknown', message: error.message || 'Unable to check the Token-2022 binding right now.' };
  }
}