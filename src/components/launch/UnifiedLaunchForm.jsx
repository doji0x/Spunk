import React from 'react';
import { Loader2, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import LaunchImageSource from '@/components/launch/LaunchImageSource';
import LaunchIdentityFields from '@/components/launch/LaunchIdentityFields';
import PublicLaunchAdvancedOptions from '@/components/launch/PublicLaunchAdvancedOptions';

export default function UnifiedLaunchForm({ state }) {
  const { input, setInput, settings, busy, loading, wallet, recovery } = state;
  const pair = settings.pairs?.find(item => item.mint === input.quoteMint);
  const invalidShares = input.feeRecipients.length > 0 && (input.feeRecipients.reduce((sum, item) => sum + Number(item.shareBps || 0), 0) !== 10000 || input.feeRecipients.some(item => !item.value));
  return <form onSubmit={state.launch} className="overflow-hidden rounded-2xl border border-border bg-card">
    {recovery && <p className="border-b border-border bg-primary/5 p-5 text-sm text-primary">Resuming {recovery.name} with its original mint. This older launch needs a first-buy amount; no buy happens until you approve the new transaction.</p>}
    <fieldset disabled={busy || loading} className="min-w-0 divide-y divide-border disabled:opacity-70">
      <LaunchImageSource state={state} />
      <LaunchIdentityFields input={input} setInput={setInput} locked={Boolean(recovery)} />
      <section className="space-y-4 p-5 sm:p-6">
        <div><h2 className="font-heading font-semibold">First buy</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Required for every launch. Creation and your first buy confirm together in one transaction.</p></div>
        <div className="space-y-2"><Label htmlFor="launch-first-buy">Amount ({pair?.symbol || 'selected pair asset'}) *</Label><Input id="launch-first-buy" required inputMode="decimal" pattern="^\d+(\.\d+)?$" value={input.firstBuyAmount} onChange={event => setInput(current => ({ ...current, firstBuyAmount: event.target.value }))} placeholder="0.1" className="h-11 font-mono" /><p className="text-xs leading-5 text-muted-foreground">Have your buy amount available, plus SOL for creation rent and network fees.</p></div>
        <PublicLaunchAdvancedOptions input={input} setInput={setInput} settings={settings} disabled={busy || loading} />
      </section>
    </fieldset>
    <div className="space-y-3 border-t border-border bg-background/30 p-5 sm:p-6">
      {wallet.network !== 'mainnet-beta' && <Button type="button" variant="outline" disabled={busy} onClick={() => wallet.setNetwork('mainnet-beta')} className="w-full">Switch to Mainnet</Button>}
      <Button type="submit" size="lg" disabled={busy || loading || !pair || invalidShares || wallet.network !== 'mainnet-beta'} className="h-12 w-full rounded-xl">{busy || loading ? <Loader2 className="animate-spin" /> : <Rocket />}{busy ? 'Working on your launch…' : loading ? 'Loading launch settings…' : wallet.address ? 'Launch coin & buy' : 'Connect Phantom to launch'}</Button>
      {!loading && !pair && <p className="text-xs text-destructive">Launch settings are unavailable. Reload the page to try again.</p>}
      {recovery && <Button type="button" variant="ghost" disabled={busy} onClick={state.cancelRecovery} className="w-full">Back to saved launches</Button>}
      <p className="text-center text-xs leading-5 text-muted-foreground">Review the coin and buy amount in Phantom. Custom fee splits require a separate approval after launch.</p>
    </div>
  </form>;
}