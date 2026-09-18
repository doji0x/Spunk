import React from 'react';
import { Link } from 'react-router-dom';
import { Image } from '@/components/ui/image';
import WalletButton from '@/components/wallet/WalletButton';

export default function SocialHeader() {
  return <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
    <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
      <Link to="/" aria-label="Punks home" className="flex items-center gap-2.5"><Image src="https://media.base44.com/images/public/6aa8d3c82020abebe308c467/8d0945030_solana_pixel_avatar_under_1mb.png" alt="Punks logo" className="h-8 w-8 rounded-lg ring-1 ring-primary/30" /><span className="leading-none"><span className="gold-text block font-display font-semibold tracking-[0.14em]">PUNKS</span><span className="mt-1 hidden font-mono text-[7px] tracking-[0.12em] text-muted-foreground sm:block">SOLANA CYPHER PUNKS</span></span></Link>
      <nav className="flex items-center gap-2"><Link to="/feed" className="rounded-full bg-primary/10 px-3 py-2 text-xs font-medium text-primary">Feed</Link><WalletButton /></nav>
    </div>
  </header>;
}