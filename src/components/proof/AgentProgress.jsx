import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, LoaderCircle, XCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';

export default function AgentProgress({ refreshKey = 0, recordId, admin = false }) {
  const { data: record, isPending, isError } = useQuery({
    queryKey: ['agentProgress', refreshKey, recordId, admin],
    queryFn: async () => {
      const response = await base44.functions.invoke('publicMintStatus', { action: admin ? 'adminPof' : 'latestAgent', ...(recordId ? { recordId } : {}) });
      if (response.data?.error) throw new Error(response.data.error);
      return response.data?.record || null;
    },
    refetchInterval: 3000,
    retry: false
  });
  if (!record) return <section className="mt-12 rounded-2xl border border-border bg-card p-5 text-center text-xs text-muted-foreground">{isPending ? 'Loading inscription progress…' : isError ? 'Progress unavailable. Reconnecting automatically…' : 'Waiting for the next POF inscription.'}</section>;
  const percent = record.totalSize ? Math.min(100, Math.round((record.offset / record.totalSize) * 100)) : 0;
  const complete = record.status === 'success';
  const failed = record.status === 'failed';
  const StatusIcon = complete ? CheckCircle2 : failed ? XCircle : LoaderCircle;
  return <section className="mt-12 rounded-2xl border border-primary/20 bg-card p-5" aria-live="polite">
    <div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[10px] tracking-[0.18em] text-primary">POF LIVE · {record.submissionSource === 'manual' ? 'MANUAL SUBMISSION' : 'AGENT ENDPOINT'}</p><h2 className="mt-2 font-display text-xl font-semibold">{record.name} <span className="text-muted-foreground">${record.symbol}</span></h2></div><StatusIcon className={`h-5 w-5 ${failed ? 'text-destructive' : 'text-primary'} ${!complete && !failed ? 'animate-spin' : ''}`} /></div>
    <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground"><span>{record.offset.toLocaleString()} / {record.totalSize.toLocaleString()} bytes</span><span>{percent}%</span></div>
    <Progress value={percent} className="mt-2 h-2" />
    <p className="mt-3 text-xs text-muted-foreground">{complete ? 'Verified on-chain · Complete' : failed ? 'Inscription stopped · Review the admin mint logs' : !record.prepared ? 'Queued / preparing on-chain accounts…' : percent === 100 ? 'Verifying, finalizing and delivering…' : record.coverOffset > 0 ? 'Writing on-chain cover artwork…' : `Writing ${record.mediaType} bytes on-chain…`}{isError && ' · Connection interrupted; retrying automatically.'}</p>
    <div className="mt-5 space-y-2 border-t border-border pt-4">{(record.events || []).map((event, index) => <div key={`${event.at}-${index}`} className="flex gap-3 text-xs"><time className="shrink-0 font-mono text-muted-foreground">{new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><span>{event.message}</span></div>)}</div>
    <p className="mt-4 break-all font-mono text-[10px] text-muted-foreground">Mint: {record.mint}</p>
    {admin && <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">Request: {record.requestId}</p>}
    {failed && admin && <div className="mt-3 text-xs"><p className="text-destructive">{record.errorMessage}</p><Link to="/admin/mints" className="mt-2 inline-block text-primary underline">Review logs and retry this job</Link></div>}
  </section>;
}