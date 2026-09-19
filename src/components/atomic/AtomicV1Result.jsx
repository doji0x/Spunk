import React from 'react';
import { CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react';

export default function AtomicV1Result({ result, onCheck, busy }) {
  if (!result) return null;
  const pending = result.status === 'pending';
  const verified = result.atomicV1Verified;
  return <section className="rounded-2xl border border-border bg-card p-5">
    <div className="flex items-center gap-3">{pending ? <Loader2 className="animate-spin text-primary" /> : verified ? <CheckCircle2 className="text-primary" /> : <XCircle className="text-destructive" />}<div><h2 className="font-display text-lg font-semibold">{pending ? 'Waiting for finalization' : verified ? 'Atomic V1 verified' : 'Launch incomplete'}</h2><p className="text-xs text-muted-foreground">{verified ? 'Pump launch and exact image bytes independently verified in one finalized transaction.' : result.error || 'The transaction is being checked on Solana.'}</p></div></div>
    <dl className="mt-4 space-y-2 break-all font-mono text-[11px]"><div><dt className="text-muted-foreground">Coin mint</dt><dd>{result.coinMint}</dd></div>{result.transactionSignature && <div><dt className="text-muted-foreground">Signature</dt><dd>{result.transactionSignature}</dd></div>}<div className="grid grid-cols-2 gap-3"><div><dt className="text-muted-foreground">Image</dt><dd>{result.imageByteLength} bytes</dd></div><div><dt className="text-muted-foreground">Transaction</dt><dd>v{result.transactionVersion} · {result.serializedTransactionBytes} bytes</dd></div></div></dl>
    <div className="mt-4 flex items-center gap-4">{result.transactionSignature && <a href={`https://explorer.solana.com/tx/${result.transactionSignature}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs text-primary">View transaction <ExternalLink size={13} /></a>}{pending && <button type="button" disabled={busy} onClick={onCheck} className="text-xs text-primary underline disabled:opacity-50">Check finalization</button>}</div>
  </section>;
}