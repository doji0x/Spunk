import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import AtomicV1Hero from '@/components/atomic/AtomicV1Hero';

// The launch form is hidden while wallets cannot sign Solana version 1 transactions. The page
// and its launch history stay in place so the feature can be switched back on later.
export default function PublicAtomicV1Launch() {
  return <div className="validate-surface min-h-screen text-foreground">
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl"><div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
      <Link to="/" aria-label="Back home" className="rounded-full p-2 hover:bg-card"><ArrowLeft size={19} /></Link>
      <div className="flex-1 min-w-0"><p className="font-mono text-[9px] tracking-[0.25em] text-primary">MAINNET · SOL</p><h1 className="truncate font-display font-semibold">Atomic V1 Image Launch</h1></div>
      <Link to="/atomic-v1/history" className="shrink-0 font-mono text-[11px] text-primary hover:underline">My launches</Link>
    </div></header>
    <main className="mx-auto max-w-2xl space-y-7 px-4 py-9 pb-24 sm:px-6">
      <AtomicV1Hero />
    </main>
  </div>;
}