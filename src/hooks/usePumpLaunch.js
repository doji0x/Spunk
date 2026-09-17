import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const storageKey = 'validate:pump-launch:v3';
const solMint = 'So11111111111111111111111111111111111111112';
const empty = { inscribedMint: '', name: '', symbol: '', quoteMint: solMint, firstBuyAmount: '', creatorFeePercent: '', holderReward: false, feeRecipients: [] };

export default function usePumpLaunch() {
  const [pointer, setPointer] = useState(() => JSON.parse(localStorage.getItem(storageKey) || 'null'));
  const [input, setInput] = useState(pointer?.input || empty);
  const [attempt, setAttempt] = useState(null);
  const [options, setOptions] = useState([]);
  const [settings, setSettings] = useState({ holderRewardEnabled: false, creatorFeeConfigurable: false, maxCreatorFeeBps: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = pointer?.requestId;
  useEffect(() => {
    let active = true;
    base44.functions.invoke('launchPumpCoin', { action: 'options' }).then(({ data }) => { if (active) { setOptions(data.pairs || []); setSettings(data); } }).catch(err => active && setError(err.response?.data?.error || 'Unable to load pump.fun launch options.')).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!requestId) return;
    let active = true;
    const load = () => base44.entities.LaunchAttempt.filter({ requestId }).then(([found]) => { if (active && found) setAttempt(found); });
    load();
    const timer = attempt?.status === 'pending' ? window.setInterval(load, 15000) : null;
    return () => { active = false; if (timer) window.clearInterval(timer); };
  }, [requestId, attempt?.status]);
  function savePointer(value) { setPointer(value); if (value) localStorage.setItem(storageKey, JSON.stringify(value)); else localStorage.removeItem(storageKey); }
  async function launch(event) {
    event?.preventDefault?.();
    if (busy || attempt?.status === 'confirmed') return;
    const current = { requestId: requestId || crypto.randomUUID(), input: attempt ? pointer.input : input };
    savePointer(current); setBusy(true); setError('');
    try { const { data } = await base44.functions.invoke('launchPumpCoin', { ...current.input, requestId: current.requestId }); if (data.attempt) setAttempt(data.attempt); if (data.error) throw new Error(data.error); }
    catch (err) { const details = err.response?.data || {}; if (details.attempt) setAttempt(details.attempt); setError(details.error || err.message || 'Unable to confirm the launch.'); if (details.inputError) savePointer(null); }
    finally { setBusy(false); }
  }
  async function configureSharing() {
    if (busy || !requestId) return;
    setBusy(true); setError('');
    try { const { data } = await base44.functions.invoke('launchPumpCoin', { action: 'configureSharing', requestId }); setAttempt(data.attempt); }
    catch (err) { setError(err.response?.data?.error || err.message || 'Unable to configure fee sharing.'); }
    finally { setBusy(false); }
  }
  function reset() { savePointer(null); setAttempt(null); setInput(empty); setError(''); }
  return { input, setInput, attempt, options, settings, loading, busy, error, launch, configureSharing, reset };
}