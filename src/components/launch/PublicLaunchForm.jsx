import React from 'react';
import { Loader2, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function PublicLaunchForm({ state }) {
  const { wallet, input, setInput, busy, error, launch } = state;
  return <form onSubmit={launch} className="space-y-5 rounded-2xl border border-[#dce1d5] bg-white p-5 text-left shadow-sm sm:p-7">
    <div className="space-y-2"><Label htmlFor="launch-network">Network</Label><select id="launch-network" value={wallet.network} onChange={event => wallet.setNetwork(event.target.value)} disabled={busy} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="mainnet-beta">Mainnet</option><option value="devnet">Devnet — connection testing only</option></select></div>
    <div className="space-y-2"><Label htmlFor="public-inscription">Inscribed NFT mint</Label><Input id="public-inscription" required maxLength={44} value={input.inscribedMint} disabled={busy} placeholder="Source NFT mint address" className="font-mono text-xs" onChange={event => setInput({ ...input, inscribedMint: event.target.value })} /><p className="text-xs leading-5 text-muted-foreground">Your connected wallet must hold the NFT or be its update authority.</p></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="public-name">Coin name</Label><Input id="public-name" required maxLength={32} value={input.name} disabled={busy} placeholder="Coin name" onChange={event => setInput({ ...input, name: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="public-symbol">Ticker</Label><Input id="public-symbol" required maxLength={10} value={input.symbol} disabled={busy} placeholder="TICKER" onChange={event => setInput({ ...input, symbol: event.target.value.toUpperCase() })} /></div></div>
    {wallet.address && <p className="break-all rounded-lg bg-[#f4f6f0] p-3 font-mono text-[10px] text-[#657456]">Launching as {wallet.address}</p>}
    {wallet.network === 'devnet' && <p className="text-sm text-[#8a641d]">Phantom can connect on Devnet, but pump.fun only accepts Mainnet launches.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button className="w-full bg-launch-brand text-primary-foreground hover:bg-launch-brand/90" disabled={busy || wallet.network !== 'mainnet-beta'}>{busy ? <><Loader2 className="animate-spin" />Waiting for Phantom…</> : <><Rocket />{wallet.address ? 'Review launch in Phantom' : 'Connect Phantom to launch'}</>}</Button>
  </form>;
}