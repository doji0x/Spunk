import React from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import InscriptionLog from '@/components/admin/InscriptionLog';

export default function MintStatus({ busy, progress, error, pending, result, onResume, activity, logs }) {
  if (!busy && !error && !result && !pending && !logs?.length) return null;
  return <section aria-live="polite" className="mt-5 rounded-2xl border border-[#dce1d5] bg-white p-5 text-sm">
    {(busy || pending) && <><div className="mb-2 flex justify-between gap-4"><span>{activity || 'Continuing inscription'}</span><span className="shrink-0 font-mono">{progress}%</span></div><Progress value={progress} /><p className="mt-2 text-xs text-muted-foreground">You can safely return and resume if loading is interrupted; confirmed chunks are saved and skipped.</p></>}
    {error && <div className="mt-4 text-[#a54132]"><p>{error}</p>{pending && !busy && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onResume}><RotateCcw className="mr-2 h-4 w-4" />Resume inscription</Button>}</div>}
    {result && <div className="flex gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-[#66834a]" /><div><p className="font-semibold">NFT and image fully inscribed and re-verified from chain.</p><a className="mt-1 block break-all font-mono text-xs text-[#66834a] underline" href={`https://solscan.io/token/${result.mint}`} target="_blank" rel="noreferrer">{result.mint}</a><p className="mt-2 break-all font-mono text-xs text-[#7e8773]">SHA-256: {result.hash}</p><p className="mt-2 text-xs text-[#7e8773]">Owned by the server mint wallet: {result.owner}</p></div></div>}
    <InscriptionLog entries={logs} />
  </section>;
}