import React from 'react';
import { Github, Plus, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ValidateBottomBar() {
  return <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
    <div className="mx-auto grid h-16 max-w-lg grid-cols-3">
      <Link to="/" aria-label="Verify" className="relative flex h-full items-center justify-center text-primary"><span className="absolute top-1.5 h-1 w-1 rounded-full bg-primary" /><ShieldCheck className="h-6 w-6" /></Link>
      <div className="relative flex items-center justify-center"><Link to="/inscribe" aria-label="Inscribe an NFT" className="gold-glow absolute -top-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95"><Plus className="h-7 w-7" strokeWidth={2.5} /></Link></div>
      <a href="https://github.com/doji0x/validate" target="_blank" rel="noreferrer" aria-label="Documentation" className="flex h-full items-center justify-center text-muted-foreground transition hover:text-primary"><Github className="h-6 w-6" /></a>
    </div>
  </nav>;
}