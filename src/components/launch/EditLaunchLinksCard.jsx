import React from 'react';
import { Link2, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LaunchLinksFields from '@/components/launch/LaunchLinksFields';
import useLaunchLinks from '@/hooks/useLaunchLinks';

// Links are stored off-chain, so editing them after launch needs a signature only — no transaction.
export default function EditLaunchLinksCard({ coinMint, wallet, initial }) {
  const state = useLaunchLinks(initial);
  if (!coinMint || !wallet?.address) return null;
  return <section className="mt-6 rounded-2xl border border-border bg-card p-5 text-left">
    <div className="flex items-start gap-3"><span className="rounded-xl bg-primary/10 p-2 text-primary"><Link2 size={18} /></span><div><h2 className="font-semibold">Edit your coin links</h2><p className="mt-1 text-sm text-muted-foreground">Sign with your wallet to update these. No on-chain transaction and no fee — pump.fun may take up to a day to show the change.</p></div></div>
    <div className="mt-4"><LaunchLinksFields links={state.links} onChange={state.update} disabled={state.busy} /></div>
    {state.error && <p className="mt-3 text-xs text-destructive">{state.error}</p>}
    <div className="mt-4 flex items-center gap-3">
      <Button type="button" onClick={() => state.saveAsWallet(wallet, coinMint)} disabled={state.busy} className="gap-2">{state.busy && <Loader2 className="h-4 w-4 animate-spin" />}{state.busy ? 'Signing…' : 'Save links'}</Button>
      {state.saved && <span className="flex items-center gap-1.5 text-xs text-primary"><CheckCircle2 className="h-4 w-4" />Links updated</span>}
    </div>
  </section>;
}