import { verifyInscription as verifyMetaplex } from './verifyInscription.ts';
import { findV1Inscription } from './v1Transaction.ts';
import { verifyLibreplex } from './verifyLibreplex.ts';
import { verifyHeldInscription } from './verifyHeldInscription.ts';

export async function verifyAllInscriptions(address) {
  if (typeof address !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(address)) {
    return { status: 'error', message: 'Enter a valid Solana mint address or transaction signature.' };
  }
  const [metaplex, v1, libreplex, held] = await Promise.all([verifyMetaplex(address), findV1Inscription(address), verifyLibreplex(address), verifyHeldInscription(address)]);
  const all = [metaplex, v1, libreplex, held];
  const valid = all.some(check => check.status === 'valid');
  const unknown = all.some(check => check.status === 'unknown');
  const primary = metaplex.status === 'valid' ? metaplex : libreplex.status === 'valid' ? libreplex : v1.status === 'valid' ? v1 : held.status === 'valid' ? held : {};
  return {
    ...primary,
    status: valid ? 'valid' : unknown ? 'unknown' : 'invalid',
    reason: !valid && !unknown ? 'No supported on-chain image inscription was found.' : undefined,
    message: !valid && unknown ? 'One or more inscription checks could not be completed.' : undefined,
    checks: { metaplex, v1, libreplex, held }
  };
}