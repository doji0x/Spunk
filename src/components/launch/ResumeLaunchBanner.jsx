import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ResumeLaunchBanner({ attempts, busy, onResume }) {
  const attempt = attempts?.[0];
  if (!attempt) return null;
  const submitted = attempt.status === 'pending';
  return <section aria-live="polite" className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-4">
    <div className="flex items-start gap-3">
      <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] leading-none tracking-[0.3em] text-primary">UNFINISHED LAUNCH</p>
        <h3 className="mt-1.5 font-semibold">{attempt.name} <span className="text-muted-foreground">· {attempt.symbol}</span></h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{submitted ? 'This launch was sent but never confirmed here. Resume to check the chain — the same coin is reused, so nothing is duplicated.' : 'This launch was prepared but never sent. Resume to sign it again with the same coin mint.'}</p>
        <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">Coin: {attempt.coinMint}</p>
      </div>
    </div>
    <Button type="button" size="sm" disabled={busy} onClick={() => onResume(attempt)} className="mt-3 w-full gold-glow sm:w-auto">{busy ? 'Working…' : submitted ? 'Check & resume' : 'Resume launch'}</Button>
  </section>;
}