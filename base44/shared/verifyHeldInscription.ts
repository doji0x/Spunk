import { solanaRpc } from './solanaServices.ts';
import { verifyInscription as verifyMetaplex } from './verifyInscription.ts';

const tokenPrograms = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];

// A fungible token can prove an on-chain image by holding an inscribed NFT in a token account
// owned by its own mint address — an address nobody controls, so the link is permanent.
export async function verifyHeldInscription(address) {
  try {
    if (typeof address !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      return { status: 'invalid', reason: 'This check applies to a token mint address, not a transaction signature.' };
    }
    const results = await Promise.all(tokenPrograms.map(programId => solanaRpc('getTokenAccountsByOwner', [address, { programId }, { encoding: 'jsonParsed', commitment: 'finalized' }])));
    const held = [...new Set(results.flatMap(result => (result?.value || []).map(entry => entry.account?.data?.parsed?.info)).filter(info => info?.tokenAmount?.amount === '1' && info.tokenAmount.decimals === 0).map(info => info.mint))];
    if (!held.length) return { status: 'invalid', reason: 'This address does not hold any single-supply token that could carry an inscription.' };
    if (held.length > 10) return { status: 'unknown', message: 'This address holds too many tokens to check. Paste the held NFT mint address directly.' };
    const checks = await Promise.all(held.map(mint => verifyMetaplex(mint)));
    const index = checks.findIndex(check => check.status === 'valid');
    if (index === -1) {
      const unknown = checks.find(check => check.status === 'unknown');
      return unknown ? { status: 'unknown', message: unknown.message } : { status: 'invalid', reason: 'The tokens held by this address contain no supported on-chain image inscription.' };
    }
    return { ...checks[index], heldNft: held[index], heldBy: address, standard: 'Metaplex Inscription held by token address' };
  } catch (error) {
    return { status: 'unknown', message: error.message || 'Unable to check tokens held by this address right now.' };
  }
}