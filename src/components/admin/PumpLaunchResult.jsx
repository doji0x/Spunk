import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const states = {
  confirmed: { icon: CheckCircle2, title: 'Coin launched on Solana mainnet', note: 'Creation confirmed. No initial buy was made.' },
  pending: { icon: Clock, title: 'Launch submitted, awaiting confirmation', note: 'The transaction was sent. Status refreshes automatically; you can also check it now. Do not start a second launch.' },
  expired: { icon: AlertTriangle, title: 'Launch not landed yet', note: 'Nothing was created on-chain. Resume to resend the same coin mint.' },
  failed: { icon: AlertTriangle, title: 'Launch transaction failed', note: 'Review the error before launching again.' },
};

function Row({ label, href, value }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd><a href={href} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-launch-brand underline">{value}</a></dd></div>;
}

export default function PumpLaunchResult({ attempt, busy, error, onResume, onReset }) {
  const state = states[attempt.status] || states.pending;
  const Icon = state.icon;
  const tone = attempt.status === 'confirmed' ? 'text-launch-brand' : attempt.status === 'failed' ? 'text-destructive' : 'text-foreground';
  return <div className="mt-5 rounded-xl border border-launch-border bg-card p-4 text-sm" role="status">
    <div className={`flex items-center gap-2 font-semibold ${tone}`}><Icon size={18} />{state.title}</div>
    <p className="mt-2 text-muted-foreground">{state.note}</p>
    <dl className="mt-4 space-y-3">
      <Row label="Coin mint" href={`https://solscan.io/token/${attempt.coinMint}`} value={attempt.coinMint} />
      {attempt.bondingCurve && <Row label="Bonding curve" href={`https://solscan.io/account/${attempt.bondingCurve}`} value={attempt.bondingCurve} />}
      {attempt.signature && <Row label="Transaction" href={`https://solscan.io/tx/${attempt.signature}`} value={attempt.signature} />}
      {attempt.metadataUri && <Row label="Metadata URI" href={attempt.metadataUri} value={attempt.metadataUri} />}
    </dl>
    {(error || attempt.error) && <p role="alert" className="mt-3 break-words text-xs text-destructive">{error || attempt.error}</p>}
    <div className="mt-5 flex flex-wrap items-center gap-4">
      {attempt.status === 'confirmed' && <a href={`https://pump.fun/coin/${attempt.coinMint}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-launch-brand underline">View on pump.fun<ExternalLink size={14} /></a>}
      {['pending', 'expired'].includes(attempt.status) && <Button type="button" size="sm" disabled={busy} onClick={onResume} className="bg-launch-brand text-primary-foreground hover:bg-launch-brand/90">{busy ? <><Loader2 size={14} className="mr-2 animate-spin" />Checking…</> : attempt.status === 'expired' ? 'Resend launch' : 'Check status now'}</Button>}
      {attempt.status !== 'pending' && <Button type="button" variant="outline" size="sm" onClick={onReset}>{attempt.status === 'confirmed' ? 'Launch another coin' : 'Start over'}</Button>}
    </div>
    <p className="mt-3 text-xs text-muted-foreground">pump.fun display may take time to index. The coin's metadata is served by this app from the on-chain inscription; it does not own or lock the source NFT.</p>
  </div>;
}