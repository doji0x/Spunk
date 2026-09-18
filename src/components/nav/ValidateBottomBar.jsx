import React from 'react';
import { MessageSquare, Plus, Rocket, ShieldCheck, User } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { usePhantomWallet } from '@/contexts/PhantomWalletContext';

export default function ValidateBottomBar({ variant = 'default' }) {
  const { pathname } = useLocation();
  const { address } = usePhantomWallet();
  const tabs = [
    { to: '/', label: 'Verify', icon: ShieldCheck, active: pathname === '/' },
    { to: '/inscribe', label: 'Inscribe', icon: Plus, active: pathname === '/inscribe' },
    { to: '/launch', label: 'Launch', icon: Rocket, active: pathname === '/launch' },
    { to: '/feed', label: 'Feed', icon: MessageSquare, active: pathname === '/feed' },
    { to: address ? `/profile/${address}` : '/feed', label: 'Profile', icon: User, active: pathname.startsWith('/profile/') }
  ];
  const isX = variant === 'x';
  return <nav className={isX ? 'x-bottom' : 'fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl'}>
    <div className={isX ? 'x-bottominner mx-auto' : 'mx-auto grid h-16 max-w-lg grid-cols-5'}>{tabs.map(tab => { const Icon = tab.icon; return <Link key={tab.label} to={tab.to} aria-label={tab.label} className={isX ? `x-navitem ${tab.active ? 'active' : ''}` : `relative flex h-full flex-col items-center justify-center gap-1 transition ${tab.active ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}>{!isX && tab.active && <span className="absolute top-1.5 h-1 w-1 rounded-full bg-primary" />}<Icon className={isX ? '' : 'h-5 w-5'} /><span className={isX ? '' : 'text-[9px] font-medium'}>{tab.label}</span></Link>; })}</div>
  </nav>;
}