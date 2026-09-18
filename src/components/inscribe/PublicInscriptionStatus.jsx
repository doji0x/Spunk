import React from 'react';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
export default function PublicInscriptionStatus({ state }) {
  if (!state.busy && !state.error && !state.pending && !state.result) return null;
  return <section aria-live="polite" className="mt-5 rounded-3xl border border-border bg-card p-5 text-sm">
    {(state.busy || state.pending) && <><div className="mb-2 flex justify-between gap-3"><span>{state.activity}</span><span className="font-mono">{state.progress}%</span></div><Progress value={state.progress} /></>}
    {state.pending?.status === 'in_progress' && <p className="mt-3 text-xs leading-5 text-muted-foreground">Our server is writing your image on-chain and will deliver the finished NFT to your wallet. You can safely close this page — reconnect the same wallet any time to check progress.</p>}
    {state.error && <p role="alert" className="mt-3 text-destructive">{state.error}</p>}
    {state.result && <div className="flex gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-primary" /><div><p className="font-semibold">Your NFT is inscribed and delivered.</p><a href={`https://solscan.io/token/${state.result.mint}`} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 break-all font-mono text-xs text-primary">{state.result.mint}<ExternalLink className="h-3 w-3 shrink-0" /></a></div></div>}
  </section>;
}