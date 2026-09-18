import React from 'react';
import { AudioLines, ArrowUpRight, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import PofMetadataFields from '@/components/admin/PofMetadataFields';
import PofMediaField from '@/components/admin/PofMediaField';
import AgentProgress from '@/components/proof/AgentProgress';
import usePofSubmission from '@/hooks/usePofSubmission';

export default function PofControlPanel() {
  const form = usePofSubmission();
  const disabled = form.busy || Boolean(form.result);
  return <section id="pof-controls" className="my-8 rounded-3xl border border-primary/30 bg-card p-5 sm:p-6" aria-labelledby="pof-controls-title">
    <div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><AudioLines size={22} /></div><div><p className="font-mono text-[10px] tracking-[0.18em] text-primary">ADMIN · PROOF OF FART</p><h2 id="pof-controls-title" className="mt-1 font-display text-2xl font-semibold">POF control panel</h2></div></div>
    <p className="mb-6 mt-4 text-sm leading-6 text-muted-foreground">Manually submit to the Fly Brain inscription pipeline. Set the NFT details and recipient, then inscribe an image or an MP3 with its own on-chain cover artwork. This does not command the external Fly Brain agent.</p>
    <form onSubmit={form.run} className="space-y-5" key={form.version}>
      <PofMetadataFields values={form.values} onChange={form.change} disabled={disabled} />
      <PofMediaField id="pof-media" label="Inscribed media" file={form.values.media} onChange={file => form.change('media', file)} disabled={disabled} />
      {form.audio && <PofMediaField id="pof-cover" label="On-chain cover artwork" file={form.values.cover} onChange={file => form.change('cover', file)} disabled={disabled} cover />}
      {form.quote && <div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="text-sm">Estimated mainnet cost <strong className="font-mono text-primary">~{form.quote.estimateSol.toFixed(6)} SOL</strong></p><p className="mt-2 text-xs leading-5 text-muted-foreground">{form.quote.totalBytes.toLocaleString()} bytes{form.quote.hasCover ? ' including cover artwork' : ''}. Includes estimated account rent and transaction fees with a buffer; actual cost can differ. This is not a spending cap.</p></div>}
      {form.quote && !form.result && <label className="flex items-start gap-3 text-xs leading-5"><input type="checkbox" checked={form.confirmed} onChange={event => form.setConfirmed(event.target.checked)} disabled={disabled} className="mt-1 h-4 w-4 shrink-0 accent-primary" /><span>I authorize a real Solana mainnet inscription and delivery to the wallet above, spending admin-wallet SOL. This is not a simulation.</span></label>}
      {form.error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{form.error}</p>}
      {!form.result && <Button type="submit" className="w-full" disabled={form.busy || (Boolean(form.quote) && !form.confirmed)}>{form.busy && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}{form.busy ? form.quote ? 'Saving inscription job…' : 'Calculating estimate…' : form.quote ? 'Confirm & queue mainnet inscription' : 'Review cost estimate'}</Button>}
      {!form.quote && <p className="text-center text-[11px] text-muted-foreground">Reviewing the estimate sends no transactions and creates no NFT.</p>}
    </form>
    {form.result && <div className="mt-5 space-y-3 rounded-xl border border-primary/20 p-4" aria-live="polite"><p className="text-sm text-primary">Job saved · Follow its progress below.</p><p className="text-xs leading-5 text-muted-foreground">The background worker prepares the mint and writes the bytes. You can close this page; the queue advances approximately every minute.</p><p className="break-all font-mono text-[10px]">Mint: {form.result.mint}</p><p className="break-all font-mono text-[10px] text-muted-foreground">Request: {form.result.requestId}</p><Button variant="outline" size="sm" onClick={form.reset}>New inscription</Button></div>}
    <AgentProgress admin recordId={form.result?.recordId} />
    <Link to="/proof-of-fart" className="mt-5 inline-flex items-center gap-1 text-xs text-primary">Public progress & proof<ArrowUpRight size={14} /></Link>
  </section>;
}