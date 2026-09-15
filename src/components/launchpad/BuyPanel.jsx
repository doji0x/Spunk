import React, { useState } from 'react';
import { Copy, Loader2, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatSol } from '@/lib/bytes';

export default function BuyPanel({ quote, onClaimed }) {
  const [buyer, setBuyer] = useState('');
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { const { data } = await base44.functions.invoke('buyLaunchToken', { action: 'claim', launchId: quote.id, buyer: buyer.trim(), signature: signature.trim() }); setDone(data); onClaimed(); } catch (err) { setError(err.response?.data?.error || err.message); }
    setBusy(false);
  };
  if (quote.status !== 'on_sale') return <p className="rounded-2xl border border-[#dce1d5] bg-white p-5 text-sm text-[#7e8773]">{quote.status === 'closed' ? 'This sale is closed.' : 'This sale has not opened yet.'}</p>;
  return <section className="rounded-2xl border border-[#dce1d5] bg-white p-5 text-sm">
    <p className="mb-3 font-mono text-[10px] tracking-widest text-[#66834a]">BUY AT FIXED PRICE · {formatSol(quote.priceLamports)} PER TOKEN · {quote.remaining.toLocaleString()} LEFT</p>
    <ol className="space-y-2 text-xs text-[#7e8773]"><li>1. Send SOL from your wallet to the sale vault below (whole tokens only; extra lamports are not refunded).</li><li>2. Paste your wallet address and the payment signature. Tokens are sent to your wallet.</li></ol>
    <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#f7f8f2] p-3"><span className="min-w-0 flex-1 break-all font-mono text-[10px]">{quote.vaultAddress}</span><button type="button" onClick={() => navigator.clipboard.writeText(quote.vaultAddress)} className="text-[#66834a]" aria-label="Copy vault address"><Copy size={14} /></button></div>
    {done ? <div className="mt-4 flex gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-[#66834a]" /><div><p className="font-semibold">{done.tokens.toLocaleString()} {quote.symbol} delivered.</p><a className="mt-1 block break-all font-mono text-xs text-[#66834a] underline" href={`https://solscan.io/tx/${done.transferSignature}`} target="_blank" rel="noreferrer">{done.transferSignature}</a></div></div>
    : <form onSubmit={submit} className="mt-4 space-y-3">
      <div className="space-y-1.5"><Label htmlFor="buyer">Your wallet address</Label><Input id="buyer" value={buyer} onChange={e => setBuyer(e.target.value)} required disabled={busy} /></div>
      <div className="space-y-1.5"><Label htmlFor="signature">Payment transaction signature</Label><Input id="signature" value={signature} onChange={e => setSignature(e.target.value)} required disabled={busy} /></div>
      {error && <p className="text-[#a54132]">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying payment…</> : 'Claim tokens'}</Button>
    </form>}
  </section>;
}