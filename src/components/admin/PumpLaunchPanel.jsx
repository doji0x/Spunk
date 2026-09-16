import React from 'react';
import { Loader2, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import usePumpLaunch from '@/hooks/usePumpLaunch';
import PumpLaunchResult from '@/components/admin/PumpLaunchResult';

export default function PumpLaunchPanel({ inscriptionBusy }) {
  const { input, setInput, attempt, loading, busy, error, launch, reset } = usePumpLaunch();
  const disabled = busy || inscriptionBusy;
  return <section className="mt-10 border-t border-launch-border pt-8 text-foreground" aria-labelledby="pump-launch-heading">
    <div className="mb-5 flex items-start gap-3"><span className="rounded-full border border-launch-border bg-card p-2 text-launch-brand"><Rocket size={20} /></span><div><p className="font-mono text-[10px] tracking-widest text-launch-brand">STEP 02 · PUMP.FUN</p><h2 id="pump-launch-heading" className="mt-1 text-2xl font-semibold tracking-tight">Launch your inscribed coin</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Already inscribed? Create a separate pump.fun coin referencing that image. The admin mint wallet must own the inscription and funds this mainnet launch.</p></div></div>
    {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />Loading your saved launch…</div>}
    {!loading && !attempt && <form onSubmit={launch} className="space-y-4 rounded-2xl border border-launch-border bg-card p-5 sm:p-6">
      <div className="space-y-2"><Label htmlFor="pump-inscription">Inscribed NFT mint address</Label><Input id="pump-inscription" required maxLength={44} value={input.inscribedMint} disabled={disabled} placeholder="Paste the source NFT mint address" className="font-mono text-xs" onChange={e => setInput({ ...input, inscribedMint: e.target.value })} /><p className="text-xs text-muted-foreground">We verify its image bytes from Solana and that the mint wallet owns it before creating the coin.</p></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="pump-name">Coin name</Label><Input id="pump-name" required maxLength={32} value={input.name} disabled={disabled} placeholder="Your coin name" onChange={e => setInput({ ...input, name: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="pump-symbol">Ticker</Label><Input id="pump-symbol" required maxLength={10} value={input.symbol} disabled={disabled} placeholder="TICKER" onChange={e => setInput({ ...input, symbol: e.target.value.toUpperCase() })} /></div></div>
      <p className="text-xs leading-5 text-muted-foreground">Launch only · SOL-paired · No initial buy. Network fees and account rent are paid in SOL. The coin's metadata is served by this app from the on-chain inscription.</p>
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={disabled} className="w-full bg-launch-brand text-primary-foreground hover:bg-launch-brand/90">{busy ? <><Loader2 size={16} className="mr-2 animate-spin" />Verifying and launching…</> : 'Launch coin on mainnet'}</Button>
      {inscriptionBusy && <p className="text-xs text-muted-foreground">Wait for the inscription operation to finish before launching.</p>}
    </form>}
    {attempt && <PumpLaunchResult attempt={attempt} busy={busy} error={error} onResume={launch} onReset={reset} />}
  </section>;
}