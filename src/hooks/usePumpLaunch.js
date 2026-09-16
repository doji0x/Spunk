import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const storageKey = 'validate:pump-launch:v2';
const empty = { inscribedMint: '', name: '', symbol: '' };

export default function usePumpLaunch() {
  const [pointer, setPointer] = useState(() => JSON.parse(localStorage.getItem(storageKey) || 'null'));
  const [input, setInput] = useState(pointer?.input || empty);
  const [attempt, setAttempt] = useState(null);
  const [loading, setLoading] = useState(Boolean(pointer));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = pointer?.requestId;
  // The saved record is the source of truth; localStorage only remembers which launch this browser started.
  useEffect(() => {
    if (!requestId) return;
    let active = true;
    const load = () => base44.entities.LaunchAttempt.filter({ requestId }).then(([found]) => { if (active && found) setAttempt(found); }).finally(() => active && setLoading(false));
    load();
    const timer = window.setInterval(() => { if (attempt?.status === 'pending') load(); }, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [requestId, attempt?.status]);
  function savePointer(value) {
    setPointer(value);
    if (value) localStorage.setItem(storageKey, JSON.stringify(value));
    else localStorage.removeItem(storageKey);
  }
  async function launch(event) {
    event?.preventDefault?.();
    if (busy || attempt?.status === 'confirmed') return;
    const current = { requestId: requestId || crypto.randomUUID(), input: attempt ? pointer.input : input };
    savePointer(current);
    setBusy(true);
    setError('');
    try {
      const { data } = await base44.functions.invoke('launchPumpCoin', { ...current.input, requestId: current.requestId });
      if (data.attempt) setAttempt(data.attempt);
      if (data.error) throw Object.assign(new Error(data.error), { details: data });
    } catch (err) {
      const details = err.response?.data || err.details || {};
      if (details.attempt) setAttempt(details.attempt);
      setError(details.error || err.message || 'Unable to confirm the launch. Resume to check its status.');
      // Only genuine input mistakes discard the request; verification or gateway hiccups keep the same coin mint.
      if (details.inputError === true) savePointer(null);
    } finally { setBusy(false); }
  }
  function reset() { savePointer(null); setAttempt(null); setInput(empty); setError(''); }
  return { input, setInput, attempt, loading, busy, error, launch, reset };
}