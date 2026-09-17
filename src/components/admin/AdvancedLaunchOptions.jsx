import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PairAssetSelect from '@/components/admin/PairAssetSelect';
import FeeDestinationChoice from '@/components/admin/FeeDestinationChoice';
import FeeShareEditor from '@/components/admin/FeeShareEditor';

export default function AdvancedLaunchOptions({ input, setInput, options, settings, disabled }) {
  const selected = options.find(item => item.mint === input.quoteMint);
  const chooseMode = feeMode => setInput({ ...input, feeMode, holderReward: feeMode === 'holders', feeRecipients: feeMode === 'split' ? [{ type: 'creator', value: 'Creator', shareBps: 10000 }] : [] });
  return <div className="space-y-6 border-t border-launch-border pt-5">
    <div><p className="font-mono text-[10px] tracking-widest text-launch-brand">1 · MARKET</p><div className="mt-3"><PairAssetSelect options={options} value={input.quoteMint} disabled={disabled} onChange={quoteMint => setInput({ ...input, quoteMint })} /></div><div className="mt-4 space-y-2"><Label htmlFor="first-buy">Required first buy ({selected?.symbol || 'pair asset'})</Label><Input id="first-buy" required type="number" min="0.000001" step="any" value={input.firstBuyAmount} disabled={disabled} placeholder="0.1" onChange={e => setInput({ ...input, firstBuyAmount: e.target.value })} /></div></div>
    <div className="border-t border-launch-border pt-5"><p className="font-mono text-[10px] tracking-widest text-launch-brand">2 · CREATOR FEE RATE</p><div className="mt-3 space-y-2"><Label htmlFor="creator-fee">Creator fee (%)</Label><Input id="creator-fee" type="number" min="0" max={(settings.maxCreatorFeeBps || 0) / 100} step="0.01" value={input.creatorFeePercent} disabled={disabled || !settings.creatorFeeConfigurable} placeholder="0" onChange={e => setInput({ ...input, creatorFeePercent: e.target.value })} /><p className="text-xs text-muted-foreground">0% is allowed. A nonzero rate must be 0.01%–{((settings.maxCreatorFeeBps || 0) / 100).toFixed(2)}% under pump.fun’s current on-chain configuration.</p></div></div>
    <div className="border-t border-launch-border pt-5"><p className="font-mono text-[10px] tracking-widest text-launch-brand">3 · FEE DESTINATION</p><div className="mt-3"><FeeDestinationChoice value={input.feeMode || 'creator'} holderRewardEnabled={settings.holderRewardEnabled} disabled={disabled} onChange={chooseMode} /></div>{input.feeMode === 'split' && <div className="mt-4"><FeeShareEditor recipients={input.feeRecipients} disabled={disabled} onChange={feeRecipients => setInput({ ...input, feeRecipients })} /></div>}<p className="mt-3 text-xs leading-5 text-muted-foreground">Holder rewards cannot be partially combined with creator or recipient shares. Selecting holder rewards routes the full creator-fee destination through pump.fun’s holder rewards program.</p></div>
  </div>;
}