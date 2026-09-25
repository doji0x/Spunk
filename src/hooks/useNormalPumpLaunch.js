import { useEffect, useRef, useState } from 'react';
import { usePhantomWallet } from '@/contexts/PhantomWalletContext';
import { executeNormalLaunch, initialNormalInput, invokeNormal, normalStorageKey, saveNormal, uploadNormalDraft } from '@/lib/normalPumpLaunch';

export default function useNormalPumpLaunch() {
  const wallet = usePhantomWallet(), lock = useRef(false), mounted = useRef(true), addressRef = useRef(wallet.address); addressRef.current = wallet.address;
  const [input, setInput] = useState(initialNormalInput), [file, setFile] = useState(null), [attempts, setAttempts] = useState([]);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(''), [stage, setStage] = useState('');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const persist = attempt => { saveNormal(attempt); if (mounted.current && addressRef.current === attempt.walletAddress) setAttempts(rows => [attempt, ...rows.filter(row => row.requestId !== attempt.requestId)]); return attempt; };
  useEffect(() => {
    let active = true; setAttempts([]); setError(''); if (!wallet.address) { setLoading(false); return; } setLoading(true);
    const load = async () => {
      const raw = localStorage.getItem(normalStorageKey(wallet.address)), local = raw ? JSON.parse(raw) : null;
      if (active && local) setAttempts([local]);
      const data = await invokeNormal({ action: 'resume', launchMode: 'normal', walletAddress: wallet.address });
      if (active) setAttempts(local ? [local, ...data.attempts.filter(row => row.requestId !== local.requestId)] : data.attempts);
    };
    load().catch(reason => active && setError(reason.response?.data?.error || reason.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [wallet.address]);
  async function guarded(task) {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    const run = async () => { if (wallet.network !== 'mainnet-beta') throw new Error('Switch to Mainnet to launch.'); await task(); };
    try { if (navigator.locks && wallet.address) await navigator.locks.request(`validate:normal-pump:${wallet.address}`, { ifAvailable: true }, async lease => { if (!lease) throw new Error('Another tab is handling this wallet’s launch. Return to that tab.'); await run(); }); else await run(); }
    catch (reason) { if (mounted.current) setError(reason.response?.data?.error || reason.message || 'Unable to complete the launch.'); }
    finally { lock.current = false; if (mounted.current) { setBusy(false); setStage(''); } }
  }
  async function checkSaved(saved) {
    const data = await invokeNormal({ action: 'checkNormal', requestId: saved.requestId, walletAddress: saved.walletAddress, signature: saved.signature });
    return persist(data.attempt ? { ...saved, ...data.attempt, status: data.attempt.status === 'prepared' && saved.signature ? 'pending' : data.attempt.status } : { ...saved, status: saved.signature ? 'pending' : 'draft' });
  }
  async function run(saved) {
    saved = await executeNormalLaunch(saved, wallet, persist, setStage);
    for (let i = 0; i < 12 && saved.status === 'pending' && mounted.current; i++) { setStage('Waiting for on-chain confirmation…'); await new Promise(resolve => setTimeout(resolve, 2500)); saved = await checkSaved(saved); }
  }
  const launch = event => { event.preventDefault(); return guarded(async () => {
    if (!wallet.address) { await wallet.connect(); return; }
    if (attempts.some(row => row.status !== 'confirmed')) throw new Error('Finish your saved launch first.');
    const saved = await uploadNormalDraft(input, file, wallet.address, setStage); persist(saved); await run(saved);
  }); };
  const check = saved => guarded(async () => { setStage('Checking the saved coin on-chain…'); await checkSaved(saved); });
  const resume = saved => guarded(async () => { if (wallet.address !== saved.walletAddress) throw new Error('Connect the original wallet.'); const checked = await checkSaved(saved); if (checked.status === 'confirmed') return; if (checked.status === 'pending') throw new Error('Still awaiting confirmation. Keep this launch and check again.'); await run(checked); });
  return { wallet, input, setInput, file, setFile, attempts, busy, loading, error, stage, launch, check, resume };
}