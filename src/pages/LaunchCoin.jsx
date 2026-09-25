import React from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import WalletButton from '@/components/wallet/WalletButton';
import NormalLaunchForm from '@/components/launch/NormalLaunchForm';
import NormalLaunchStatus from '@/components/launch/NormalLaunchStatus';
import useNormalPumpLaunch from '@/hooks/useNormalPumpLaunch';

export default function LaunchCoin() {
  const state = useNormalPumpLaunch();
  const pending = state.attempts.some(attempt => attempt.status !== 'confirmed');
  return <div className="min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-2xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" aria-label="Back home" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border transition hover:bg-card"><ArrowLeft size={18} /></Link>
        <div className="min-w-0 flex-1"><h1 className="truncate font-heading text-lg font-semibold tracking-tight">Create a coin</h1><p className="font-mono text-[9px] tracking-widest text-muted-foreground">PUMP.FUN <span className="text-primary">/</span> SOLANA MAINNET</p></div>
        <WalletButton />
      </div>
    </header>
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-6 pb-16 sm:px-6 sm:py-8">
      <div className="space-y-4 pb-1">
        <p className="text-sm leading-6 text-muted-foreground">Create a pump.fun coin with your own image and details.</p>
        <ol aria-label="Launch steps" className="grid grid-cols-3 gap-3 border-b border-border pb-5 text-xs leading-5">
          {['Add details', 'Approve in Phantom', 'Coin created'].map((label, index) => <li key={label} className="flex min-w-0 flex-col gap-1"><span className="font-mono text-[10px] tracking-widest text-primary">0{index + 1}</span><span className="text-muted-foreground">{label}</span></li>)}
        </ol>
      </div>
      {state.stage && <p role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm"><Loader2 size={16} className="shrink-0 animate-spin text-primary" />{state.stage}</p>}
      {state.error && <p role="alert" className="break-words rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{state.error}</p>}
      {state.attempts.map(attempt => <NormalLaunchStatus key={attempt.requestId} attempt={attempt} busy={state.busy || state.loading} onCheck={state.check} onResume={state.resume} />)}
      {!pending && <NormalLaunchForm state={state} />}
      <p className="pt-2 text-center text-xs leading-5 text-muted-foreground">Already have an inscribed NFT? <Link to="/launch" className="text-primary underline underline-offset-4">Launch an inscribed coin</Link></p>
    </main>
  </div>;
}