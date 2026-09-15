import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function MintForm({ onMint, busy }) {
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [details, setDetails] = useState('');
  const [file, setFile] = useState(null);
  const submit = event => {
    event.preventDefault();
    onMint({ name, symbol, details, file });
  };
  return <form onSubmit={submit} className="space-y-5 rounded-2xl border border-[#dce1d5] bg-white p-6 shadow-sm">
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="name">NFT name</Label><Input id="name" maxLength={32} value={name} onChange={event => setName(event.target.value)} required disabled={busy} /></div>
      <div className="space-y-2"><Label htmlFor="symbol">Ticker</Label><Input id="symbol" maxLength={10} value={symbol} onChange={event => setSymbol(event.target.value.toUpperCase())} required disabled={busy} /></div>
    </div>
    <div className="space-y-2"><Label htmlFor="image">Inscribed image</Label><Input id="image" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={event => setFile(event.target.files?.[0] || null)} required disabled={busy} /><p className="text-xs text-[#7e8773]">PNG, JPEG, GIF, or WebP · 1 MB maximum. Larger files require substantially more SOL and time.</p></div>
    <div className="space-y-2"><Label htmlFor="details">Details</Label><Textarea id="details" maxLength={1000} rows={5} value={details} onChange={event => setDetails(event.target.value)} placeholder="Description and details stored in the NFT inscription" required disabled={busy} /></div>
    <Button type="submit" disabled={busy || !file} className="w-full">{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Minting on mainnet…</> : 'Mint one inscribed NFT'}</Button>
  </form>;
}