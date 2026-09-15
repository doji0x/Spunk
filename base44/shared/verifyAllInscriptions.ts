import { verifyInscription as verifyMetaplex } from './verifyInscription.ts';
import { findV1Inscription } from './v1Transaction.ts';

export async function verifyAllInscriptions(address) {
  if (typeof address !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(address)) {
    return { status: 'error', message: 'Enter a valid Solana mint address or transaction signature.' };
  }
  const [metaplex, v1] = await Promise.all([verifyMetaplex(address), findV1Inscription(address)]);
  const valid = metaplex.status === 'valid' || v1.status === 'valid';
  const unknown = metaplex.status === 'unknown' || v1.status === 'unknown';
  const primary = metaplex.status === 'valid' ? metaplex : v1.status === 'valid' ? v1 : {};
  return {
    ...primary,
    status: valid ? 'valid' : unknown ? 'unknown' : 'invalid',
    reason: !valid && !unknown ? 'No supported on-chain image inscription was found.' : undefined,
    message: !valid && unknown ? 'One or more inscription checks could not be completed.' : undefined,
    checks: { metaplex, v1 }
  };
}