import React from 'react';
import { ShieldAlert, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const severityColors = { high: 'text-destructive bg-destructive/10', medium: 'text-primary bg-primary/10', low: 'text-muted-foreground bg-secondary' };

export default function AstraAuditCard({ issue, busy, onDecision }) {
  const pending = issue.status === 'pending';
  const running = issue.runStatus === 'running';
  if (!pending) return <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm" aria-live="polite">
    <div className="flex items-center gap-2">{running ? <Loader2 size={15} className="animate-spin text-primary" /> : <CheckCircle2 size={15} className="text-muted-foreground" />}<span className="capitalize">{issue.status}</span><span className="text-muted-foreground">{issue.supersededBy ? '· revised plan below' : running ? issue.status === 'approved' ? '· applying fix and auditing' : '· requesting revised plan' : issue.status === 'resolved' ? '· audit passed' : ''}</span></div>
    <details className="mt-2 text-muted-foreground"><summary className="cursor-pointer">View finding and plan</summary><p className="mt-2 whitespace-pre-wrap">{issue.finding}</p><p className="mt-2 whitespace-pre-wrap">{issue.proposedFix}</p></details>
    {issue.runStatus === 'failed' && !issue.supersededBy && <div className="mt-3 space-y-2"><p className="text-destructive">{issue.runError || 'The follow-up run stopped.'}</p><Button size="sm" variant="outline" disabled={busy} onClick={() => onDecision(issue.id, 'retry')}>Retry follow-up</Button></div>}
  </div>;
  return <section className="rounded-2xl border border-primary/30 bg-card p-4" aria-label="Audit fix approval">
    <div className="flex items-center gap-2"><ShieldAlert size={17} className="text-primary" /><h3 className="font-semibold">Audit approval required</h3><span className={`ml-auto rounded px-2 py-0.5 font-mono text-[10px] uppercase ${severityColors[issue.severity]}`}>{issue.severity}</span></div>
    <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{issue.finding}</p>
    <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Proposed fix</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{issue.proposedFix}</p>
    <p className="mt-3 break-all font-mono text-xs text-muted-foreground">{issue.repo} · {issue.branch}</p><ul className="mt-1 text-xs text-muted-foreground">{issue.filePaths?.map(path => <li key={path} className="break-all">{path}</li>)}</ul>
    <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => onDecision(issue.id, 'approve')}>Approve & run fix</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => onDecision(issue.id, 'reject')}>Reject & revise</Button></div>
  </section>;
}