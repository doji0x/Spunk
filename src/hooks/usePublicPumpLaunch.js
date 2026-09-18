import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { usePhantomWallet } from '@/contexts/PhantomWalletContext';
import { phantomTransaction } from '@/lib/phantomTransaction';

const initial = { inscribedMint: '', name: '', symbol: '' };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export default function usePublicPumpLaunch() {
  const wallet = usePhantomWallet();
  const [input, setInput] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState(null);
  async function launch(event) {
    event.preventDefault(); setError('');
    if (!wallet.address) { await wallet.connect(); return; }
    if (wallet.network !== 'mainnet-beta') { setError('pump.fun launches are mainnet only. Switch to Mainnet to continue.'); return; }
    setBusy(true);
    try {
      const requestId = crypto.randomUUID();
      const { data } = await base44.functions.invoke('publicPumpLaunch', { action: 'prepare', network: wallet.network, walletAddress: wallet.address, requestId, ...input });
      const response = await wallet.provider.signAndSendTransaction(phantomTransaction(data.transaction));
      const signature = response.signature;
      setResult({ ...data, signature, status: 'pending' });
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await wait(2500);
        const confirmation = await base44.functions.invoke('publicPumpLaunch', { action: 'confirm', network: wallet.network, signature, coinMint: data.coinMint, bondingCurve: data.bondingCurve });
        setResult(current => ({ ...current, status: confirmation.data.status }));
        if (confirmation.data.status !== 'pending') break;
      }
    } catch (reason) { setError(reason.response?.data?.error || reason.message || 'The launch could not be completed.'); }
    finally { setBusy(false); }
  }
  return { wallet, input, setInput, busy, error, result, launch };
}