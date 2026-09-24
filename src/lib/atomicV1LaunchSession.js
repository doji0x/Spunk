import { invariant } from '../../base44/shared/atomicV1Protocol.js';
import { newRecovery, readRecovery, writeRecovery } from './atomicV1Recovery.js';

/** Share initialization between the connection effect and the submit handler.
 * Never clear corrupt recovery or overwrite a newer preparation after awaiting a key.
 */
export function createLaunchSessionLoader(storage, getMint) {
  const pending = new Map();
  return function loadSession(address) {
    if (pending.has(address)) return pending.get(address);
    const work = (async () => {
      let saved = readRecovery(storage, address);
      if (!saved) saved = writeRecovery(storage, newRecovery(address));
      if (saved.coinMint) return saved;
      invariant(!saved.preparationRequested && !saved.id && !saved.signedTransactionBase64 && !saved.broadcastStarted,
        'The original launch mint is missing. Preserve the recovery data instead of replacing it.');
      const mint = await getMint(saved.requestId);
      const latest = readRecovery(storage, address);
      invariant(latest?.requestId === saved.requestId && latest.submitToken === saved.submitToken,
        'The saved launch changed while initializing. Reload its recovery record.');
      invariant(!latest.coinMint || latest.coinMint === mint.address, 'The saved mint changed while initializing.');
      return latest.coinMint ? latest : writeRecovery(storage, { ...latest, coinMint: mint.address });
    })();
    const result = work.finally(() => { if (pending.get(address) === result) pending.delete(address); });
    pending.set(address, result);
    return result;
  };
}
