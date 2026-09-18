import React, { useEffect, useState } from 'react';
import { CheckCircle2, LoaderCircle, XCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Progress } from '@/components/ui/progress';

export default function AgentProgress() {
  const [record, setRecord] = useState(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const response = await base44.functions.invoke('publicMintStatus', { action: 'latestAgent' });
      if (active) setRecord(response.data?.record || null);
    };
    load();
    const timer = setInterval(load, 3000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  if (!record) return <section className="mt-12 rounded-2xl border border-border bg-card p-5 text-center text-xs text-muted-foreground">Waiting for the next Fly Brain inscription.</section>;
  const percent = record.totalSize ? Math.min(100, Math.round((record.offset / record.totalSize) * 100)) : 0;
  const complete = record.status === 'success';
  const failed = record.status === 'failed';
  const StatusIcon = complete ? CheckCircle2 : failed ? XCircle : LoaderCircle;
  return <section className="mt-12 rounded-2xl border border-primary/20 bg-card p-5" aria-live="polite">
    <div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[10px] tracking-[0.18em] text-primary">FLY BRAIN LIVE</p><h2 className="mt-2 font-display text-xl font-semibold">{record.name} <span className="text-muted-foreground">${record.symbol}</span></h2></div><StatusIcon className={`h-5 w-5 ${failed ? 'text-destructive' : 'text-primary'} ${!complete && !failed ? 'animate-spin' : ''}`} /></div>
    <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground"><span>{record.offset.toLocaleString()} / {record.totalSize.toLocaleString()} bytes</span><span>{percent}%</span></div>
    <Progress value={percent} className="mt-2 h-2" />
    <div className="mt-5 space-y-2 border-t border-border pt-4">{(record.events || []).map((event, index) => <div key={`${event.at}-${index}`} className="flex gap-3 text-xs"><time className="shrink-0 font-mono text-muted-foreground">{new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><span>{event.message}</span></div>)}</div>
    <p className="mt-4 break-all font-mono text-[10px] text-muted-foreground">Mint: {record.mint}</p>
  </section>;
}