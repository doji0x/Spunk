import React from 'react';
import { Github, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Image } from '@/components/ui/image';
import WalletButton from '@/components/wallet/WalletButton';

export default function ValidateHeader({ onLearn }) {
  return <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
    <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
      <Link to="/" aria-label="Validate home" className="flex items-center gap-2.5"><Image src="https://media.base44.com/images/public/6aa8d3c82020abebe308c467/84de47794_IMG_1830.jpeg" alt="Validate logo" className="h-8 w-8 rounded-full ring-1 ring-primary/30" /><span className="gold-text font-display font-semibold tracking-[0.18em]">VALIDATE</span></Link>
      <div className="flex items-center gap-2"><Link to="/feed" className="h-8 rounded-full border border-border bg-card px-3 text-xs font-medium leading-8 text-muted-foreground transition hover:border-primary/50 hover:text-foreground">Feed</Link><Link to="/inscribe" className="h-8 rounded-full border border-border bg-card px-3 text-xs font-medium leading-8 text-muted-foreground transition hover:border-primary/50 hover:text-foreground">Inscribe</Link><Link to="/launch" className="hidden h-8 rounded-full border border-border bg-card px-3 text-xs font-medium leading-8 text-muted-foreground transition hover:border-primary/50 hover:text-foreground sm:block">Launch</Link><a href="https://github.com/doji0x/validate" target="_blank" rel="noreferrer" aria-label="Documentation" className="hidden h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-primary/50 hover:text-foreground sm:flex"><Github className="h-4 w-4" /></a>{onLearn && <button onClick={onLearn} aria-label="How it works" className="hidden h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-primary/50 hover:text-foreground sm:flex"><Info className="h-4 w-4" /></button>}<WalletButton /></div>
    </div>
  </header>;
}