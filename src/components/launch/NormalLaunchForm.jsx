import React, { useEffect, useState } from 'react';
import { Loader2, Rocket, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Image } from '@/components/ui/image';
import LaunchLinksFields from '@/components/launch/LaunchLinksFields';

export default function NormalLaunchForm({ state }) {
  const { input, setInput, file, setFile, busy, loading, launch, wallet } = state;
  const [preview, setPreview] = useState('');
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  const change = (key, value) => setInput(current => ({ ...current, [key]: value }));
  return <form onSubmit={launch} className="space-y-6 rounded-3xl border border-border bg-card p-5 sm:p-7">
    <fieldset disabled={busy || loading} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="coin-name">Coin name</Label><Input id="coin-name" required maxLength={32} value={input.name} onChange={e => change('name', e.target.value)} placeholder="Your coin name" /></div><div className="space-y-2"><Label htmlFor="coin-symbol">Ticker</Label><Input id="coin-symbol" required maxLength={10} value={input.symbol} onChange={e => change('symbol', e.target.value.toUpperCase())} placeholder="COIN" /></div></div>
      <div className="space-y-2"><Label htmlFor="coin-description">Description</Label><Textarea id="coin-description" maxLength={2000} value={input.description} onChange={e => change('description', e.target.value)} placeholder="Tell people what your coin is about." /></div>
      <div className="space-y-3"><Label htmlFor="coin-image">Coin image</Label><div className="flex items-center gap-4 rounded-2xl border border-dashed border-border p-4">{preview ? <Image src={preview} alt="Coin image preview" className="h-20 w-20 shrink-0 rounded-xl" fittingType="fit" /> : <Upload className="h-8 w-8 shrink-0 text-muted-foreground" />}<div className="min-w-0 space-y-2"><Input id="coin-image" type="file" required accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => setFile(e.target.files?.[0] || null)} className="text-xs" /><p className="text-xs text-muted-foreground">PNG, JPG, WebP or GIF · up to 5 MB</p></div></div></div>
      <LaunchLinksFields links={input} onChange={change} disabled={busy} />
    </fieldset>
    <p className="text-xs leading-5 text-muted-foreground">Image and metadata are stored off-chain. Your wallet pays creation rent and network fees; budget about 0.03 SOL. No tokens will be purchased.</p>
    {wallet.network !== 'mainnet-beta' && <Button type="button" variant="outline" disabled={busy} onClick={() => wallet.setNetwork('mainnet-beta')}>Switch to Mainnet</Button>}
    <Button type="submit" size="lg" disabled={busy || loading || wallet.network !== 'mainnet-beta'} className="w-full rounded-full">{busy || loading ? <Loader2 className="animate-spin" /> : <Rocket />}{busy ? 'Creating your coin…' : loading ? 'Loading saved launches…' : wallet.address ? 'Launch coin' : 'Connect Phantom to launch'}</Button>
  </form>;
}