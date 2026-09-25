import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Rocket } from 'lucide-react';

export default function NormalLaunchHero({ showLaunchLink = false }) {
  return <section className="rounded-3xl border border-primary/25 bg-card/60 p-6 sm:p-8">
    <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-primary"><Rocket size={14} />PUMP.FUN / SOLANA MAINNET</span>
    <h2 className="mt-5 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Your idea. <span className="gold-text">Your coin.</span></h2>
    <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Upload an image, add your coin details, and approve creation in Phantom. No inscription required. No automatic buy.</p>
    <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span>01 · Add details</span><span>02 · Approve in Phantom</span><span>03 · Coin created</span></div>
    {showLaunchLink && <Link to="/atomic-v1" className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Create a coin <ArrowUpRight size={16} /></Link>}
  </section>;
}