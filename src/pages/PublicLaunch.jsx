import React from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import PublicLaunchForm from '@/components/launch/PublicLaunchForm';
import PublicLaunchResult from '@/components/launch/PublicLaunchResult';
import PublicLaunchPreview from '@/components/launch/PublicLaunchPreview';
import WalletButton from '@/components/wallet/WalletButton';
import usePublicPumpLaunch from '@/hooks/usePublicPumpLaunch';

export default function PublicLaunch() {
  const state = usePublicPumpLaunch();
  return <div className="validate-surface min-h-screen text-foreground">
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl"><div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-2"><Link to="/" aria-label="Close launch" className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-card"><X className="h-5 w-5" /></Link><div className="flex-1"><p className="font-mono text-[10px] leading-none tracking-[0.3em] text-primary">NEW LAUNCH</p><h1 className="font-display font-semibold leading-tight">Create your coin</h1></div><WalletButton /></div></header>
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-8 pb-24 sm:px-6 lg:grid-cols-[1fr_360px]">
      <div><div className="mb-7"><h2 className="font-display text-3xl font-bold tracking-tight">Launch from your wallet</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Connect Phantom and create a pump.fun coin linked to an on-chain inscription. You remain the creator and approve the Solana transaction.</p></div><PublicLaunchForm state={state} /><PublicLaunchResult result={state.result} /></div>
      <PublicLaunchPreview input={state.input} wallet={state.wallet} />
    </div>
  </div>;
}