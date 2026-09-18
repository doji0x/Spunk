import React from 'react';
import { Coins, ShieldCheck } from 'lucide-react';

export default function PublicLaunchPreview({ input, wallet }) {
  return <aside className="self-start lg:sticky lg:top-24">
    <p className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">Preview</p>
    <div className="gold-glow rounded-2xl border border-primary/30 bg-card p-4">
      <div className="flex gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-muted text-primary ring-1 ring-border"><Coins className="h-8 w-8" /></div>
        <div className="min-w-0"><div className="flex items-baseline gap-2"><h3 className="truncate font-display font-semibold">{input.name || 'Coin name'}</h3><span className="font-mono text-xs text-primary">${input.symbol || 'TICK'}</span></div><p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{wallet.address || 'Connect Phantom'}</p><p className="mt-2 text-sm text-muted-foreground">pump.fun coin linked to a verified Solana inscription.</p></div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs"><span className="font-mono text-muted-foreground">{wallet.network === 'mainnet-beta' ? 'SOLANA MAINNET' : 'SOLANA DEVNET'}</span><span className="flex items-center gap-1 text-primary"><ShieldCheck className="h-3.5 w-3.5" />Wallet signed</span></div>
    </div>
  </aside>;
}