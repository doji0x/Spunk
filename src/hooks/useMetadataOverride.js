import { useState } from 'react';
import { base44 } from '@/api/base44Client';

const invoke = payload => base44.functions.invoke('overrideLaunchMetadata', payload);
const emptyFields = { name: '', symbol: '', description: '', imageUrl: '', imageMime: '' };
const message = reason => reason.response?.data?.error || reason.message || 'The override could not be saved.';
const toFields = override => ({ ...emptyFields, ...(override ? { name: override.name, symbol: override.symbol, description: override.description, imageUrl: override.imageUrl, imageMime: override.imageMime } : {}) });

// Off-chain served override: nothing is written to Solana, and every change is audited.
export default function useMetadataOverride() {
  const [fields, setFields] = useState(emptyFields);
  const [launch, setLaunch] = useState(null);
  const [override, setOverride] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState('');

  const update = (key, value) => { setFields(current => ({ ...current, [key]: value })); setSaved(''); setError(''); };

  async function lookup(coinMint) {
    setBusy(true); setError(''); setSaved(''); setLaunch(null);
    try {
      const { data } = await invoke({ action: 'lookup', coinMint });
      setLaunch(data); setOverride(data.override); setHistory(data.history || []); setFields(toFields(data.override));
      return data;
    } catch (reason) { setError(message(reason)); return null; }
    finally { setBusy(false); }
  }

  async function save(coinMint) {
    setBusy(true); setError(''); setSaved('');
    try {
      const { data } = await invoke({ action: 'set', coinMint, ...fields });
      setOverride(data.override); setHistory(data.history || []); setFields(toFields(data.override)); setSaved('Override saved — terminals refresh within about a minute.');
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  async function clear(coinMint) {
    setBusy(true); setError(''); setSaved('');
    try {
      const { data } = await invoke({ action: 'clear', coinMint });
      setOverride(null); setHistory(data.history || []); setFields(emptyFields); setSaved('Override cleared — the inscribed values are served again.');
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  return { fields, update, launch, override, history, busy, error, saved, lookup, save, clear };
}