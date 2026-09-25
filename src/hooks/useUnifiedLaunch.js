import { useEffect, useRef, useState } from 'react';
import { usePhantomWallet } from '@/contexts/PhantomWalletContext';
import { hasLaunchMintKey } from '@/lib/launchMintKey';
import { initialLaunchInput, invokeLaunch, readLaunches, persistLaunch, createLaunchDraft, launchParams, normalizeLaunch } from '@/lib/unifiedLaunch';
import { checkLaunch, executeLaunch, configureLaunchRewards, waitForLaunch } from '@/lib/launchExecution';

export default function useUnifiedLaunch() {
  const wallet = usePhantomWallet(), lock = useRef(false), alive = useRef(true), addressRef = useRef(wallet.address);
  addressRef.current = wallet.address;
  const [input, setInput] = useState(initialLaunchInput), [file, setFile] = useState(null), [attempts, setAttempts] = useState([]);
  const [settings, setSettings] = useState({ pairs: [] }), [optionsLoading, setOptionsLoading] = useState(true), [historyLoading, setHistoryLoading] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [stage, setStage] = useState(''), [preflight, setPreflight] = useState(null), [result, setResult] = useState(null), [recovery, setRecovery] = useState(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const persist = row => {
    persistLaunch(row);
    if (alive.current && addressRef.current === row.walletAddress) {
      setAttempts(current => row.status === 'confirmed' ? current.filter(item => item.requestId !== row.requestId) : [row, ...current.filter(item => item.requestId !== row.requestId)]);
      if (row.status !== 'draft' && (row.signature || row.status === 'confirmed')) setResult(row);
    }
    return row;
  };
  useEffect(() => {
    let active = true;
    invokeLaunch({ action: 'options' }).then(data => {
      if (!active) return;
      setSettings(data);
      setInput(current => ({ ...current, quoteMint: data.pairs?.some(pair => pair.mint === current.quoteMint) ? current.quoteMint : data.pairs?.[0]?.mint || '' }));
    }).catch(reason => active && setError(reason.response?.data?.error || reason.message)).finally(() => active && setOptionsLoading(false));
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true; setAttempts([]); setResult(null); setRecovery(null);
    if (!wallet.address) { setHistoryLoading(false); return; }
    setHistoryLoading(true);
    const load = async () => {
      const local = readLaunches(wallet.address);
      if (active) { setAttempts(local.filter(row => row.status !== 'confirmed')); setResult(local.find(row => row.status === 'confirmed') || null); }
      const data = await invokeLaunch({ action: 'resume', walletAddress: wallet.address });
      const remote = data.attempts || [];
      const merged = remote.map(row => { const cached = local.find(item => item.requestId === row.requestId); return { ...cached, ...row, signature: row.signature || cached?.signature || '' }; });
      if (active) setAttempts([...merged, ...local.filter(row => row.status !== 'confirmed' && !remote.some(item => item.requestId === row.requestId))]);
    };
    load().catch(reason => active && setError(reason.response?.data?.error || reason.message)).finally(() => active && setHistoryLoading(false));
    return () => { active = false; };
  }, [wallet.address]);
  const guarded = async task => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const owner = wallet.address;
    const run = async () => { if (wallet.network !== 'mainnet-beta') throw new Error('Switch to Mainnet to continue.'); await task(); };
    try {
      if (navigator.locks && owner) await navigator.locks.request(`curated:launch:${owner}`, { ifAvailable: true }, async lease => { if (!lease) throw new Error('Another tab is handling this wallet’s launch. Return to that tab.'); await run(); });
      else await run();
    } catch (reason) { if (alive.current && addressRef.current === owner) setError(reason.response?.data?.error || reason.message || 'Unable to complete this launch.'); }
    finally { lock.current = false; if (alive.current) { setBusy(false); setStage(''); } }
  };
  async function run(saved) {
    saved = await executeLaunch(saved, wallet, persist, setStage, setPreflight);
    for (let i = 0; i < 12 && saved.status === 'pending' && alive.current && addressRef.current === saved.walletAddress; i++) { setStage('Waiting for on-chain confirmation…'); await waitForLaunch(); saved = await checkLaunch(saved, persist); }
    if (saved.status === 'confirmed') {
      setRecovery(null);
      if (alive.current && addressRef.current === saved.walletAddress) await configureLaunchRewards(saved, wallet, persist, setStage);
    }
  }
  const check = saved => guarded(async () => { setStage('Checking this coin on-chain…'); await checkLaunch(saved, persist); });
  const resume = saved => guarded(async () => {
    if (wallet.address !== saved.walletAddress) throw new Error('Connect the original launch wallet.');
    setStage('Checking the saved launch before resuming…');
    const checked = await checkLaunch(saved, persist);
    if (checked.status === 'confirmed') { if (checked.feeRecipients?.length && checked.rewardStatus !== 'confirmed') await configureLaunchRewards(checked, wallet, persist, setStage); return; }
    if (checked.status === 'pending') throw new Error('This transaction may still land. Keep this launch and check again before requesting another approval.');
    if (!hasLaunchMintKey(checked.requestId)) throw new Error('Resume in the original browser where the mint key was saved.');
    if (!Number(checked.firstBuyAmount)) { setRecovery(checked); setInput({ ...initialLaunchInput, ...launchParams(checked), firstBuyAmount: '' }); setFile(null); setPreflight(null); return; }
    await run(checked);
  });
  const launch = event => { event.preventDefault(); return guarded(async () => {
    if (!wallet.address) { await wallet.connect(); return; }
    let saved;
    if (recovery) {
      const checked = await checkLaunch(recovery, persist);
      if (checked.status === 'confirmed') { setRecovery(null); return; }
      if (checked.status === 'pending') throw new Error('The previous launch is still pending. Check again later.');
      saved = { ...checked, ...normalizeLaunch(input) };
    } else {
      if (attempts.length) throw new Error('Check or resume your saved launch before creating another coin.');
      saved = await createLaunchDraft(input, file, wallet.address, setStage);
    }
    persist(saved); await run(saved);
  }); };
  const rewards = () => guarded(async () => { if (result?.status === 'confirmed' && result.walletAddress === wallet.address) await configureLaunchRewards(result, wallet, persist, setStage); });
  const cancelRecovery = () => { setRecovery(null); setInput(initialLaunchInput); };
  return { wallet, input, setInput, file, setFile, settings, busy, loading: optionsLoading || historyLoading, error, stage, preflight, result, attempts, recovery, launch, check, resume, rewards, cancelRecovery };
}