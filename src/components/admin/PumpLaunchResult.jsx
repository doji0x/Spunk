import React from 'react';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PumpLaunchResult({ result, onReset }) {
  return <div className="mt-5 rounded-xl border border-launch-border bg-card p-4 text-sm" role="status">
    <div className="flex items-center gap-2 font-semibold text-launch-brand"><CheckCircle2 size={18} />Coin launched on Solana mainnet</div>
    <p className="mt-2 text-muted-foreground">Creation confirmed. No initial buy was made.</p>
    <dl className="mt-4 space-y-3">
      <div><dt className="text-xs text-muted-foreground">Coin mint</dt><dd><a href={result.explorer} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-launch-brand underline">{result.coinMint}</a></dd></div>
      <div><dt className="text-xs text-muted-foreground">Bonding curve</dt><dd><a href={`https://solscan.io/account/${result.bondingCurve}`} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-launch-brand underline">{result.bondingCurve}</a></dd></div>
      <div><dt className="text-xs text-muted-foreground">Inscription metadata</dt><dd><a href={result.inscriptionGatewayUrl} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-launch-brand underline">{result.inscriptionGatewayUrl}</a></dd></div>
    </dl>
    {result.inscriptionImmutable === false && <p className="mt-3 text-xs text-muted-foreground">The source inscription still has update authorities. This launch does not make its image immutable.</p>}
    <div className="mt-5 flex flex-wrap items-center gap-4"><a href={`https://pump.fun/coin/${result.coinMint}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-launch-brand underline">View on pump.fun<ExternalLink size={14} /></a><Button type="button" variant="outline" size="sm" onClick={onReset}>Launch another coin</Button></div>
    <p className="mt-3 text-xs text-muted-foreground">pump.fun display may take time to index. The coin references the inscription through its gateway; it does not own or lock the source NFT.</p>
  </div>;
}