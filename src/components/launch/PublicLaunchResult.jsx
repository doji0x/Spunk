import React from 'react';
import { CheckCircle2, Clock3, XCircle } from 'lucide-react';

export default function PublicLaunchResult({ result }) {
  if (!result) return null;
  const confirmed = result.status === 'confirmed', failed = result.status === 'failed';
  const Icon = confirmed ? CheckCircle2 : failed ? XCircle : Clock3;
  return <section aria-live="polite" className="mt-5 rounded-2xl border border-[#dce1d5] bg-white p-5 text-left">
    <div className="flex gap-3"><Icon className={confirmed ? 'text-launch-brand' : failed ? 'text-destructive' : 'text-[#8a641d]'} /><div><h2 className="font-semibold">{confirmed ? 'Coin launched' : failed ? 'Launch failed on-chain' : 'Launch submitted'}</h2><p className="mt-1 text-sm text-muted-foreground">{confirmed ? 'Your coin is live on pump.fun.' : failed ? 'No launch was completed.' : 'Phantom submitted the transaction. Confirmation may take a moment.'}</p></div></div>
    <div className="mt-4 space-y-2 font-mono text-[10px]"><a className="block break-all text-launch-brand underline" href={`https://solscan.io/tx/${result.signature}`} target="_blank" rel="noreferrer">Transaction: {result.signature}</a><a className="block break-all text-launch-brand underline" href={`https://pump.fun/coin/${result.coinMint}`} target="_blank" rel="noreferrer">Coin: {result.coinMint}</a></div>
  </section>;
}