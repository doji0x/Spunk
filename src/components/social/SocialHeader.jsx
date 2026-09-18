import React from 'react';
import { Link } from 'react-router-dom';
import { Image } from '@/components/ui/image';
import WalletButton from '@/components/wallet/WalletButton';

export default function SocialHeader() {
  return <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
    <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
      <Link to="/" className="flex items-center gap-2.5"><Image src="https://media.base44.com/images/public/6aa8d3c82020abebe308c467/84de47794_IMG_1830.jpeg" alt="Validate logo" className="h-8 w-8 rounded-full ring-1 ring-primary/30" /><span className="gold-text font-display font-semibold tracking-[0.16em]">VALIDATE</span></Link>
      <nav className="flex items-center gap-2"><Link to="/feed" className="rounded-full bg-primary/10 px-3 py-2 text-xs font-medium text-primary">Feed</Link><WalletButton /></nav>
    </div>
  </header>;
}