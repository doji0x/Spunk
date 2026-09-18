import React from 'react';
import { Loader2, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PublicLaunchAdvancedOptions from '@/components/launch/PublicLaunchAdvancedOptions';

export default function PublicLaunchForm({ state }) {
  const { wallet, input, setInput, busy, loading, settings, error, launch } = state;
  const shareTotal = input.feeRecipients.reduce((sum, item) => sum + (Number(item.shareBps) || 0), 0);
  const invalidRewards = input.feeRecipients.length > 0 && (shareTotal !== 10000 || input.feeRecipients.some(item => !item.value));
  return <form onSubmit={launch} className="space-y-6 text-left">
    <div className="space-y-2"><Label htmlFor="launch-network" className="text-xs uppercase tracking-wider text-muted-foreground">Network</Label><select id="launch-network" value={wallet.network} onChange={event => wallet.setNetwork(event.target.value)} disabled={busy} className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"><option value="mainnet-beta">Mainnet</option><option value="devnet">Devnet — connection testing only</option></select></div>
    <div className="space-y-2"><Label htmlFor="public-inscription" className="text-xs uppercase tracking-wider text-muted-foreground">Inscribed NFT mint</Label><Input id="public-inscription" required maxLength={44} value={input.inscribedMint} disabled={busy} placeholder="Source NFT mint address" className="h-11 bg-card font-mono text-xs" onChange={event => setInput({ ...input, inscribedMint: event.target.value })} /><p className="text-xs leading-5 text-muted-foreground">Your connected wallet must hold the NFT or be its update authority.</p></div>
    <div className="grid gap-4 sm:grid-cols-[1fr_160px]"><div className="space-y-2"><Label htmlFor="public-name" className="text-xs uppercase tracking-wider text-muted-foreground">Coin name</Label><Input id="public-name" required maxLength={32} value={input.name} disabled={busy} placeholder="Coin name" className="h-11 bg-card" onChange={event => setInput({ ...input, name: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="public-symbol" className="text-xs uppercase tracking-wider text-muted-foreground">Ticker</Label><Input id="public-symbol" required maxLength={10} value={input.symbol} disabled={busy} placeholder="TICKER" className="h-11 bg-card font-mono uppercase" onChange={event => setInput({ ...input, symbol: event.target.value.toUpperCase() })} /></div></div>
    {loading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin" />Loading current pump.fun reward settings…</p> : <PublicLaunchAdvancedOptions input={input} setInput={setInput} settings={settings} disabled={busy} />}
    {wallet.address && <p className="break-all rounded-2xl border border-border bg-card/60 p-4 font-mono text-[10px] text-muted-foreground">Launching as <span className="text-foreground">{wallet.address}</span></p>}
    {wallet.network === 'devnet' && <p className="rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm text-primary">Phantom can connect on Devnet, but pump.fun only accepts Mainnet launches.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button size="lg" className="gold-glow w-full rounded-full px-8 font-semibold sm:w-auto" disabled={busy || loading || invalidRewards || wallet.network !== 'mainnet-beta'}>{busy ? <><Loader2 className="animate-spin" />Waiting for Phantom…</> : <><Rocket />{wallet.address ? 'Review launch in Phantom' : 'Connect Phantom to launch'}</>}</Button>
  </form>;
}