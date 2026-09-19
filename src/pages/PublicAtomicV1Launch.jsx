import React from 'react';
import { ArrowLeft } from 'lucide-react';
import AtomicV1Hero from '@/components/atomic/AtomicV1Hero';
import { Link } from 'react-router-dom';
import AtomicV1Form from '@/components/atomic/AtomicV1Form';
import AtomicV1Result from '@/components/atomic/AtomicV1Result';
import WalletButton from '@/components/wallet/WalletButton';
import usePublicAtomicV1Launch from '@/hooks/usePublicAtomicV1Launch';

export default function PublicAtomicV1Launch() {
  const state = usePublicAtomicV1Launch();
  return <div className="validate-surface min-h-screen text-foreground">
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl"><div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
      <Link to="/" aria-label="Back home" className="rounded-full p-2 hover:bg-card"><ArrowLeft size={19} /></Link>
      <div className="flex-1 min-w-0"><p className="font-mono text-[9px] tracking-[0.25em] text-primary">MAINNET · SOL</p><h1 className="truncate font-display font-semibold">Atomic V1 Image Launch</h1></div>
      <Link to="/atomic-v1/history" className="shrink-0 font-mono text-[11px] text-primary hover:underline">My launches</Link>
      <WalletButton />
    </div></header>
    <main className="mx-auto max-w-2xl space-y-7 px-4 py-9 pb-24 sm:px-6">
      <AtomicV1Hero />
      {!state.wallet.address && <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Connect your Phantom wallet to start an atomic V1 launch.</p>}
      {!state.result && <AtomicV1Form state={state} />}
      <AtomicV1Result result={state.result} onCheck={state.check} busy={state.busy} linksTo={null} />
    </main>
  </div>;
}