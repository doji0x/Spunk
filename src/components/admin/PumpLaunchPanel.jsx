import React from 'react';
import { Loader2, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import usePumpLaunch from '@/hooks/usePumpLaunch';
import AdvancedLaunchOptions from '@/components/admin/AdvancedLaunchOptions';
import PumpLaunchResult from '@/components/admin/PumpLaunchResult';

export default function PumpLaunchPanel({ inscriptionBusy }) {
  const launchState = usePumpLaunch();
  const { input, setInput, attempt, options, settings, loading, busy, error, launch, configureSharing, reset } = launchState;
  const disabled = busy || inscriptionBusy || loading;
  const shareTotal = input.feeRecipients.reduce((sum, item) => sum + (Number(item.shareBps) || 0), 0);
  const invalid = !options.length || Number(input.firstBuyAmount) <= 0 || (input.feeRecipients.length > 0 && (shareTotal !== 10000 || input.feeRecipients.some(item => !item.value))) || (input.holderReward && input.feeRecipients.length > 0);
  return <section className="mt-10 border-t border-launch-border pt-8 text-foreground" aria-labelledby="pump-launch-heading">
    <div className="mb-5 flex items-start gap-3"><span className="rounded-full border border-launch-border bg-card p-2 text-launch-brand"><Rocket size={20} /></span><div><p className="font-mono text-[10px] tracking-widest text-launch-brand">STEP 02 · PUMP.FUN</p><h2 id="pump-launch-heading" className="mt-1 text-2xl font-semibold tracking-tight">Launch your inscribed coin</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Create and buy a pump.fun coin referencing the verified on-chain image, with advanced pair and reward controls.</p></div></div>
    {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />Loading current pump.fun settings…</div>}
    {!loading && !attempt && <form onSubmit={launch} className="space-y-4 rounded-2xl border border-launch-border bg-card p-5 sm:p-6">
      <div className="space-y-2"><Label htmlFor="pump-inscription">Inscribed NFT mint address</Label><Input id="pump-inscription" required maxLength={44} value={input.inscribedMint} disabled={disabled} placeholder="Paste the source NFT mint address" className="font-mono text-xs" onChange={e => setInput({ ...input, inscribedMint: e.target.value })} /></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="pump-name">Coin name</Label><Input id="pump-name" required maxLength={32} value={input.name} disabled={disabled} placeholder="Your coin name" onChange={e => setInput({ ...input, name: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="pump-symbol">Ticker</Label><Input id="pump-symbol" required maxLength={10} value={input.symbol} disabled={disabled} placeholder="TICKER" onChange={e => setInput({ ...input, symbol: e.target.value.toUpperCase() })} /></div></div>
      <AdvancedLaunchOptions input={input} setInput={setInput} options={options} settings={settings} disabled={disabled} />
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={disabled || invalid} className="w-full bg-launch-brand text-primary-foreground hover:bg-launch-brand/90">{busy ? <><Loader2 size={16} className="mr-2 animate-spin" />Verifying and launching…</> : 'Create, buy, and launch on mainnet'}</Button>
    </form>}
    {attempt && <PumpLaunchResult attempt={attempt} busy={busy} error={error} onResume={launch} onConfigureSharing={configureSharing} onReset={reset} />}
  </section>;
}