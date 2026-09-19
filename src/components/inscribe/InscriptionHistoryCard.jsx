import React from 'react';
import { CheckCircle2, ExternalLink, Loader2, PauseCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const tone = {
  success: { icon: CheckCircle2, label: 'Complete', className: 'text-primary' },
  in_progress: { icon: Loader2, label: 'Inscribing on-chain', className: 'text-muted-foreground' },
  failed: { icon: PauseCircle, label: 'Paused', className: 'text-destructive' }
};

export default function InscriptionHistoryCard({ record }) {
  const status = tone[record.status] || tone.in_progress;
  const Icon = status.icon;
  const percent = record.totalSize ? Math.min(100, Math.round((record.offset / record.totalSize) * 100)) : 0;
  return <li className="rounded-2xl border border-border bg-card p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate font-display font-semibold">{record.name}</p>
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{record.symbol} · {record.mediaType}</p>
      </div>
      <span className={`flex shrink-0 items-center gap-1.5 text-xs ${status.className}`}>
        <Icon className={`h-4 w-4 ${record.status === 'in_progress' ? 'animate-spin' : ''}`} />{status.label}
      </span>
    </div>
    {record.status !== 'success' && <div className="mt-3"><Progress value={percent} /><p className="mt-1.5 font-mono text-[11px] text-muted-foreground">{percent}% · {record.offset.toLocaleString()} / {record.totalSize.toLocaleString()} bytes on-chain</p></div>}
    {record.status === 'failed' && record.errorMessage && <p className="mt-2 text-xs leading-5 text-destructive">{record.errorMessage}</p>}
    <a href={`https://solscan.io/token/${record.mint}`} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1 break-all font-mono text-[11px] text-primary">{record.mint}<ExternalLink className="h-3 w-3 shrink-0" /></a>
  </li>;
}