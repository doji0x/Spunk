import React from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import PublicLaunchForm from '@/components/launch/PublicLaunchForm';
import PublicLaunchResult from '@/components/launch/PublicLaunchResult';
import PublicLaunchPreview from '@/components/launch/PublicLaunchPreview';
import InscribedLaunchGuide from '@/components/launch/InscribedLaunchGuide';
import ResumeLaunchBanner from '@/components/launch/ResumeLaunchBanner';
import PublicLaunchPreflight from '@/components/launch/PublicLaunchPreflight';
import EditLaunchLinksCard from '@/components/launch/EditLaunchLinksCard';
import WalletButton from '@/components/wallet/WalletButton';
import ValidateBottomBar from '@/components/nav/ValidateBottomBar';
import usePublicPumpLaunch from '@/hooks/usePublicPumpLaunch';

export default function PublicLaunch() {
  const state = usePublicPumpLaunch();
  return <div className="validate-surface min-h-screen text-foreground">
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl"><div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-2"><Link to="/" aria-label="Close launch" className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-card"><X className="h-5 w-5" /></Link><div className="flex-1"><p className="font-mono text-[10px] leading-none tracking-[0.3em] text-primary">NEW LAUNCH</p><h1 className="font-display font-semibold leading-tight">Create your coin</h1></div><WalletButton /></div></header>
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-8 pb-24 sm:px-6 lg:grid-cols-[1fr_360px]">
      <div><div className="mb-7"><h2 className="font-display text-3xl font-bold tracking-tight">Launch from your wallet</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Connect Phantom and launch a pump.fun coin from your own unique inscribed NFT or inscribed NFT collection. You remain the creator and approve the Solana transaction.</p><p className="mt-3 max-w-xl rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground"><span className="font-semibold text-primary">Anti-bundle protection:</span> coin launch and developer buy are two separate functions and transactions.</p></div><InscribedLaunchGuide /><ResumeLaunchBanner attempts={state.pendingAttempts} busy={state.busy} onResume={state.resume} /><PublicLaunchForm state={state} /><PublicLaunchPreflight preflight={state.preflight} /><PublicLaunchResult result={state.result} />{state.result?.status === 'confirmed' && <EditLaunchLinksCard coinMint={state.result.coinMint} wallet={state.wallet} initial={state.result.socials} />}</div>
      <PublicLaunchPreview input={state.input} wallet={state.wallet} />
    </div>
    <ValidateBottomBar />
  </div>;
}