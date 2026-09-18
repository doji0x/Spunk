import { verifyInscription as verifyMetaplex } from './verifyInscription.ts';
import { findV1Inscription } from './v1Transaction.ts';
import { verifyLibreplex } from './verifyLibreplex.ts';
import { verifyHeldInscription } from './verifyHeldInscription.ts';
import { verifyUriLinkedInscription } from './verifyUriLinkedInscription.ts';

export async function verifyAllInscriptions(address) {
  if (typeof address !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(address)) {
    return { status: 'error', message: 'Enter a valid Solana mint address or transaction signature.' };
  }
  const [metaplex, v1, libreplex, held, uriLinked] = await Promise.all([verifyMetaplex(address), findV1Inscription(address), verifyLibreplex(address), verifyHeldInscription(address), verifyUriLinkedInscription(address)]);
  const all = [metaplex, v1, libreplex, held, uriLinked];
  // Mint-address V1 results are valid only when the mint signed the exact
  // VALIDATE v1 payload that commits to the image hash.
  const v1Trusted = address.length > 44 || (v1.status === 'valid' && v1.commitment === 'VALIDATE-v1' && v1.mintAuthorized === true && v1.mint === address);
  const valid = metaplex.status === 'valid' || libreplex.status === 'valid' || held.status === 'valid' || uriLinked.status === 'valid' || v1Trusted;
  const unknown = all.some(check => check.status === 'unknown');
  const primary = metaplex.status === 'valid' ? 'metaplex' : libreplex.status === 'valid' ? 'libreplex' : v1Trusted ? 'v1' : held.status === 'valid' ? 'held' : uriLinked.status === 'valid' ? 'uriLinked' : null;
  return {
    status: valid ? 'valid' : unknown ? 'unknown' : 'invalid',
    primary,
    reason: !valid && !unknown ? 'No supported on-chain media inscription was found.' : undefined,
    message: !valid && unknown ? 'One or more inscription checks could not be completed.' : undefined,
    checks: { metaplex, v1, libreplex, held, uriLinked }
  };
}