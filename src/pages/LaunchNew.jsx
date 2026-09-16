import React, { useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { sha256Hex } from '@/lib/bytes';
import AdminGate from '@/components/admin/AdminGate';
import ImageUploadField from '@/components/admin/ImageUploadField';
import LaunchEstimate from '@/components/launchpad/LaunchEstimate';
import NetworkBanner from '@/components/launchpad/NetworkBanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function LaunchNew() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', symbol: '', description: '', supply: '1000000000', priceSol: '0.00001' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = key => event => setForm(current => ({ ...current, [key]: key === 'symbol' ? event.target.value.toUpperCase() : event.target.value }));
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const imageHash = await sha256Hex(new Uint8Array(await file.arrayBuffer()));
      const { data } = await base44.functions.invoke('launchToken', { action: 'create', name: form.name, symbol: form.symbol, description: form.description, supply: Number(form.supply), priceLamports: Math.round(Number(form.priceSol) * 1e9), mimeType: file.type, totalSize: file.size, imageHash });
      navigate(`/admin/launchpad/${data.id}`);
    } catch (err) { setError(err.response?.data?.error || err.message); setBusy(false); }
  };
  return <AdminGate><main className="validate-surface min-h-screen px-5 py-10 text-[#252b20]">
    <div className="mx-auto max-w-2xl"><Link to="/admin/launchpad" className="mb-8 inline-flex items-center gap-2 text-sm text-[#657456]"><ArrowLeft size={16} />All launches</Link>
      <NetworkBanner />
      <p className="font-mono text-[10px] tracking-widest text-[#66834a]">NEW LAUNCH · STEP 1 OF 3</p><h1 className="mt-1 mb-6 text-3xl font-semibold tracking-tight">Token details and image</h1>
      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-[#dce1d5] bg-white p-6 shadow-sm">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="name">Token name</Label><Input id="name" maxLength={32} value={form.name} onChange={set('name')} required disabled={busy} /></div>
          <div className="space-y-2"><Label htmlFor="symbol">Ticker</Label><Input id="symbol" maxLength={10} value={form.symbol} onChange={set('symbol')} required disabled={busy} /></div>
          <div className="space-y-2"><Label htmlFor="supply">Total supply (whole tokens)</Label><Input id="supply" type="number" min={1} step={1} value={form.supply} onChange={set('supply')} required disabled={busy} /></div>
          <div className="space-y-2"><Label htmlFor="price">Sale price per token (SOL)</Label><Input id="price" type="number" min={0.000000001} step="any" value={form.priceSol} onChange={set('priceSol')} required disabled={busy} /></div>
        </div>
        <ImageUploadField disabled={busy} onFileChange={setFile} />
        <div className="space-y-2"><Label htmlFor="description">Description</Label><Textarea id="description" maxLength={1000} rows={4} value={form.description} onChange={set('description')} placeholder="Stored in the inscription metadata alongside the token mint" required disabled={busy} /></div>
        <LaunchEstimate totalSize={file?.size} name={form.name} symbol={form.symbol} description={form.description} />
        {error && <p className="text-sm text-[#a54132]">{error}</p>}
        <Button type="submit" disabled={busy || !file} className="w-full">{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deriving addresses…</> : 'Create launch and derive addresses'}</Button>
        <p className="text-[10px] leading-relaxed text-[#959b8e]">Nothing is sent on-chain yet. The next screen inscribes the image, verifies it, then launches the mint — resumable at every step.</p>
      </form>
    </div>
  </main></AdminGate>;
}