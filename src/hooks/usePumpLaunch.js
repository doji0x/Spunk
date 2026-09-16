import { useState } from 'react';
import { base44 } from '@/api/base44Client';

const storageKey = 'validate:pump-launch:v1';
const empty = { inscribedMint: '', name: '', symbol: '' };
export default function usePumpLaunch() {
  const [attempt, setAttempt] = useState(() => JSON.parse(localStorage.getItem(storageKey) || 'null'));
  const [input, setInput] = useState(attempt?.input || empty);
  const [result, setResult] = useState(attempt?.result || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function save(value) {
    setAttempt(value);
    if (value) localStorage.setItem(storageKey, JSON.stringify(value));
    else localStorage.removeItem(storageKey);
  }
  async function launch(event) {
    event.preventDefault();
    if (busy || result) return;
    const current = attempt || { input, requestId: crypto.randomUUID() };
    save(current);
    setBusy(true);
    setError('');
    try {
      const { data } = await base44.functions.invoke('launchPumpCoin', { ...current.input, requestId: current.requestId });
      if (data.error) throw new Error(data.error);
      if (data.confirmed) { setResult(data); save({ ...current, result: data }); }
      else setError('Confirmation is still pending. Resume this same launch to check again; do not start a second launch.');
    } catch (err) {
      const details = err.response?.data;
      setError(details?.error || err.message || 'Unable to confirm the launch. Resume to check its status.');
      if (details?.safeToEdit === true) save(null);
    } finally { setBusy(false); }
  }
  function reset() { save(null); setInput(empty); setResult(null); setError(''); }
  return { input, setInput, result, busy, error, attempt, launch, reset };
}