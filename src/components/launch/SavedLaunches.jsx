import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SavedLaunches({ attempts, busy, onResume, onCheck }) {
  if (!attempts.length) return null;
  return <section className="space-y-3" aria-label="Saved launches">
    {attempts.map(attempt => <article key={attempt.requestId} className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <div className="flex items-start gap-3"><RotateCcw size={18} className="mt-1 shrink-0 text-primary" /><div className="min-w-0"><p className="font-mono text-[10px] tracking-widest text-primary">SAVED LAUNCH · {attempt.status.toUpperCase()}</p><h2 className="mt-2 font-semibold">{attempt.name} <span className="text-muted-foreground">· {attempt.symbol}</span></h2><p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">{attempt.coinMint}</p></div></div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">Check confirmation or resume using the same coin mint. {attempt.status === 'pending' ? 'No new transaction will be requested while this one may still land.' : 'Signing requires the original wallet and browser.'}</p>
      <div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onCheck(attempt)}>Check status</Button><Button type="button" size="sm" disabled={busy} onClick={() => onResume(attempt)}>Resume launch</Button></div>
    </article>)}
  </section>;
}