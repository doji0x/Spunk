import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { usePhantomWallet } from '@/contexts/PhantomWalletContext';
import { launchMintKey } from '@/lib/launchMintKey';
import { signAtomicV1 } from '@/lib/atomicV1UserSign';

const initial = { name: '', symbol: '', description: '', firstBuyAmount: '' };
const toBase64 = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const invoke = payload => base44.functions.invoke('publicAtomicV1Launch', payload);
const message = reason => reason.response?.data?.error || reason.message || 'Atomic V1 launch failed.';

export default function usePublicAtomicV1Launch() {
  const wallet = usePhantomWallet();
  const requestId = useRef(crypto.randomUUID());
  const [mintAddress, setMintAddress] = useState('');
  const [input, setInput] = useState(initial), [file, setFile] = useState(null), [imageBase64, setImageBase64] = useState('');
  // Links are off-chain, so they never affect the transaction size preview.
  const [links, setLinks] = useState({ website: '', twitter: '', github: '' });
  const [size, setSize] = useState(null), [sizing, setSizing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState(null);

  // The coin mint keypair is generated and kept in this browser, so the user is its sole owner.
  useEffect(() => { launchMintKey(requestId.current).then(mint => setMintAddress(mint.address)).catch(reason => setError(reason.message)); }, []);
  useEffect(() => { if (!file) { setImageBase64(''); return; } toBase64(file).then(setImageBase64).catch(() => setError('Unable to read that image.')); }, [file]);
  useEffect(() => {
    if (!imageBase64 || !input.name || !input.symbol || !wallet.address || !mintAddress) { setSize(null); return; }
    const timer = setTimeout(async () => {
      setSizing(true); setError('');
      try { const { data } = await invoke({ action: 'size', requestId: requestId.current, walletAddress: wallet.address, mintAddress, imageBase64, ...input }); setSize(data.size); }
      catch (reason) { setSize(null); setError(message(reason)); }
      finally { setSizing(false); }
    }, 450);
    return () => clearTimeout(timer);
  }, [imageBase64, input, wallet.address, mintAddress]);

  async function check(targetId = result?.requestId || requestId.current) {
    const checked = await invoke({ action: 'confirm', requestId: targetId });
    setResult(checked.data.launch); return checked.data.launch;
  }
  async function recheck() {
    setBusy(true); setError('');
    try { await check(); } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  async function launch(event) {
    event.preventDefault(); setError('');
    if (!wallet.address) { await wallet.connect(); return; }
    if (!file || !size || size.remainingBytes < 0) return;
    setBusy(true);
    try {
      const mint = await launchMintKey(requestId.current);
      const upload = await base44.integrations.Core.UploadPublicFile({ file });
      const prepared = await invoke({ action: 'prepare', requestId: requestId.current, walletAddress: wallet.address, mintAddress: mint.address, imageBase64, imageUrl: upload.file_url, socials: links, ...input });
      if (prepared.data.launch?.transactionSignature) { setResult(prepared.data.launch); return; }
      const signatures = await signAtomicV1({ provider: wallet.provider, prepared: prepared.data.prepared, walletAddress: wallet.address, mint });
      const { data } = await invoke({ action: 'submit', requestId: requestId.current, submitToken: prepared.data.prepared.submitToken, signatures });
      setResult(data.launch);
      for (let i = 0; i < 24 && data.launch.status === 'pending'; i += 1) { await wait(2500); const current = await check(data.launch.requestId); if (current.status !== 'pending') break; }
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  return { wallet, input, setInput, file, setFile, size, sizing, busy, error, result, launch, check: recheck, links, setLink: (key, value) => setLinks(current => ({ ...current, [key]: value })) };
}