import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createWalletRegistry, enabledMethods, supportedMethods } from '@/lib/atomicV1WalletRegistry';

const Context = createContext(null);
export const useAtomicV1Wallet = () => useContext(Context);
export default function AtomicV1WalletProvider({ children }) {
  const [wallets, setWallets] = useState([]), [selected, setSelected] = useState(null), [account, setAccount] = useState(null);
  const [preference, setPreference] = useState(''), [connecting, setConnecting] = useState(false), [error, setError] = useState('');
  const [config, setConfig] = useState({ enabled: false, walletMethods: {}, firstBuyEnabled: false });
  const [configLoading, setConfigLoading] = useState(true);
  const current = useRef({ wallet: null, account: null, epoch: 0 });
  const apply = useCallback((wallet, nextAccount) => {
    current.current = { wallet, account: nextAccount, epoch: current.current.epoch + 1 };
    setSelected(wallet); setAccount(nextAccount);
  }, []);
  const reloadConfig = useCallback(async () => {
    setConfigLoading(true);
    try { const { data } = await base44.functions.invoke('publicAtomicV1Launch', { action: 'config' }); setConfig(data); }
    catch { setConfig({ enabled: false, walletMethods: {}, firstBuyEnabled: false }); setError('Unable to read launch availability. Recovery and history are still available.'); }
    finally { setConfigLoading(false); }
  }, []);
  useEffect(() => {
    const registry = createWalletRegistry(window);
    setWallets(registry.get());
    const off = registry.subscribe(setWallets);
    return () => { off(); registry.dispose(); };
  }, []);
  useEffect(() => { reloadConfig(); }, [reloadConfig]);
  useEffect(() => {
    if (!selected) return undefined;
    const events = selected.features['standard:events'];
    const off = events?.on('change', () => {
      const old = current.current.account;
      const next = selected.accounts.find(item => item.address === old?.address && item.chains.includes('solana:mainnet')) || null;
      apply(selected, next);
    });
    return () => { off?.(); };
  }, [selected, apply]);
  async function connect(wallet) {
    setConnecting(true); setError('');
    try {
      await wallet.features['standard:connect'].connect();
      const next = wallet.accounts.find(item => item.chains.includes('solana:mainnet'));
      if (!next) throw new Error('This wallet has no connected Solana mainnet account.');
      apply(wallet, next); setPreference('');
    } catch (reason) { setError(reason.message || 'Wallet connection failed.'); }
    finally { setConnecting(false); }
  }
  async function disconnect() {
    const wallet = current.current.wallet;
    apply(null, null);
    try { await wallet?.features['standard:disconnect']?.disconnect(); } catch { /* Local selection is already cleared. */ }
  }
  function selectAccount(address) {
    const next = selected?.accounts.find(item => item.address === address && item.chains.includes('solana:mainnet'));
    if (next) apply(selected, next);
  }
  const methods = enabledMethods(selected, account, config);
  const method = methods.includes(preference) ? preference : methods[0] || '';
  const value = { wallets, selected, account, address: account?.address || '', config, configLoading, connecting, error,
    methods, method, supportedMethods, connect, disconnect, selectAccount, reloadConfig,
    setMethod(next) { current.current.epoch++; setPreference(next); },
    capture() {
      const snapshot = { ...current.current };
      return { wallet: snapshot.wallet, account: snapshot.account, method,
        isCurrent: () => current.current.epoch === snapshot.epoch && current.current.wallet === snapshot.wallet &&
          current.current.account?.address === snapshot.account?.address };
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
