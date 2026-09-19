import { useState } from 'react';
import { base44 } from '@/api/base44Client';

const invoke = payload => base44.functions.invoke('updateLaunchLinks', payload);
const emptyLinks = { website: '', twitter: '', github: '' };
const message = reason => reason.response?.data?.error || reason.message || 'The links could not be saved.';

// Two authorization paths share one endpoint: a wallet signature for the launcher,
// the admin session for admins. No on-chain transaction is involved either way.
export default function useLaunchLinks(initial = emptyLinks) {
  const [links, setLinks] = useState({ ...emptyLinks, ...initial });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const update = (key, value) => { setLinks(current => ({ ...current, [key]: value })); setSaved(false); setError(''); };

  async function saveAsWallet(wallet, coinMint) {
    setBusy(true); setError(''); setSaved(false);
    try {
      const { data: issued } = await invoke({ action: 'nonce', walletAddress: wallet.address });
      const payload = JSON.stringify({ action: 'updateLaunchLinks', timestamp: Date.now(), nonce: issued.nonce, data: { walletAddress: wallet.address, coinMint, ...links } });
      const signed = await wallet.provider.signMessage(new TextEncoder().encode(payload), 'utf8');
      const signature = btoa(String.fromCharCode(...signed.signature));
      const { data } = await invoke({ action: 'update', message: payload, signature });
      setLinks(data.socials); setSaved(true);
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  async function saveAsAdmin(coinMint) {
    setBusy(true); setError(''); setSaved(false);
    try {
      const { data } = await invoke({ action: 'update', coinMint, ...links });
      setLinks(data.socials); setSaved(true);
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  async function lookup(coinMint) {
    setBusy(true); setError(''); setSaved(false);
    try {
      const { data } = await invoke({ action: 'lookup', coinMint });
      setLinks(data.socials);
      return data;
    } catch (reason) { setError(message(reason)); return null; }
    finally { setBusy(false); }
  }

  return { links, setLinks, update, busy, error, saved, saveAsWallet, saveAsAdmin, lookup };
}