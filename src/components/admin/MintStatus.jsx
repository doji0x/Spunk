import React from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import InscriptionLog from '@/components/admin/InscriptionLog';
import PartialInscriptionPreview from '@/components/admin/PartialInscriptionPreview';

export default function MintStatus({ busy, progress, error, pending, result, onResume, activity, logs }) {
  if (!busy && !error && !result && !pending && !logs?.length) return null;
  return <section aria-live="polite" className="mt-5 rounded-2xl border border-border bg-card p-5 text-sm">
    {(busy || pending) && <><div className="mb-2 flex justify-between gap-4"><span>{activity || 'Background inscription'}</span><span className="shrink-0 font-mono">{progress}%</span></div><Progress value={progress} /><p className="mt-2 text-xs text-muted-foreground">{pending && !pending.imageUri ? 'Select the original image above to move this existing mint into the background queue.' : 'This job continues on the server after you close the browser. Progress is saved to mint history.'}</p><PartialInscriptionPreview pending={pending} /></>}
    {error && <div className="mt-4 text-destructive"><p>{error}</p>{pending && !busy && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onResume}><RotateCcw className="mr-2 h-4 w-4" />Resume inscription</Button>}</div>}
    {result && <div className="flex gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-primary" /><div><p className="font-semibold">NFT and image fully inscribed and re-verified from chain.</p><a className="mt-1 block break-all font-mono text-xs text-primary underline" href={`https://solscan.io/token/${result.mint}`} target="_blank" rel="noreferrer">{result.mint}</a><p className="mt-2 break-all font-mono text-xs text-muted-foreground">SHA-256: {result.hash}</p><p className="mt-2 text-xs text-muted-foreground">Owned by the server mint wallet: {result.owner}</p></div></div>}
    <InscriptionLog entries={logs} />
  </section>;
}