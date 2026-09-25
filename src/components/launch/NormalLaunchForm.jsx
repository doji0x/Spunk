import React from 'react';
import { Loader2, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import LaunchLinksFields from '@/components/launch/LaunchLinksFields';
import NormalLaunchImageField from '@/components/launch/NormalLaunchImageField';

export default function NormalLaunchForm({ state }) {
  const { input, setInput, file, setFile, busy, loading, launch, wallet } = state;
  const change = (key, value) => setInput(current => ({ ...current, [key]: value }));
  return <form onSubmit={launch} className="overflow-hidden rounded-2xl border border-border bg-card">
    <fieldset disabled={busy || loading} className="min-w-0 divide-y divide-border disabled:opacity-70">
      <section aria-labelledby="coin-identity-heading" className="space-y-5 p-5 sm:p-6">
        <div><h2 id="coin-identity-heading" className="font-heading text-base font-semibold">Identity</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Give your coin a name and ticker. Fields marked * are required.</p></div>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <div className="space-y-2"><Label htmlFor="coin-name">Coin name <span className="text-primary">*</span></Label><Input id="coin-name" required maxLength={32} value={input.name} onChange={e => change('name', e.target.value)} placeholder="Your coin name" className="h-11 bg-background/50" /></div>
          <div className="space-y-2"><Label htmlFor="coin-symbol">Ticker <span className="text-primary">*</span></Label><Input id="coin-symbol" required maxLength={10} value={input.symbol} onChange={e => change('symbol', e.target.value.toUpperCase())} placeholder="COIN" className="h-11 bg-background/50 font-mono" /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="coin-description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="coin-description" maxLength={2000} value={input.description} onChange={e => change('description', e.target.value)} placeholder="Tell people what your coin is about." className="min-h-24 resize-y bg-background/50" /></div>
      </section>
      <section aria-labelledby="coin-image-heading" className="space-y-5 p-5 sm:p-6">
        <div><h2 id="coin-image-heading" className="font-heading text-base font-semibold">Image</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Upload and preview the artwork for your coin.</p></div>
        <NormalLaunchImageField file={file} setFile={setFile} />
      </section>
      <section aria-labelledby="coin-social-heading" className="space-y-5 p-5 sm:p-6">
        <div><h2 id="coin-social-heading" className="font-heading text-base font-semibold">Social links <span className="text-xs font-normal text-muted-foreground">Optional</span></h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Help people find your website and community.</p></div>
        <LaunchLinksFields links={input} onChange={change} disabled={busy || loading} className="grid grid-cols-1 gap-4" />
      </section>
    </fieldset>
    <div className="space-y-4 border-t border-border bg-background/30 p-5 sm:p-6">
      <div className="space-y-1.5"><p className="text-xs font-medium">Create only · No automatic buy</p><p className="text-xs leading-5 text-muted-foreground">Your wallet pays creation rent and network fees; budget about 0.03 SOL. Image and metadata are stored off-chain.</p></div>
      {wallet.network !== 'mainnet-beta' && <Button type="button" variant="outline" disabled={busy} onClick={() => wallet.setNetwork('mainnet-beta')} className="w-full">Switch to Mainnet</Button>}
      <Button type="submit" size="lg" disabled={busy || loading || wallet.network !== 'mainnet-beta'} className="h-12 w-full rounded-xl">{busy || loading ? <Loader2 className="animate-spin" /> : <Rocket />}{busy ? 'Creating your coin…' : loading ? 'Loading saved launches…' : wallet.address ? 'Launch coin' : 'Connect Phantom to launch'}</Button>
      <p className="text-center text-xs text-muted-foreground">You approve coin creation in Phantom.</p>
    </div>
  </form>;
}