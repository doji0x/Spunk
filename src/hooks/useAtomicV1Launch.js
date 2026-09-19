import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

const initial = { name: '', symbol: '', description: '', firstBuyAmount: '' };
const toBase64 = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export default function useAtomicV1Launch() {
  const requestId = useRef(crypto.randomUUID());
  const [input, setInput] = useState(initial), [file, setFile] = useState(null), [imageBase64, setImageBase64] = useState('');
  // Links are off-chain, so they never affect the transaction size preview.
  const [links, setLinks] = useState({ website: '', twitter: '', github: '' });
  const [size, setSize] = useState(null), [sizing, setSizing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState(null);
  useEffect(() => { if (!file) { setImageBase64(''); return; } toBase64(file).then(setImageBase64).catch(() => setError('Unable to read that image.')); }, [file]);
  useEffect(() => {
    if (!imageBase64 || !input.name || !input.symbol) { setSize(null); return; }
    const timer = setTimeout(async () => { setSizing(true); setError(''); try { const { data } = await base44.functions.invoke('atomicV1PumpLaunch', { action: 'size', requestId: requestId.current, imageBase64, ...input }); setSize(data.size); } catch (reason) { setSize(null); setError(reason.response?.data?.error || reason.message); } finally { setSizing(false); } }, 450);
    return () => clearTimeout(timer);
  }, [imageBase64, input]);
  async function check(targetId = result?.requestId || requestId.current) {
    const checked = await base44.functions.invoke('atomicV1PumpLaunch', { action: 'confirm', requestId: targetId });
    setResult(checked.data.launch); return checked.data.launch;
  }
  async function recheck() {
    setBusy(true); setError('');
    try { await check(); } catch (reason) { setError(reason.response?.data?.error || reason.message || 'Unable to check finalization.'); }
    finally { setBusy(false); }
  }
  async function launch(event) {
    event.preventDefault(); if (!file || !size || size.remainingBytes < 0) return; setBusy(true); setError('');
    try {
      const upload = await base44.integrations.Core.UploadPublicFile({ file });
      const { data } = await base44.functions.invoke('atomicV1PumpLaunch', { action: 'launch', requestId: requestId.current, imageBase64, imageUrl: upload.file_url, socials: links, ...input });
      setResult(data.launch);
      for (let i = 0; i < 24 && data.launch.status === 'pending'; i += 1) { await wait(2500); const current = await check(data.launch.requestId); if (current.status !== 'pending') break; }
    } catch (reason) { setError(reason.response?.data?.error || reason.message || 'Atomic V1 launch failed.'); }
    finally { setBusy(false); }
  }
  return { input, setInput, file, setFile, size, sizing, busy, error, result, launch, check: recheck, links, setLink: (key, value) => setLinks(current => ({ ...current, [key]: value })) };
}