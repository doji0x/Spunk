import React from 'react';
import { BadgeCheck, Clock, ExternalLink, TriangleAlert } from 'lucide-react';
import { Image } from '@/components/ui/image';

const tone = {
  confirmed: { label: 'Confirmed on-chain', className: 'text-primary', Icon: BadgeCheck },
  pending: { label: 'Awaiting finalization', className: 'text-muted-foreground', Icon: Clock },
  incomplete: { label: 'Incomplete', className: 'text-destructive', Icon: TriangleAlert },
  failed: { label: 'Failed', className: 'text-destructive', Icon: TriangleAlert },
  prepared: { label: 'Prepared', className: 'text-muted-foreground', Icon: Clock }
};

export default function AtomicV1HistoryCard({ launch }) {
  const state = tone[launch.status] || tone.prepared;
  const { Icon } = state;
  return <article className="rounded-2xl border border-border bg-card p-4">
    <div className="flex gap-4">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl proof-image">{launch.imageUrl && <Image src={launch.imageUrl} alt={launch.name} className="h-16 w-16" />}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h2 className="truncate font-display font-semibold">{launch.name}</h2><p className="font-mono text-[11px] text-muted-foreground">${launch.symbol}</p></div>
          <p className={`flex shrink-0 items-center gap-1.5 text-[11px] ${state.className}`}><Icon size={13} />{state.label}</p>
        </div>
        {launch.description && <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{launch.description}</p>}
        <dl className="mt-3 grid gap-1 font-mono text-[10px] text-muted-foreground sm:grid-cols-2">
          <div className="truncate">Mint · {launch.coinMint}</div>
          <div>Image · {Number(launch.imageByteLength || 0).toLocaleString()} bytes</div>
          {launch.firstBuyAmount && <div>First buy · {launch.firstBuyAmount} SOL</div>}
          <div>Launched · {new Date(launch.createdDate).toLocaleDateString()}</div>
        </dl>
        {launch.error && <p className="mt-2 text-xs text-destructive">{launch.error}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {launch.transactionSignature && <a href={`https://solscan.io/tx/${launch.transactionSignature}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-[11px] text-primary hover:bg-primary/10">View on-chain inscription <ExternalLink size={12} /></a>}
          <a href={`https://pump.fun/coin/${launch.coinMint}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground">Pump.fun <ExternalLink size={12} /></a>
        </div>
      </div>
    </div>
  </article>;
}