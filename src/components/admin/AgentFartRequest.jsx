import React, { useRef, useState } from 'react';
import { LoaderCircle, AudioLines } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const toBase64 = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = () => reject(new Error('The MP3 could not be read.'));
  reader.readAsDataURL(file);
});

export default function AgentFartRequest() {
  const [form, setForm] = useState({ name: '', symbol: '', description: 'BY AGENT FLY BRAIN' });
  const [file, setFile] = useState(null);
  const [pending, setPending] = useState(false);
  const [response, setResponse] = useState(null);
  const locked = useRef(false);

  const update = key => event => setForm(current => ({ ...current, [key]: event.target.value }));

  const submit = async () => {
    if (locked.current || !file) return;
    locked.current = true;
    setPending(true);
    setResponse(null);
    try {
      const data = await toBase64(file);
      const result = await base44.functions.invoke('requestAgentFart', { confirm: true, data, ...form });
      setResponse(result.data);
    } catch (error) {
      setResponse(error.response?.data || { error: error.message || 'The agent request failed.' });
    } finally {
      locked.current = false;
      setPending(false);
    }
  };

  const ready = Boolean(file && form.name.trim() && form.symbol.trim() && form.description.trim());

  return <section className="mb-7 rounded-2xl border border-primary/20 bg-card p-5">
    <p className="font-mono text-[10px] tracking-widest text-primary">AGENT REQUEST</p>
    <h3 className="mt-2 flex items-center gap-2 font-display font-semibold"><AudioLines size={16} className="text-primary" />Ask the agent to inscribe a fart</h3>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">Sends an MP3 through the real Fly Brain agent endpoint, so it passes the same audio-only, rate, and cost guards. Each send creates a real Solana inscription and spends admin-wallet SOL.</p>
    <div className="mt-5 space-y-4">
      <div><Label htmlFor="agent-fart-file" className="text-xs">MP3 file</Label><Input id="agent-fart-file" type="file" accept="audio/mpeg,.mp3" onChange={event => setFile(event.target.files?.[0] || null)} className="mt-1.5" /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="agent-fart-name" className="text-xs">Name</Label><Input id="agent-fart-name" value={form.name} onChange={update('name')} maxLength={32} placeholder="Proof of Fart" className="mt-1.5" /></div>
        <div><Label htmlFor="agent-fart-symbol" className="text-xs">Ticker</Label><Input id="agent-fart-symbol" value={form.symbol} onChange={update('symbol')} maxLength={10} placeholder="POF" className="mt-1.5" /></div>
      </div>
      <div><Label htmlFor="agent-fart-description" className="text-xs">Description</Label><Textarea id="agent-fart-description" value={form.description} onChange={update('description')} maxLength={1000} rows={2} className="mt-1.5" /></div>
      <Button onClick={submit} disabled={pending || !ready}>{pending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}{pending ? 'Requesting…' : 'Request agent inscription'}</Button>
    </div>
    {response && <div className="mt-4" aria-live="polite"><p className="mb-2 text-xs text-muted-foreground">{response.mint ? 'Queued — the background worker is inscribing the audio bytes.' : 'Agent response'}</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-muted p-3 font-mono text-[11px]">{JSON.stringify(response, null, 2)}</pre></div>}
  </section>;
}