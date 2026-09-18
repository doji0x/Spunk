import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const PhantomWalletContext = createContext(null);
export const usePhantomWallet = () => useContext(PhantomWalletContext);

export default function PhantomWalletProvider({ children }) {
  const [address, setAddress] = useState('');
  const [network, setNetworkState] = useState(() => localStorage.getItem('validate:solana-network') || 'mainnet-beta');
  const [connecting, setConnecting] = useState(false);
  const provider = typeof window !== 'undefined' ? window.phantom?.solana : null;
  useEffect(() => {
    if (!provider?.isPhantom) return;
    const accountChanged = key => setAddress(key?.toString?.() || '');
    provider.connect({ onlyIfTrusted: true }).then(result => setAddress(result.publicKey.toString())).catch(() => {});
    provider.on('accountChanged', accountChanged); provider.on('disconnect', () => setAddress(''));
    return () => { provider.removeListener?.('accountChanged', accountChanged); };
  }, [provider]);
  async function connect() {
    if (!provider?.isPhantom) { window.open('https://phantom.app/', '_blank', 'noopener,noreferrer'); return; }
    setConnecting(true);
    try { const result = await provider.connect(); setAddress(result.publicKey.toString()); } finally { setConnecting(false); }
  }
  async function disconnect() { await provider?.disconnect?.(); setAddress(''); }
  function setNetwork(value) { localStorage.setItem('validate:solana-network', value); setNetworkState(value); }
  const value = useMemo(() => ({ address, network, setNetwork, connecting, provider, connect, disconnect }), [address, network, connecting, provider]);
  return <PhantomWalletContext.Provider value={value}>{children}</PhantomWalletContext.Provider>;
}