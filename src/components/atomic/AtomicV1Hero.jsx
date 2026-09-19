import React from 'react';
import { Zap, ShieldCheck, Wallet, Sparkles, Coins } from 'lucide-react';

const points = [
  { icon: Zap, title: 'One atomic transaction', copy: 'The coin and its image land together in a single Solana version 1 transaction — or neither lands at all.' },
  { icon: ShieldCheck, title: 'Image proven on-chain', copy: 'The raw image bytes and their SHA-256 live inside the launch transaction, so anyone can verify the art without trusting a server.' },
  { icon: Wallet, title: 'Your wallet, your coin', copy: 'You pay, you sign, and your address is written on-chain as the creator — the mint key is generated in your browser and never leaves it.' },
  { icon: Coins, title: 'Optional first buy', copy: 'Grab the first bag in the very same transaction, before anyone else can see the coin exists.' }
];

export default function AtomicV1Hero() {
  return <section className="overflow-hidden rounded-3xl border border-primary/25 bg-card/60 p-6 gold-glow sm:p-8">
    <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-[10px] tracking-[0.2em] text-primary"><Sparkles className="h-3 w-3" />VERSION 1 · NEW</span>
    <h2 className="mt-5 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Launch a coin with its image <span className="gold-text">inscribed in the same breath</span>.</h2>
    <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Pump.fun coins point at images hosted somewhere else. An Atomic V1 launch embeds the image bytes directly in the launch transaction, permanently binding the art to the coin the second it is created.</p>
    <div className="mt-7 grid gap-3 sm:grid-cols-2">
      {points.map(point => { const Icon = point.icon; return <div key={point.title} className="rounded-2xl border border-border bg-background/60 p-4">
        <span className="inline-flex rounded-xl bg-primary/15 p-2 text-primary"><Icon className="h-4 w-4" /></span>
        <h3 className="mt-3 font-display text-sm font-semibold">{point.title}</h3>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{point.copy}</p>
      </div>; })}
    </div>
    <p className="mt-6 text-xs leading-5 text-muted-foreground">The on-chain name, ticker, and image bytes are immutable once the transaction lands — only the standard links can be edited later.</p>
  </section>;
}