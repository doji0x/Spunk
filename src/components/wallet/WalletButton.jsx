import React from 'react';
import { Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePhantomWallet } from '@/contexts/PhantomWalletContext';

export default function WalletButton() {
  const { address, connecting, connect, disconnect } = usePhantomWallet();
  const short = address ? `${address.slice(0, 4)}…${address.slice(-4)}` : 'Connect';
  return <Button type="button" size="sm" variant="outline" onClick={address ? disconnect : connect} title={address ? 'Disconnect Phantom' : 'Connect Phantom'} className="h-8 max-w-[112px] rounded-full border-border bg-card px-2.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground sm:max-w-none sm:px-3">
    {connecting ? <Loader2 className="animate-spin" /> : <Wallet />}<span className="truncate">{short}</span>
  </Button>;
}