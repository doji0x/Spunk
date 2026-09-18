import { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

const blank = { name: '', symbol: '', description: '', destinationWallet: '', media: null, cover: null };
function encode(file) {
  if (!file || !file.size || file.size > 1048576) throw new Error('Select a non-empty file no larger than 1 MB.');
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Unable to read this file.')); reader.readAsDataURL(file); });
}
export default function usePofSubmission() {
  const [values, setValues] = useState(blank);
  const [quote, setQuote] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [version, setVersion] = useState(0);
  const requestId = useRef(crypto.randomUUID());
  const locked = useRef(false);
  const payload = useRef(null);
  const audio = Boolean(values.media && (values.media.type.startsWith('audio/') || /\.mp3$/i.test(values.media.name)));
  const change = (key, value) => { setValues(previous => ({ ...previous, [key]: value })); setQuote(null); setConfirmed(false); setError(''); payload.current = null; requestId.current = crypto.randomUUID(); };
  const reset = () => { setValues(blank); setQuote(null); setConfirmed(false); setError(''); setResult(null); setVersion(value => value + 1); requestId.current = crypto.randomUUID(); payload.current = null; };
  const run = async event => {
    event.preventDefault();
    if (locked.current || result) return;
    locked.current = true; setBusy(true); setError('');
    try {
      if (!quote) {
        const { media, cover, ...fields } = values;
        payload.current = { ...fields, data: await encode(media), ...(audio ? { coverData: await encode(cover) } : {}) };
        const response = await base44.functions.invoke('testAgentInscription', { action: 'quote', ...payload.current });
        if (response.data?.error) throw new Error(response.data.error);
        setQuote(response.data);
      } else {
        if (!confirmed) throw new Error('Confirm the mainnet inscription before submitting.');
        const response = await base44.functions.invoke('testAgentInscription', { action: 'submit', ...payload.current, requestId: requestId.current, quoteHash: quote.submissionHash, confirm: true });
        if (response.data?.error || !response.data?.mint) throw new Error(response.data?.error || 'No queued job was returned.');
        setResult(response.data);
      }
    } catch (failure) { setError(failure.response?.data?.error || failure.message || 'Submission failed. Retry with the same form to recover this request.'); }
    finally { locked.current = false; setBusy(false); }
  };
  return { values, quote, confirmed, setConfirmed, busy, error, result, version, audio, change, reset, run };
}