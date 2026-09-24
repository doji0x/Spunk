import React from 'react';
import { Zap, ShieldCheck, Wallet, Sparkles, Coins } from 'lucide-react';
const points = [
  { icon: Zap, title: 'One atomic transaction', copy: 'Coin creation and the image commitment are checked together in one successful Solana version 1 transaction.' },
  { icon: ShieldCheck, title: 'Image proven on-chain', copy: 'The complete image bytes, mint address, and SHA-256 are included in the launch transaction.' },
  { icon: Wallet, title: 'Your wallet, your coin', copy: 'The connected account pays and is recorded as creator. The separate mint key is generated in your browser.' },
  { icon: Coins, title: 'Optional first buy', copy: 'When first buys are enabled, the purchase is included in that same atomic transaction with a maximum SOL spend.' }
];
export default function AtomicV1Hero({ enabled = false }) {
  return <section className="overflow-hidden rounded-3xl border border-primary/25 bg-card/60 p-6 gold-glow sm:p-8">
    <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-[10px] tracking-[0.2em] text-primary"><Sparkles className="h-3 w-3" />VERSION 1 / NATIVE WALLET SIGNING</span>
    <h2 className="mt-5 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Launch a coin with its image <span className="gold-text">inscribed in the same breath</span>.</h2>
    <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">An Atomic V1 launch includes the image bytes directly in the launch transaction, alongside the coin creation.</p>
    <div className="mt-7 grid gap-3 sm:grid-cols-2">{points.map(point => { const Icon = point.icon; return <div key={point.title} className="rounded-2xl border border-border bg-background/60 p-4">
      <span className="inline-flex rounded-xl bg-primary/15 p-2 text-primary"><Icon className="h-4 w-4" /></span>
      <h3 className="mt-3 font-display text-sm font-semibold">{point.title}</h3><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{point.copy}</p>
    </div>; })}</div>
    <p className="mt-6 rounded-2xl border border-primary/25 bg-primary/5 p-4 text-xs leading-5 text-muted-foreground">{enabled ? 'Use the native Phantom request to ask the wallet to approve the V1 transaction. Its installed build determines format support.' : 'New launches are disabled by the operator. Existing launch history and recovery remain available.'}</p>
  </section>;
}
