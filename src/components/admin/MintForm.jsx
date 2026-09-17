import React from 'react';
import useMintRecoveryForm from '@/hooks/useMintRecoveryForm';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import ImageUploadField from '@/components/admin/ImageUploadField';

export default function MintForm({ onMint, busy, pending, onResume }) {
  const { values, change, recovery } = useMintRecoveryForm(pending);
  const { name, symbol, details, file, mint } = values;
  const locked = busy || Boolean(pending);
  const submit = event => {
    event.preventDefault();
    if (!recovery.loading) onMint(values);
  };
  return <form onSubmit={submit} className="space-y-5 rounded-2xl border border-[#dce1d5] bg-white p-6 shadow-sm">
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="name">NFT name</Label><Input id="name" maxLength={32} value={name} onChange={event => change('name', event.target.value)} required disabled={locked || recovery.loading} /></div>
      <div className="space-y-2"><Label htmlFor="symbol">Ticker</Label><Input id="symbol" maxLength={10} value={symbol} onChange={event => change('symbol', event.target.value.toUpperCase())} required disabled={locked || recovery.loading} /></div>
    </div>
    <div className="space-y-2"><Label htmlFor="mint">Recover existing mint <span className="font-normal text-[#7e8773]">(optional)</span></Label><Input id="mint" value={mint} onChange={event => change('mint', event.target.value)} placeholder="Paste a partially completed mint address" disabled={locked} /><p className="text-xs text-[#7e8773]">Use this to finish a mint whose NFT exists but inscription did not complete.</p></div>
    {recovery.loading && <p role="status" className="text-xs text-muted-foreground">Loading saved mint details…</p>}
    {recovery.error && <p role="alert" className="text-xs text-destructive">{recovery.error}</p>}
    {pending && <p className="text-xs text-muted-foreground">Saved details, original image, and confirmed progress restored. Resume continues the same NFT.</p>}
    {!pending && values.requestId && <p className="text-xs text-muted-foreground">Saved details restored. Select the original image; completed chunks will be checked on-chain and skipped.</p>}
    <ImageUploadField disabled={locked} onFileChange={file => change('file', file)} restoredFile={pending ? file : null} />
    <div className="space-y-2"><Label htmlFor="details">Details</Label><Textarea id="details" maxLength={1000} rows={5} value={details} onChange={event => change('details', event.target.value)} placeholder="Description and details stored in the NFT inscription" required disabled={locked || recovery.loading} /></div>
    <Button type={pending ? 'button' : 'submit'} onClick={pending ? onResume : undefined} disabled={busy || recovery.loading || !file} className="w-full">{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Minting on mainnet…</> : pending ? 'Resume inscription' : mint.trim() ? 'Recover existing NFT' : 'Mint one inscribed NFT'}</Button>
  </form>;
}