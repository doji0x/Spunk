import React from 'react';
import { Label } from '@/components/ui/label';

export default function PairAssetSelect({ options, value, disabled, onChange }) {
  return <div className="space-y-2">
    <Label htmlFor="pump-pair">Pair asset</Label>
    <select id="pump-pair" required value={value} disabled={disabled} onChange={e => onChange(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {!options.length && <option value="">Loading supported assets…</option>}
      {options.map(asset => <option key={asset.mint} value={asset.mint}>{asset.symbol} · {asset.name}</option>)}
    </select>
    <p className="text-xs text-muted-foreground">Checked against pump.fun’s current on-chain allowlist. <a href="https://pump.fun/docs/custom-pairs" target="_blank" rel="noreferrer" className="underline">Terms and risks</a></p>
  </div>;
}