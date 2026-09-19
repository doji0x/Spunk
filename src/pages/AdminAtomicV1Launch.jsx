import React, { useEffect, useState } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import AtomicV1Form from '@/components/atomic/AtomicV1Form';
import AtomicV1Result from '@/components/atomic/AtomicV1Result';
import useAtomicV1Launch from '@/hooks/useAtomicV1Launch';

export default function AdminAtomicV1Launch() {
  const state = useAtomicV1Launch();
  const [user, setUser] = useState();
  useEffect(() => { base44.auth.me().then(setUser); }, []);
  if (!user) return <div className="validate-surface flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" /></div>;
  if (user.role !== 'admin') return <main className="validate-surface flex min-h-screen items-center justify-center px-5"><div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center"><h1 className="font-display text-xl font-semibold">Admin access required</h1><p className="mt-2 text-sm text-muted-foreground">Atomic V1 launches are restricted to administrator accounts.</p><Link to="/" className="mt-5 inline-block text-sm text-primary underline">Return home</Link></div></main>;
  return <div className="validate-surface min-h-screen text-foreground"><header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl"><div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4"><Link to="/admin/mint" aria-label="Back to admin" className="rounded-full p-2 hover:bg-card"><ArrowLeft size={19} /></Link><div><p className="font-mono text-[9px] tracking-[0.25em] text-primary">ADMIN · MAINNET · SOL</p><h1 className="font-display font-semibold">Atomic V1 Image Launch</h1></div></div></header>
    <main className="mx-auto max-w-2xl space-y-7 px-4 py-9 pb-24 sm:px-6"><div className="flex items-start gap-4"><span className="rounded-2xl bg-primary p-3 text-primary-foreground"><ShieldCheck size={21} /></span><div><h2 className="font-display text-3xl font-bold tracking-tight">One launch. One image. One signature.</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Create a Pump.fun coin and permanently embed a tiny image inside the same Solana V1 launch transaction. The normal Pump image and transaction-inscribed bytes are identical.</p></div></div>
      {!state.result && <AtomicV1Form state={state} />}<AtomicV1Result result={state.result} onCheck={state.check} busy={state.busy} />
    </main></div>;
}