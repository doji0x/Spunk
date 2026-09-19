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
export default function usePublicPumpLaunch() {
  const wallet = usePhantomWallet();
  const [input, setInput] = useState(initial), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [result, setResult] = useState(null);
  const [settings, setSettings] = useState({ pairs: [], holderRewardEnabled: false, creatorFeeConfigurable: false, maxCreatorFeeBps: 0 });
  useEffect(() => {
    let active = true;
    base44.functions.invoke('publicPumpLaunch', { action: 'options', network: 'mainnet-beta' }).then(({ data }) => {
      if (!active) return;
      setSettings(data);
      setInput(current => ({ ...current, quoteMint: data.pairs?.some(pair => pair.mint === current.quoteMint) ? current.quoteMint : data.pairs?.[0]?.mint || '' }));
    }).catch(reason => active && setError(reason.response?.data?.error || 'Unable to load pair and reward options.')).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);
  async function configureRewards(data) {
    if (!input.feeRecipients.length) return;
    setResult(current => ({ ...current, rewardStatus: 'preparing' }));
    try {
      const prepared = await base44.functions.invoke('publicPumpLaunch', { action: 'prepareSharing', network: wallet.network, walletAddress: wallet.address, coinMint: data.coinMint, quoteMint: data.quoteMint, feeRecipients: input.feeRecipients });
      const signed = await wallet.provider.signAndSendTransaction(phantomTransaction(prepared.data.transaction));
      setResult(current => ({ ...current, rewardStatus: 'submitted', rewardSignature: signed.signature }));
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await wait(2500);
        const confirmation = await base44.functions.invoke('publicPumpLaunch', { action: 'confirmSharing', network: wallet.network, signature: signed.signature });
        setResult(current => ({ ...current, rewardStatus: confirmation.data.status }));
        if (confirmation.data.status !== 'pending') break;
      }
    } catch (reason) {
      setResult(current => ({ ...current, rewardStatus: 'failed', rewardError: `Coin launched, but custom reward sharing was not configured: ${reason.response?.data?.error || reason.message}` }));
    }
  }
  async function launch(event) {
    event.preventDefault(); setError('');
    if (!wallet.address) { await wallet.connect(); return; }
    if (wallet.network !== 'mainnet-beta') { setError('pump.fun launches are mainnet only. Switch to Mainnet to continue.'); return; }
    setBusy(true);
    try {
      const requestId = crypto.randomUUID();
      const { data } = await base44.functions.invoke('publicPumpLaunch', { action: 'prepare', network: wallet.network, walletAddress: wallet.address, requestId, ...input });
      const signed = await wallet.provider.signTransaction(phantomTransaction(data.transaction));
      const submitted = await base44.functions.invoke('publicPumpLaunch', { action: 'submit', network: 'mainnet-beta', transaction: toBase64(signed.serialize()), submitToken: data.submitToken });
      const signature = submitted.data.signature;
      setResult({ ...data, signature, status: 'pending' });
      let confirmed = false;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await wait(2500);
        const confirmation = await base44.functions.invoke('publicPumpLaunch', { action: 'confirm', network: wallet.network, signature, coinMint: data.coinMint, bondingCurve: data.bondingCurve });
        setResult(current => ({ ...current, status: confirmation.data.status }));
        if (confirmation.data.status !== 'pending') { confirmed = confirmation.data.status === 'confirmed'; break; }
      }
      if (confirmed) await configureRewards(data);
    } catch (reason) { setError(reason.response?.data?.error || reason.message || 'The launch could not be completed.'); }
    finally { setBusy(false); }
  }
  return { wallet, input, setInput, busy, loading, settings, error, result, launch };
}