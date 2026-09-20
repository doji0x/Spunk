import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, RefreshCw, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import AstraJobLogRow from '@/components/astra/AstraJobLogRow';
import useAstraJobLog from '@/hooks/useAstraJobLog';

export default function AdminAstraJobs() {
  const [user, setUser] = useState();
  const { jobs, loading, reload } = useAstraJobLog();
  useEffect(() => { base44.auth.me().then(setUser); }, []);

  if (!user) return <div className="validate-surface flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" /></div>;
  if (user.role !== 'admin') return <main className="validate-surface flex min-h-screen items-center justify-center px-5"><div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center"><h1 className="font-display text-xl font-semibold">Admin access required</h1><Link to="/" className="mt-5 inline-block text-sm text-primary underline">Return home</Link></div></main>;

  return <div className="validate-surface min-h-screen text-foreground">
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-2">
        <Link to="/admin/astra" aria-label="Back to Astra" className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-card"><X className="h-5 w-5" /></Link>
        <div className="flex-1"><p className="font-mono text-[10px] leading-none tracking-[0.3em] text-primary">ADMIN · ASTRA</p><h1 className="font-display font-semibold leading-tight">Job history</h1></div>
        <Button variant="outline" size="sm" onClick={reload} className="gap-1.5"><RefreshCw size={14} />Refresh</Button>
      </div>
    </header>
    <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
      <div className="flex items-start gap-3 py-7">
        <span className="rounded-2xl bg-primary p-2.5 text-primary-foreground"><History size={20} /></span>
        <div><h2 className="font-display text-2xl font-bold tracking-tight">Worker jobs</h2><p className="mt-1.5 text-sm leading-6 text-muted-foreground">Every job Astra handed to a crew specialist, how long it ran, and the report the worker sent back. Newest first.</p></div>
      </div>
      {loading && <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading job history…</div>}
      {!loading && !jobs.length && <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No jobs yet. Ask Astra to work on a repository and each delegated job will appear here.</div>}
      <div className="flex flex-col gap-3">{jobs.map(job => <AstraJobLogRow key={job.id} job={job} />)}</div>
    </main>
  </div>;
}