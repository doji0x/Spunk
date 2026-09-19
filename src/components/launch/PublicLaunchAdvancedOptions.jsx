import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FeeDestinationChoice from '@/components/admin/FeeDestinationChoice';
import FeeShareEditor from '@/components/admin/FeeShareEditor';
import PairAssetSelect from '@/components/admin/PairAssetSelect';

export default function PublicLaunchAdvancedOptions({ input, setInput, settings, disabled }) {
  const chooseMode = feeMode => setInput({ ...input, feeMode, holderReward: feeMode === 'holders', feeRecipients: feeMode === 'split' ? [{ type: 'creator', value: 'Creator', shareBps: 10000 }] : [] });
  const social = (field, value) => setInput({ ...input, [field]: value });
  return <details className="rounded-2xl border border-border bg-card/60 p-4">
    <summary className="cursor-pointer font-semibold text-primary">Advanced pairs, rewards & social links</summary>
    <div className="mt-5 space-y-6">
      {settings.pairs?.length ? <div className="space-y-3"><PairAssetSelect options={settings.pairs} value={input.quoteMint} disabled={disabled} onChange={quoteMint => setInput({ ...input, quoteMint, firstBuyAmount: '' })} /><p className="text-xs leading-5 text-muted-foreground">The first buy uses your selected pair asset. Hold that asset in your connected wallet, plus SOL for rent and network fees; SOL is not automatically converted.</p></div> : <p className="text-sm text-muted-foreground">No supported pair assets are available. Reload to check again.</p>}
      <div className="space-y-2"><Label htmlFor="public-creator-fee">Creator fee (%)</Label><Input id="public-creator-fee" type="number" min="0" max={(settings.maxCreatorFeeBps || 0) / 100} step="0.01" value={input.creatorFeePercent} disabled={disabled || !settings.creatorFeeConfigurable} placeholder="0" onChange={event => setInput({ ...input, creatorFeePercent: event.target.value })} /><p className="text-xs text-muted-foreground">Choose 0% or up to {((settings.maxCreatorFeeBps || 0) / 100).toFixed(2)}%, based on pump.fun’s current settings.</p></div>
      <div className="border-t border-border pt-5"><FeeDestinationChoice value={input.feeMode} holderRewardEnabled={settings.holderRewardEnabled} disabled={disabled} onChange={chooseMode} />{input.feeMode === 'split' && <div className="mt-4"><FeeShareEditor recipients={input.feeRecipients} disabled={disabled} onChange={feeRecipients => setInput({ ...input, feeRecipients })} /></div>}</div>
      <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-3"><div className="space-y-2"><Label htmlFor="public-website">Website</Label><Input id="public-website" type="url" maxLength={200} value={input.website} disabled={disabled} placeholder="https://example.com" onChange={event => social('website', event.target.value)} /></div><div className="space-y-2"><Label htmlFor="public-twitter">X / Twitter</Label><Input id="public-twitter" type="url" maxLength={200} value={input.twitter} disabled={disabled} placeholder="https://x.com/name" onChange={event => social('twitter', event.target.value)} /></div><div className="space-y-2"><Label htmlFor="public-github">GitHub</Label><Input id="public-github" type="url" maxLength={200} value={input.github} disabled={disabled} placeholder="https://github.com/name" onChange={event => social('github', event.target.value)} /></div></div>
      <p className="text-xs leading-5 text-muted-foreground">Custom fee splits are configured in a separate wallet transaction after the launch confirms. This does not create a developer buy or bundle it with the launch.</p>
    </div>
  </details>;
}