import React from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import WalletButton from '@/components/wallet/WalletButton';
import NormalLaunchHero from '@/components/launch/NormalLaunchHero';
import NormalLaunchForm from '@/components/launch/NormalLaunchForm';
import NormalLaunchStatus from '@/components/launch/NormalLaunchStatus';
import useNormalPumpLaunch from '@/hooks/useNormalPumpLaunch';

export default function PublicAtomicV1Launch() {
  const state = useNormalPumpLaunch();
  const pending = state.attempts.some(attempt => attempt.status !== 'confirmed');
  return <div className="validate-surface min-h-screen text-foreground">
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl"><div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
      <Link to="/" aria-label="Back home" className="rounded-full p-2 hover:bg-card"><ArrowLeft size={19} /></Link>
      <div className="min-w-0 flex-1"><p className="font-mono text-[9px] tracking-[0.25em] text-primary">MAINNET / SOL</p><h1 className="truncate font-display font-semibold">Create a coin</h1></div><WalletButton />
    </div></header>
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8 pb-20 sm:px-6">
      <NormalLaunchHero />
      {state.stage && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin text-primary" />{state.stage}</p>}
      {state.error && <p role="alert" className="break-words rounded-xl border border-destructive/40 p-4 text-sm text-destructive">{state.error}</p>}
      {state.attempts.map(attempt => <NormalLaunchStatus key={attempt.requestId} attempt={attempt} busy={state.busy || state.loading} onCheck={state.check} onResume={state.resume} />)}
      {!pending && <NormalLaunchForm state={state} />}
      <Link to="/launch" className="inline-block text-xs text-muted-foreground underline hover:text-primary">Have an inscribed NFT? Use the inscribed-coin launch.</Link>
    </main>
  </div>;
}