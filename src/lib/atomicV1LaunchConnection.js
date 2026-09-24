import { base58Decode, invariant, MAINNET } from '../../base44/shared/atomicV1Protocol.js';
import { phantomAddress } from './atomicV1PhantomRequest.js';
import atomicV1Timeout from './atomicV1Timeout.js';

export function phantomAccount(provider) {
  const address = phantomAddress(provider);
  return { address, publicKey: base58Decode(address), chains: [MAINNET] };
}

/** Called from the launch click, before storage locks or network preparation.
 * The returned account is usable immediately; React state is not the result.
 * Connection approval is distinct from the later transaction signature approval.
 */
export async function connectPhantomForLaunch(provider) {
  invariant(provider?.isPhantom && typeof provider.request === 'function',
    'Phantom is not available here. Open the published HTTPS app in Phantom\'s browser or a browser with its extension.');
  if (provider.isConnected === true && provider.publicKey) return phantomAccount(provider);
  let disconnected = false;
  const onDisconnect = () => { disconnected = true; };
  provider.on?.('disconnect', onDisconnect);
  try {
    let response;
    try {
      response = await atomicV1Timeout(
        typeof provider.connect === 'function' ? provider.connect() : provider.request({ method: 'connect' }),
        60000, 'Phantom connection timed out after 60 seconds. Check Phantom for a pending connection request before trying again.',
        'wallet-connection');
    } catch (reason) {
      throw Object.assign(new Error(typeof reason?.message === 'string' ? reason.message : String(reason)),
        { source: 'phantom', stage: 'wallet-connection', code: reason?.code, cause: reason });
    }
    invariant(!disconnected && provider.isConnected !== false, 'Phantom disconnected while connecting. No transaction was prepared.');
    const account = phantomAccount(provider);
    if (response?.publicKey) {
      invariant(phantomAddress(response) === account.address, 'The Phantom account changed during connection. Try again with the intended account.');
    }
    return account;
  } finally {
    provider.removeListener?.('disconnect', onDisconnect);
  }
}