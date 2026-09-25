import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Image } from '@/components/ui/image';

const labels = { draft: 'Saved launch', prepared: 'Ready for approval', pending: 'Awaiting confirmation', confirmed: 'Coin created', expired: 'Approval expired', failed: 'Transaction failed' };
export default function NormalLaunchStatus({ attempt, busy, onCheck, onResume }) {
  if (!attempt) return null;
  const confirmed = attempt.status === 'confirmed';
  const resumable = ['draft', 'prepared', 'expired', 'failed'].includes(attempt.status);
  return <section className="space-y-4 rounded-2xl border border-primary/25 bg-card p-5">
    <div className="flex items-center gap-3">{attempt.imageUrl && <Image src={attempt.imageUrl} alt={attempt.name} className="h-14 w-14 rounded-xl" fittingType="fit" />}<div className="min-w-0"><h3 className="truncate font-semibold">{attempt.name} <span className="text-muted-foreground">{attempt.symbol}</span></h3><p className="mt-1 flex items-center gap-2 text-sm text-primary">{confirmed ? <CheckCircle2 size={15} /> : attempt.status === 'pending' ? <Loader2 size={15} className="animate-spin" /> : null}{labels[attempt.status] || 'Check launch status'}</p></div></div>
    <div><p className="mb-1 text-xs text-muted-foreground">Coin mint</p><p className="break-all font-mono text-xs">{attempt.coinMint}</p></div>
    {!confirmed && <p className="text-xs leading-5 text-muted-foreground">Keep this browser’s saved data. Check the launch before retrying; another approval reuses the same coin mint.</p>}
    {confirmed && <Link to={`/edit-coin?coin=${encodeURIComponent(attempt.coinMint)}`} className="inline-flex text-sm text-primary underline underline-offset-4">Check editing options</Link>}
    <div className="flex flex-wrap items-center gap-3">{!confirmed && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onCheck(attempt)}>Check</Button>}{!confirmed && resumable && <Button type="button" size="sm" disabled={busy} onClick={() => onResume(attempt)}>{attempt.status === 'expired' || attempt.status === 'failed' ? 'Prepare again' : 'Continue launch'}</Button>}{confirmed && <a href={`https://solscan.io/token/${attempt.coinMint}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary">View coin <ExternalLink size={13} /></a>}{attempt.signature && <a href={`https://solscan.io/tx/${attempt.signature}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary">Transaction <ExternalLink size={13} /></a>}</div>
  </section>;
}