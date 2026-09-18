import React, { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import ImageUploadField from '@/components/admin/ImageUploadField';
export default function PublicInscribeForm({ state }) {
  const [values, setValues] = useState({ name: '', symbol: '', details: '', file: null });
  const locked = state.busy || Boolean(state.pending), paused = state.pending?.status === 'failed', change = (field, value) => setValues(current => ({ ...current, [field]: value }));
  return <form onSubmit={event => { event.preventDefault(); state.start(values); }} className="space-y-5 rounded-3xl border border-border bg-card/60 p-5 sm:p-6">
    <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="public-nft-name">NFT name</Label><Input id="public-nft-name" maxLength={32} required disabled={locked} value={values.name} onChange={event => change('name', event.target.value)} /></div><div className="space-y-2"><Label htmlFor="public-nft-symbol">Ticker</Label><Input id="public-nft-symbol" maxLength={10} required disabled={locked} value={values.symbol} onChange={event => change('symbol', event.target.value.toUpperCase())} /></div></div>
    <ImageUploadField disabled={locked} onFileChange={file => change('file', file)} />
    <div className="space-y-2"><Label htmlFor="public-nft-details">Details</Label><Textarea id="public-nft-details" rows={5} maxLength={1000} required disabled={locked} value={values.details} onChange={event => change('details', event.target.value)} placeholder="Description stored in the NFT inscription" /></div>
    <p className="rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground"><span className="font-semibold text-primary">Flat cost: 0.5 SOL.</span> This covers server-side inscribing, including the on-chain storage and network transactions used to create and deliver your NFT. You may also inscribe independently using your own tools.</p>
    <Button type={paused ? 'button' : 'submit'} onClick={paused ? state.resume : undefined} disabled={state.busy || Boolean(state.pending) !== paused || (!state.pending && !values.file) || state.wallet.network !== 'mainnet-beta'} className="gold-glow w-full rounded-full">{state.busy ? <><Loader2 className="animate-spin" />{state.activity}</> : <><Sparkles />{paused ? 'Retry inscription' : state.pending ? 'Inscribing in the background' : state.wallet.address ? 'Pay and inscribe with Phantom' : 'Connect Phantom to continue'}</>}</Button>
    {state.wallet.network !== 'mainnet-beta' && <p className="text-xs text-primary">Switch Phantom to Mainnet to inscribe.</p>}
  </form>;
}