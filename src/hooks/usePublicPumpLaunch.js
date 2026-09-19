import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { usePhantomWallet } from '@/contexts/PhantomWalletContext';
import { phantomTransaction } from '@/lib/phantomTransaction';

const initial = { quoteMint: 'So11111111111111111111111111111111111111112', inscribedMint: '', name: '', symbol: '', firstBuyAmount: '', creatorFeePercent: '', feeMode: 'creator', holderReward: false, feeRecipients: [], website: '', twitter: '', github: '' };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const toBase64 = bytes => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
};
const invoke = payload => base44.functions.invoke('publicPumpLaunch', { network: 'mainnet-beta', ...payload });
// Rebuilds the exact prepare payload from a saved attempt so the same coin mint is derived.
const attemptParams = attempt => ({ requestId: attempt.requestId, inscribedMint: attempt.inscribedMint, name: attempt.name, symbol: attempt.symbol, quoteMint: attempt.quoteMint, firstBuyAmount: attempt.firstBuyAmount, creatorFeePercent: String((attempt.creatorFeeBps || 0) / 100), holderReward: Boolean(attempt.holderReward), feeRecipients: attempt.feeRecipients || [], ...(attempt.socials || {}) });

export default function usePublicPumpLaunch() {
  const wallet = usePhantomWallet();
  const [input, setInput] = useState(initial), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [result, setResult] = useState(null);
  const [settings, setSettings] = useState({ pairs: [], holderRewardEnabled: false, creatorFeeConfigurable: false, maxCreatorFeeBps: 0 });
  const [pendingAttempts, setPendingAttempts] = useState([]);
  useEffect(() => {
    let active = true;
    invoke({ action: 'options' }).then(({ data }) => {
      if (!active) return;
      setSettings(data);
      setInput(current => ({ ...current, quoteMint: data.pairs?.some(pair => pair.mint === current.quoteMint) ? current.quoteMint : data.pairs?.[0]?.mint || '' }));
    }).catch(reason => active && setError(reason.response?.data?.error || 'Unable to load pair and reward options.')).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!wallet.address) { setPendingAttempts([]); return; }
    let active = true;
    invoke({ action: 'resume', walletAddress: wallet.address }).then(({ data }) => active && setPendingAttempts(data.attempts || [])).catch(() => {});
    return () => { active = false; };
  }, [wallet.address]);

  async function configureRewards(data, feeRecipients) {
    if (!feeRecipients.length) return;
    setResult(current => ({ ...current, rewardStatus: 'preparing' }));
    try {
      const prepared = await invoke({ action: 'prepareSharing', walletAddress: wallet.address, coinMint: data.coinMint, quoteMint: data.quoteMint, feeRecipients });
      const signed = await wallet.provider.signAndSendTransaction(phantomTransaction(prepared.data.transaction));
      setResult(current => ({ ...current, rewardStatus: 'submitted', rewardSignature: signed.signature }));
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await wait(2500);
        const confirmation = await invoke({ action: 'confirmSharing', signature: signed.signature });
        setResult(current => ({ ...current, rewardStatus: confirmation.data.status }));
        if (confirmation.data.status !== 'pending') break;
      }
    } catch (reason) {
      setResult(current => ({ ...current, rewardStatus: 'failed', rewardError: `Coin launched, but custom reward sharing was not configured: ${reason.response?.data?.error || reason.message}` }));
    }
  }
  async function pollConfirmation(data, signature) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await wait(2500);
      const confirmation = await invoke({ action: 'confirm', signature, coinMint: data.coinMint, bondingCurve: data.bondingCurve, requestId: data.requestId });
      setResult(current => ({ ...current, status: confirmation.data.status }));
      if (confirmation.data.status !== 'pending') return confirmation.data.status === 'confirmed';
    }
    return false;
  }
  // Prepare → Phantom sign → server submit. An expired blockhash re-prepares with the
  // same request (and therefore the same coin mint) up to two times before giving up.
  async function prepareSignSubmit(params) {
    for (let round = 0; round < 3; round += 1) {
      const { data } = await invoke({ action: 'prepare', walletAddress: wallet.address, ...params });
      if (data.alreadyLaunched) return { data, alreadyLaunched: true };
      const signed = await wallet.provider.signTransaction(phantomTransaction(data.transaction));
      try {
        const submitted = await invoke({ action: 'submit', transaction: toBase64(signed.serialize()), submitToken: data.submitToken, requestId: params.requestId });
        return { data, signature: submitted.data.signature };
      } catch (reason) {
        if (!reason.response?.data?.reprepare) throw reason;
        if (round === 2) throw new Error('The transaction kept expiring before it could be sent. Tap Launch again to retry with the same coin.');
        setError('The transaction expired while waiting for approval. Preparing a fresh one — please sign again.');
      }
    }
  }
  async function run(params, feeRecipients) {
    setError('');
    setBusy(true);
    try {
      const outcome = await prepareSignSubmit(params);
      setError('');
      setPendingAttempts(current => current.filter(item => item.requestId !== params.requestId));
      if (outcome.alreadyLaunched) { setResult({ ...outcome.data, status: 'confirmed' }); await configureRewards(outcome.data, feeRecipients); return; }
      setResult({ ...outcome.data, signature: outcome.signature, status: 'pending' });
      if (await pollConfirmation(outcome.data, outcome.signature)) await configureRewards(outcome.data, feeRecipients);
    } catch (reason) { setError(reason.response?.data?.error || reason.message || 'The launch could not be completed.'); }
    finally { setBusy(false); }
  }
  async function launch(event) {
    event.preventDefault(); setError('');
    if (!wallet.address) { await wallet.connect(); return; }
    if (wallet.network !== 'mainnet-beta') { setError('pump.fun launches are mainnet only. Switch to Mainnet to continue.'); return; }
    await run({ requestId: crypto.randomUUID(), ...input }, input.feeRecipients);
  }
  async function resume(attempt) {
    if (wallet.network !== 'mainnet-beta') { setError('pump.fun launches are mainnet only. Switch to Mainnet to continue.'); return; }
    const quoteSymbol = settings.pairs.find(pair => pair.mint === attempt.quoteMint)?.symbol || '';
    if (attempt.signature) {
      setBusy(true);
      const confirmation = await invoke({ action: 'confirm', signature: attempt.signature, coinMint: attempt.coinMint, bondingCurve: attempt.bondingCurve, requestId: attempt.requestId }).catch(() => ({ data: { status: 'pending' } }));
      setBusy(false);
      if (confirmation.data.status === 'confirmed') {
        setPendingAttempts(current => current.filter(item => item.requestId !== attempt.requestId));
        setResult({ ...attempt, quoteSymbol, status: 'confirmed' });
        return;
      }
    }
    await run(attemptParams(attempt), attempt.feeRecipients || []);
  }
  return { wallet, input, setInput, busy, loading, settings, error, result, launch, pendingAttempts, resume };
}