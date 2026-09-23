/** Minimal Wallet Standard discovery transport. No provider shims or SDK/CDN.
 * Implements the same two-way registration contract as @wallet-standard/app:
 * https://github.com/wallet-standard/wallet-standard/blob/master/packages/core/app/src/wallets.ts
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
      try { event.detail(api); } catch { /* One broken extension must not prevent other registrations. */ }
    }
  };
  target?.addEventListener('wallet-standard:register-wallet', receive);
  if (target) target.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
  return {
    get: () => [...wallets],
    subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    dispose() { disposed = true; target?.removeEventListener('wallet-standard:register-wallet', receive); listeners.clear(); wallets.clear(); },
  };
}
export const NATIVE_METHODS = ['signTransaction', 'signAndSendTransaction'];
export function supportedMethods(wallet, account = null) {
  return NATIVE_METHODS.filter(method => {
    const name = `solana:${method}`, feature = wallet?.features?.[name];
    return feature?.supportedTransactionVersions?.includes(1) && typeof feature[method] === 'function' &&
      (!account || (account.features?.includes(name) && account.chains?.includes('solana:mainnet')));
  });
}
export function enabledMethods(wallet, account, config) {
  if (!config?.enabled || !wallet || !account) return [];
  const approved = config.walletMethods?.[wallet.name] || config.walletMethods?.['*'] || [];
  return supportedMethods(wallet, account).filter(method => approved.includes(method));
}