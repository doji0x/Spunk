import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PairAssetSelect from '@/components/admin/PairAssetSelect';
import FeeShareEditor from '@/components/admin/FeeShareEditor';

export default function AdvancedLaunchOptions({ input, setInput, options, settings, disabled }) {
  const selected = options.find(item => item.mint === input.quoteMint);
  return <div className="space-y-4 border-t border-launch-border pt-4">
    <p className="font-mono text-[10px] tracking-widest text-launch-brand">ADVANCED LAUNCH</p>
    <PairAssetSelect options={options} value={input.quoteMint} disabled={disabled} onChange={quoteMint => setInput({ ...input, quoteMint })} />
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="first-buy">Required first buy ({selected?.symbol || 'pair asset'})</Label><Input id="first-buy" required type="number" min="0.000001" step="any" value={input.firstBuyAmount} disabled={disabled} placeholder="0.1" onChange={e => setInput({ ...input, firstBuyAmount: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="creator-fee">Creator fee (%)</Label><Input id="creator-fee" type="number" min="0" max={(settings.maxCreatorFeeBps || 0) / 100} step="0.01" value={input.creatorFeePercent} disabled={disabled || !settings.creatorFeeConfigurable} placeholder="0" onChange={e => setInput({ ...input, creatorFeePercent: e.target.value })} /></div></div>
    <label className="flex items-start gap-3 rounded-xl border border-launch-border p-4"><input type="checkbox" className="mt-1" checked={input.holderReward} disabled={disabled || !settings.holderRewardEnabled} onChange={e => setInput({ ...input, holderReward: e.target.checked })} /><span><span className="block text-sm font-medium">Share creator fees with holders</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Permanent holder-reward mode. The creator fee vault is controlled by pump.fun’s holder rewards program.</span></span></label>
    <FeeShareEditor recipients={input.feeRecipients} disabled={disabled} onChange={feeRecipients => setInput({ ...input, feeRecipients })} />
  </div>;
}