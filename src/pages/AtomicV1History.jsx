import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WalletButton from '@/components/wallet/WalletButton';
import AtomicV1HistoryCard from '@/components/atomic/AtomicV1HistoryCard';
import useAtomicV1History from '@/hooks/useAtomicV1History';

export default function AtomicV1History() {
  const { wallet, launches, loading, error, reload } = useAtomicV1History();
  return <div className="validate-surface min-h-screen text-foreground">
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl"><div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
      <Link to="/atomic-v1" aria-label="Back to launch" className="rounded-full p-2 hover:bg-card"><ArrowLeft size={19} /></Link>
      <div className="flex-1 min-w-0"><p className="font-mono text-[9px] tracking-[0.25em] text-primary">MAINNET · SOL</p><h1 className="truncate font-display font-semibold">My Atomic V1 launches</h1></div>
      <WalletButton />
    </div></header>
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-9 pb-24 sm:px-6">
      {!wallet.address && <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Connect your Phantom wallet to see the coins you launched.</p>}
      {wallet.address && <div className="flex items-center justify-between"><p className="font-mono text-[11px] text-muted-foreground">{launches.length} launch{launches.length === 1 ? '' : 'es'}</p><Button type="button" size="sm" variant="outline" onClick={reload} disabled={loading} className="h-8 rounded-full text-[11px]">{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}Refresh</Button></div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading && !launches.length && <p className="text-sm text-muted-foreground">Loading your launches…</p>}
      {wallet.address && !loading && !launches.length && !error && <div className="rounded-2xl border border-border bg-card p-6 text-center"><p className="text-sm text-muted-foreground">No atomic V1 launches yet.</p><Link to="/atomic-v1" className="mt-3 inline-block text-sm font-semibold text-primary">Launch your first coin</Link></div>}
      {launches.map(launch => <AtomicV1HistoryCard key={launch.requestId} launch={launch} />)}
    </main>
  </div>;
}