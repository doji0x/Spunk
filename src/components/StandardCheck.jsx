import React from 'react';
import { Check, X, CircleHelp, ArrowUpRight } from 'lucide-react';
import { Image } from '@/components/ui/image';

export default function StandardCheck({ title, check, kind }) {
  const valid = check?.status === 'valid';
  const unknown = check?.status === 'unknown';
  const link = kind === 'v1' ? `https://solscan.io/tx/${check?.signature}` : `https://solscan.io/account/${check?.imageAccount}`;
  return <article className="border-t border-[#e5e8e0]">
    <div className="flex items-start gap-3 p-5">
      <span className={valid ? 'rounded-full bg-[#c2f486] p-1.5' : unknown ? 'rounded-full bg-[#f1ecd7] p-1.5 text-[#887330]' : 'rounded-full bg-[#f3f4ef] p-1.5 text-[#8b9185]'}>{valid ? <Check size={16} /> : unknown ? <CircleHelp size={16} /> : <X size={16} />}</span>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{title}</h3>{kind === 'v1' && valid && <span className={check.confidence === 'high' ? 'rounded-full bg-[#e0f4c7] px-2 py-0.5 font-mono text-[8px] uppercase text-[#53752f]' : 'rounded-full bg-[#f1ecd7] px-2 py-0.5 font-mono text-[8px] uppercase text-[#887330]'}>{check.confidence} confidence</span>}</div><p className="mt-1 text-xs leading-relaxed text-[#7c8275]">{valid ? 'Image bytes found on Solana.' : check?.reason || check?.message || 'Not found.'}</p></div>
    </div>
    {valid && <><div className="proof-image flex justify-center border-y border-[#e5e8e0] p-5"><Image src={check.image} alt={`Image decoded from ${title}`} className="max-h-72 max-w-full rounded-lg" fittingType="fit" /></div><div className="space-y-3 p-5 text-xs"><div className="flex justify-between gap-3"><span className="text-[#878d7f]">Storage</span><span className="text-right">Solana · {(check.bytes / 1024).toFixed(1)} KB · {check.mime.split('/')[1].toUpperCase()}</span></div>{kind === 'metaplex' && <div className="flex justify-between gap-3"><span className="text-[#878d7f]">Update authority</span><span className="text-right">{check.immutable ? 'Removed · immutable' : 'Active · image can change'}</span></div>}<a href={link} target="_blank" rel="noreferrer" className="flex items-center justify-end gap-1 text-[#58812d]">View on explorer<ArrowUpRight size={12} /></a><details className="border-t border-[#e5e8e0] pt-3"><summary className="cursor-pointer text-[#7c8275]">Verification details</summary><p className="mt-3 break-all font-mono text-[10px] leading-5 text-[#7c8275]">Standard: {check.standard}<br />SHA-256: {check.hash}<br />Checked: {check.checkedAt}</p></details></div></>}
  </article>;
}