import React from 'react';
import { History, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AstraJobLogRow from '@/components/astra/AstraJobLogRow';
import useAstraJobLog from '@/hooks/useAstraJobLog';

export default function AstraJobsPanel() {
  const { jobs, loading, reload } = useAstraJobLog();

  return <div className="pb-4">
    <div className="flex items-start gap-3 pb-6">
      <span className="rounded-2xl bg-primary p-2.5 text-primary-foreground"><History size={20} /></span>
      <div className="flex-1">
        <h2 className="font-display text-2xl font-bold tracking-tight">Worker jobs</h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">Every job Astra handed to a crew specialist, how long it ran, and the report the worker sent back. Newest first.</p>
      </div>
      <Button variant="outline" size="sm" onClick={reload} className="gap-1.5"><RefreshCw size={14} />Refresh</Button>
    </div>
    {loading && <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading job history…</div>}
    {!loading && !jobs.length && <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No jobs yet. Ask Astra to work on a repository and each delegated job will appear here.</div>}
    <div className="flex flex-col gap-3">{jobs.map(job => <AstraJobLogRow key={job.id} job={job} />)}</div>
  </div>;
}