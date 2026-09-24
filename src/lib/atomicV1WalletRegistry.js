import { isPhantomRequest } from './atomicV1PhantomRequest.js';

/** Wallet Standard registration remains separate from the injected Phantom
 * request transport. We never invent supportedTransactionVersions for a wallet.
 */
export function createWalletRegistry(target) {
  const wallets = new Set(), listeners = new Set();
  let disposed = false;
  const notify = () => { for (const listener of listeners) listener([...wallets]); };
  const register = (...items) => {
    if (disposed) return () => {};
    const added = items.filter(wallet => wallet && !wallets.has(wallet) && Array.isArray(wallet.chains) &&
      wallet.chains.some(chain => chain.startsWith('solana:')) && wallet.features?.['standard:connect']);
    for (const wallet of added) wallets.add(wallet);
    notify();
    return () => { for (const wallet of added) wallets.delete(wallet); notify(); };
  };
  const api = Object.freeze({ register });
  const receive = event => {
    if (typeof event.detail === 'function') {
      try { event.detail(api); } catch { /* Other extensions can still register. */ }
    }
  };
  target?.addEventListener('wallet-standard:register-wallet', receive);
  if (target) target.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
  return { get: () => [...wallets],
    subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    dispose() { disposed = true; target?.removeEventListener('wallet-standard:register-wallet', receive); listeners.clear(); wallets.clear(); },
  };
}
export const NATIVE_METHODS = ['signTransaction', 'signAndSendTransaction'];
/** Available app routes, not a claim that Phantom accepts the V1 wire format. */
export function supportedMethods(wallet, account = null) {
  if (isPhantomRequest(wallet)) return ['signTransaction'];
  return NATIVE_METHODS.filter(method => {
    const name = `solana:${method}`, feature = wallet?.features?.[name];
    return feature?.supportedTransactionVersions?.includes(1) && typeof feature[method] === 'function' &&
      (!account || (account.features?.includes(name) && account.chains?.includes('solana:mainnet')));
  });
}
export function enabledMethods(wallet, account, config) {
  if (!wallet || !account) return [];
  // Explicit native requests are attempted even when Wallet Standard advertises
  // only legacy/V0. Phantom, not a guessed app capability, decides acceptance.
  if (isPhantomRequest(wallet)) return config?.phantomRequestEnabled === false ? [] : ['signTransaction'];
  if (!config?.enabled) return [];
  const approved = config.walletMethods?.[wallet.name] || config.walletMethods?.['*'] || [];
  return supportedMethods(wallet, account).filter(method => approved.includes(method));
}
