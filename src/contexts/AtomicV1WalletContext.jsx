import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createWalletRegistry, enabledMethods, supportedMethods } from '@/lib/atomicV1WalletRegistry';
import { getInjectedPhantom, isPhantomRequest, phantomAddress, PHANTOM_REQUEST } from '@/lib/atomicV1PhantomRequest';
import { base58Decode, MAINNET } from '../../base44/shared/atomicV1Protocol.js';

const Context = createContext(null);
export const useAtomicV1Wallet = () => useContext(Context);
function injectedAccount(provider) {
  const address = phantomAddress(provider);
  return { address, publicKey: base58Decode(address), chains: [MAINNET] };
}
export default function AtomicV1WalletProvider({ children }) {
  const [wallets, setWallets] = useState([]), [phantom, setPhantom] = useState(null);
  const [selected, setSelected] = useState(null), [account, setAccount] = useState(null);
  const [preference, setPreference] = useState(''), [connecting, setConnecting] = useState(false), [error, setError] = useState('');
  const [config, setConfig] = useState({ enabled: false, phantomRequestEnabled: true, walletMethods: {}, firstBuyEnabled: true });
  const [configLoading, setConfigLoading] = useState(true);
  const current = useRef({ wallet: null, account: null, epoch: 0 }), connectionEpoch = useRef(0), discovered = useRef(null);
  const apply = useCallback((wallet, nextAccount) => {
    current.current = { wallet, account: nextAccount, epoch: current.current.epoch + 1 };
    setSelected(wallet); setAccount(nextAccount);
  }, []);
  const reloadConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const { data } = await base44.functions.invoke('publicAtomicV1Launch', { action: 'config' });
      setConfig(data); setError('');
    } catch {
      // A config read failure is not a fabricated Phantom incompatibility. The
      // backend still enforces its real request policy when preparing.
      setError('Launch settings could not be read. A native Phantom request remains available; preparation will report any backend problem.');
    } finally { setConfigLoading(false); }
  }, []);
  useEffect(() => {
    const registry = createWalletRegistry(window);
    setWallets(registry.get());
    const off = registry.subscribe(setWallets);
    const detect = () => {
      const provider = getInjectedPhantom(window);
      if (provider && discovered.current?.provider !== provider) {
        discovered.current = { name: 'Phantom', transport: PHANTOM_REQUEST, provider };
        setPhantom(discovered.current);
      }
    };
    detect();
    const interval = setInterval(detect, 750);
    window.addEventListener('focus', detect);
    return () => { clearInterval(interval); window.removeEventListener('focus', detect); off(); registry.dispose(); };
  }, []);
  useEffect(() => { reloadConfig(); }, [reloadConfig]);
  useEffect(() => {
    if (!selected) return undefined;
    if (isPhantomRequest(selected)) {
      const provider = selected.provider;
      const changed = () => {
        try { apply(selected, injectedAccount(provider)); } catch { apply(selected, null); }
      };
      const disconnected = () => { connectionEpoch.current++; apply(selected, null); };
      provider.on?.('accountChanged', changed); provider.on?.('disconnect', disconnected);
      return () => { provider.removeListener?.('accountChanged', changed); provider.removeListener?.('disconnect', disconnected); };
    }
    const off = selected.features?.['standard:events']?.on('change', () => {
      const old = current.current.account;
      const next = selected.accounts.find(item => item.address === old?.address && item.chains.includes(MAINNET)) || null;
      apply(selected, next);
    });
    return () => { off?.(); };
  }, [selected, apply]);
  async function connect(wallet = phantom) {
    const generation = ++connectionEpoch.current;
    setConnecting(true); setError('');
    try {
      if (!wallet) throw new Error('Phantom is not injected here. Open the published HTTPS site in Phantom\'s in-app browser or a browser with its extension, not an embedded preview.');
      let next;
      if (isPhantomRequest(wallet)) {
        await wallet.provider.connect(); next = injectedAccount(wallet.provider);
      } else {
        await wallet.features['standard:connect'].connect();
        next = wallet.accounts.find(item => item.chains.includes(MAINNET));
      }
      if (!next) throw new Error('No connected Solana account was returned.');
      if (generation === connectionEpoch.current) { apply(wallet, next); setPreference(''); }
    } catch (reason) { if (generation === connectionEpoch.current) setError(reason.message || 'Wallet connection failed.'); }
    finally { if (generation === connectionEpoch.current) setConnecting(false); }
  }
  async function disconnect() {
    const wallet = current.current.wallet;
    connectionEpoch.current++; setConnecting(false); apply(null, null);
    try {
      if (isPhantomRequest(wallet)) await wallet.provider.disconnect();
      else await wallet?.features['standard:disconnect']?.disconnect();
    } catch { /* Local selection is already cleared. */ }
  }
  function selectAccount(address) {
    if (isPhantomRequest(selected)) return;
    const next = selected?.accounts.find(item => item.address === address && item.chains.includes(MAINNET));
    if (next) apply(selected, next);
  }
  const methods = enabledMethods(selected, account, config);
  const method = methods.includes(preference) ? preference : methods[0] || '';
  const nativeRequest = isPhantomRequest(selected);
  const value = { wallets, phantom, selected, account, address: account?.address || '', config, configLoading, connecting, error,
    methods, method, nativeRequest, canLaunch: Boolean(account && method), supportedMethods, connect, disconnect, selectAccount, reloadConfig,
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
