import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Clock, XCircle } from 'lucide-react';

const formatDuration = ms => (!ms ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

export default function AstraJobLogRow({ job }) {
  const [open, setOpen] = useState(false);
  return <div className="rounded-xl border border-border bg-card">
    <button onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 p-4 text-left">
      {open ? <ChevronDown size={15} className="mt-0.5 shrink-0 text-muted-foreground" /> : <ChevronRight size={15} className="mt-0.5 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] tracking-widest text-primary">{job.role || 'WORKER'}</span>
          <span className={`flex items-center gap-1 text-[11px] ${job.failed ? 'text-destructive' : 'text-muted-foreground'}`}>{job.failed ? <XCircle size={12} /> : <CheckCircle2 size={12} />}{job.failed ? 'Failed' : 'Completed'}</span>
          <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground"><Clock size={12} />{formatDuration(job.durationMs)}</span>
        </div>
        <p className="mt-1.5 truncate text-sm text-foreground">{job.job || 'Job'}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{new Date(job.at).toLocaleString()}{job.repo ? ` · ${job.repo}` : ''}</p>
      </div>
    </button>
    {open && <div className="border-t border-border px-4 py-3">
      <p className="font-mono text-[10px] tracking-widest text-muted-foreground">JOB</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{job.job || '—'}</p>
      <p className="mt-4 font-mono text-[10px] tracking-widest text-muted-foreground">RESULT</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{job.result || 'No report recorded.'}</p>
    </div>}
  </div>;
}