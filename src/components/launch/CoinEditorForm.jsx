import React from 'react';
import { Loader2, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import LaunchLinksFields from '@/components/launch/LaunchLinksFields';
import CoinEditorImage from '@/components/launch/CoinEditorImage';

export default function CoinEditorForm({ state }) {
  const { fields, launch, busy, wallet, update } = state;
  const differentWallet = wallet.address && wallet.address !== launch.ownerWallet;
  return <form onSubmit={state.save} className="overflow-hidden rounded-2xl border border-border bg-card">
    <fieldset disabled={busy} className="min-w-0 divide-y divide-border disabled:opacity-70">
      <section className="space-y-4 p-5 sm:p-6" aria-labelledby="edit-identity-heading">
        <div><h2 id="edit-identity-heading" className="font-semibold">Identity</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Change the name served by your metadata URI. The ticker and description stay unchanged.</p></div>
        <div className="space-y-2"><Label htmlFor="edit-coin-name">Display name</Label><Input id="edit-coin-name" value={fields.name} onChange={event => update('name', event.target.value)} required maxLength={32} className="h-11 bg-background/50" /></div>
      </section>
      <section className="space-y-4 p-5 sm:p-6" aria-labelledby="edit-image-heading"><h2 id="edit-image-heading" className="font-semibold">Image</h2><CoinEditorImage fields={fields} file={state.file} setFile={state.setFile} update={update} /></section>
      <section className="space-y-4 p-5 sm:p-6" aria-labelledby="edit-links-heading"><div><h2 id="edit-links-heading" className="font-semibold">Links</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Update your website and community links. Leave a link blank to remove it.</p></div><LaunchLinksFields links={fields} onChange={update} disabled={busy} className="grid grid-cols-1 gap-4" /></section>
    </fieldset>
    <div className="space-y-4 border-t border-border bg-background/30 p-5 sm:p-6">
      {differentWallet && <p className="text-xs leading-5 text-destructive">The connected wallet did not launch this coin. Switch to the launching wallet in Phantom.</p>}
      <Button type="submit" disabled={busy || Boolean(differentWallet)} className="h-12 w-full">{busy ? <Loader2 className="animate-spin" /> : <Save />}{busy ? 'Working…' : wallet.address ? 'Save metadata' : 'Connect Phantom & save'}</Button>
      {launch.hasOverride && <Button type="button" variant="outline" onClick={state.clear} disabled={busy || Boolean(differentWallet)} className="h-auto min-h-10 w-full whitespace-normal">Restore original name & image</Button>}
      <p className="text-center text-xs leading-5 text-muted-foreground">Sign a message to prove ownership. No transaction or network fee. Changes never alter your inscription.</p>
    </div>
  </form>;
}