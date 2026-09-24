import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createWalletRegistry, enabledMethods, supportedMethods } from '@/lib/atomicV1WalletRegistry';
import { getInjectedPhantom, isPhantomRequest, phantomAddress, PHANTOM_REQUEST } from '@/lib/atomicV1PhantomRequest';
import { connectPhantomForLaunch, phantomAccount } from '@/lib/atomicV1LaunchConnection';
import { invariant, MAINNET } from '../../base44/shared/atomicV1Protocol.js';

const Context = createContext(null);
export const useAtomicV1Wallet = () => useContext(Context);
export default function AtomicV1WalletProvider({ children }) {
  const [wallets, setWallets] = useState([]), [phantom, setPhantom] = useState(null);
  const [selected, setSelected] = useState(null), [account, setAccount] = useState(null);
  const [preference, setPreference] = useState(''), [connecting, setConnecting] = useState(false), [error, setError] = useState('');
  const [config, setConfig] = useState({ enabled: false, phantomRequestEnabled: true, walletMethods: {}, firstBuyEnabled: true });
  const [configLoading, setConfigLoading] = useState(true);
  const current = useRef({ wallet: null, account: null, epoch: 0 }), connectionEpoch = useRef(0), discovered = useRef(null);
  const pendingConnection = useRef(null), mounted = useRef(true);
  const configRef = useRef(config), preferenceRef = useRef(preference);
  configRef.current = config; preferenceRef.current = preference;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; connectionEpoch.current++; current.current.epoch++; };
  }, []);
  const apply = useCallback((wallet, nextAccount) => {
    const same = current.current.wallet === wallet && current.current.account?.address === nextAccount?.address;
    current.current = { wallet, account: nextAccount, epoch: current.current.epoch + (same ? 0 : 1) };
    setSelected(wallet); setAccount(nextAccount);
  }, []);
  const reloadConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const { data } = await base44.functions.invoke('publicAtomicV1Launch', { action: 'config' });
      configRef.current = data; setConfig(data); setError('');
    } catch {
      // A config read failure is not a fabricated Phantom incompatibility. The
      // backend still enforces its real request policy when preparing.
      setError('Launch settings could not be read. A native Phantom request remains available; preparation will report any backend problem.');
    } finally { setConfigLoading(false); }
  }, []);
  const findPhantom = useCallback(() => {
    const provider = getInjectedPhantom(window);
    if (!provider) return null;
    if (discovered.current?.provider !== provider) {
      discovered.current = { name: 'Phantom', transport: PHANTOM_REQUEST, provider };
      setPhantom(discovered.current);
    }
    return discovered.current;
  }, []);
  useEffect(() => {
    const registry = createWalletRegistry(window);
    setWallets(registry.get());
    const off = registry.subscribe(setWallets);
    const detect = () => { findPhantom(); };
    detect();
    const interval = setInterval(detect, 750);
    window.addEventListener('focus', detect);
    return () => { clearInterval(interval); window.removeEventListener('focus', detect); off(); registry.dispose(); };
  }, [findPhantom]);
  useEffect(() => { reloadConfig(); }, [reloadConfig]);
  useEffect(() => {
    if (!selected) return undefined;
    if (isPhantomRequest(selected)) {
      const provider = selected.provider;
      const changed = publicKey => {
        if (!publicKey) { connectionEpoch.current++; apply(selected, null); return; }
        try { apply(selected, phantomAccount(provider)); } catch { apply(selected, null); }
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
  function selectedMethod(selection) {
    const allowed = enabledMethods(selection.wallet, selection.account, configRef.current);
    return allowed.includes(preferenceRef.current) ? preferenceRef.current : allowed[0] || '';
  }
  // Refs + the live provider are authoritative even before setState re-renders.
  function capture() {
    const snapshot = { ...current.current }, method = selectedMethod(snapshot);
    return { wallet: snapshot.wallet, account: snapshot.account, method,
      isCurrent: () => {
        if (!mounted.current || current.current.epoch !== snapshot.epoch || current.current.wallet !== snapshot.wallet ||
            current.current.account?.address !== snapshot.account?.address || selectedMethod(current.current) !== method) return false;
        if (!isPhantomRequest(snapshot.wallet)) return Boolean(snapshot.account);
        try {
          return getInjectedPhantom(window) === snapshot.wallet.provider && snapshot.wallet.provider.isConnected !== false &&
            phantomAddress(snapshot.wallet.provider) === snapshot.account?.address;
        } catch { return false; }
      },
    };
  }
  function connectWallet(wallet) {
    if (pendingConnection.current?.wallet === wallet) return pendingConnection.current.promise;
    const generation = ++connectionEpoch.current;
    setConnecting(true); setError('');
    const operation = { wallet, promise: null };
    operation.promise = (async () => {
      invariant(wallet, 'Phantom is not injected here. Open the published HTTPS app in Phantom, not an embedded preview.');
      let next;
      if (isPhantomRequest(wallet)) next = await connectPhantomForLaunch(wallet.provider);
      else {
        await wallet.features['standard:connect'].connect();
        next = wallet.accounts.find(item => item.chains.includes(MAINNET));
      }
      invariant(next, 'No connected Solana account was returned.');
      invariant(mounted.current && generation === connectionEpoch.current, 'Wallet connection was cancelled or replaced. No transaction was prepared.');
      apply(wallet, next); preferenceRef.current = ''; setPreference('');
      return capture();
    })().finally(() => {
      if (pendingConnection.current === operation) pendingConnection.current = null;
      if (mounted.current && generation === connectionEpoch.current) setConnecting(false);
    });
    pendingConnection.current = operation;
    return operation.promise;
  }
  // The optional Connect button handles its own error display. Launch uses the
  // throwing/returning API below, never this React-state-only side effect.
  async function connect(wallet = null) {
    try { return await connectWallet(wallet || findPhantom()); }
    catch (reason) { if (mounted.current) setError(reason.message || 'Wallet connection failed.'); return null; }
  }
  async function ensureLaunchWallet() {
    const existing = capture();
    if (existing.account && existing.method && existing.isCurrent()) return existing;
    const selectedWallet = current.current.wallet;
    // Do not silently substitute Phantom for an explicitly selected other wallet.
    if (selectedWallet && !isPhantomRequest(selectedWallet) && selectedWallet.name !== 'Phantom') {
      const resolved = await connectWallet(selectedWallet);
      invariant(resolved.method, 'The selected wallet has no enabled transaction signing method.');
      return resolved;
    }
    invariant(configRef.current.phantomRequestEnabled !== false, 'Native Phantom requests were explicitly disabled by the operator.');
    const resolved = await connectWallet(findPhantom()); // Detect again at click time, not just on the polling interval.
    invariant(resolved.isCurrent(), 'Phantom changed accounts while connecting. No transaction was prepared.');
    return resolved;
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
    methods, method, nativeRequest, canLaunch: Boolean(account && method), supportedMethods, connect, disconnect, selectAccount, reloadConfig, ensureLaunchWallet,
    setMethod(next) { current.current.epoch++; preferenceRef.current = next; setPreference(next); },
    capture,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
