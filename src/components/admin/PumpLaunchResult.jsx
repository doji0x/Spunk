import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const states = {
  confirmed: [CheckCircle2, 'Coin and first buy confirmed', 'The create-and-buy transaction is confirmed on Solana mainnet.'],
  pending: [Clock, 'Launch submitted, awaiting confirmation', 'Do not start a second launch. Status refreshes automatically.'],
  expired: [AlertTriangle, 'Launch not landed yet', 'Nothing was created on-chain. Resume to resend the same coin mint.'],
  failed: [AlertTriangle, 'Launch transaction failed', 'Review the error before launching again.'],
};
function Row({ label, href, value }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd><a href={href} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-launch-brand underline">{value}</a></dd></div>; }
export default function PumpLaunchResult({ attempt, busy, error, onResume, onConfigureSharing, onReset }) {
  const splitReady = attempt.phase === 'buy_ready';
  const [Icon, defaultTitle, defaultNote] = states[attempt.status] || states.pending;
  const title = splitReady ? 'Coin created; first buy remains' : defaultTitle;
  const note = splitReady ? 'Resume safely with the same coin mint to submit the first buy.' : defaultNote;
  const ready = attempt.status === 'confirmed' && ['ready', 'submitted'].includes(attempt.feeSharingStatus);
  return <div className="mt-5 rounded-xl border border-launch-border bg-card p-4 text-sm" role="status">
    <div className="flex items-center gap-2 font-semibold"><Icon size={18} />{title}</div><p className="mt-2 text-muted-foreground">{note}</p>
    <dl className="mt-4 space-y-3"><Row label="Coin mint" href={`https://solscan.io/token/${attempt.coinMint}`} value={attempt.coinMint} />{attempt.signature && <Row label="Launch transaction" href={`https://solscan.io/tx/${attempt.signature}`} value={attempt.signature} />}{attempt.feeSharingSignature && <Row label="Fee-sharing transaction" href={`https://solscan.io/tx/${attempt.feeSharingSignature}`} value={attempt.feeSharingSignature} />}</dl>
    <div className="mt-4 grid gap-2 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-2"><span>Pair: <strong>{attempt.quoteSymbol || 'SOL'}</strong></span><span>First buy: <strong>{attempt.firstBuyAmount || '—'}</strong></span><span>Creator fee: <strong>{((attempt.creatorFeeBps || 0) / 100).toFixed(2)}%</strong></span><span>Holder rewards: <strong>{attempt.holderReward ? 'On' : 'Off'}</strong></span></div>
    {ready && <div className="mt-4 rounded-lg border border-launch-border p-3"><p className="font-medium">One-time creator fee split</p><p className="mt-1 text-xs text-muted-foreground">This becomes permanent after submission. Verify every recipient first.</p><Button type="button" size="sm" className="mt-3" disabled={busy} onClick={onConfigureSharing}>{busy && <Loader2 size={14} className="mr-2 animate-spin" />}{attempt.feeSharingStatus === 'submitted' ? 'Check fee sharing' : 'Configure fee sharing permanently'}</Button></div>}
    {attempt.feeSharingStatus === 'configured' && <p className="mt-4 text-xs font-medium text-launch-brand">Creator fee sharing is configured and locked.</p>}
    {(error || attempt.error) && <p role="alert" className="mt-3 break-words text-xs text-destructive">{error || attempt.error}</p>}
    <div className="mt-5 flex flex-wrap items-center gap-4">{attempt.status === 'confirmed' && <a href={`https://pump.fun/coin/${attempt.coinMint}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-launch-brand underline">View on pump.fun<ExternalLink size={14} /></a>}{['pending', 'expired'].includes(attempt.status) && <Button type="button" size="sm" disabled={busy} onClick={onResume}>{splitReady ? 'Continue first buy' : attempt.status === 'expired' ? 'Resend launch' : 'Check status now'}</Button>}{attempt.status !== 'pending' && <Button type="button" variant="outline" size="sm" onClick={onReset}>{attempt.status === 'confirmed' ? 'Launch another coin' : 'Start over'}</Button>}</div>
  </div>;
}