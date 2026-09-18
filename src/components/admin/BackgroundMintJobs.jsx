import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Progress } from '@/components/ui/progress';

const progress = job => job.totalSize ? Math.min(100, Math.round(((job.offset || 0) / job.totalSize) * 100)) : 0;

export default function BackgroundMintJobs() {
  const [jobs, setJobs] = useState([]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const records = await base44.entities.MintRecord.filter({ status: 'in_progress' }, '-created_date', 20);
      if (active) setJobs(records.filter(record => record.imageUri));
    };
    load();
    const timer = window.setInterval(load, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  if (!jobs.length) return null;
  return <section className="mt-5 rounded-2xl border border-primary/25 bg-card p-5" aria-live="polite">
    <div className="mb-4 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-primary" /><h3 className="font-semibold">Background mints</h3><span className="ml-auto text-xs text-muted-foreground">Safe to close this browser</span></div>
    <div className="space-y-4">{jobs.map(job => { const value = progress(job); return <div key={job.id}><div className="mb-2 flex justify-between gap-4 text-sm"><span className="truncate">{job.name} <span className="font-mono text-muted-foreground">${job.symbol}</span></span><span className="shrink-0 font-mono">{value}%</span></div><Progress value={value} /><p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{job.mint} · {(job.offset || 0).toLocaleString()} / {(job.totalSize || 0).toLocaleString()} bytes</p></div>; })}</div>
  </section>;
}