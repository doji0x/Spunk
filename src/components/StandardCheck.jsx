import React, { useEffect, useState } from 'react';
import { Check, X, CircleHelp, ArrowUpRight, ImageOff } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { motion } from 'framer-motion';

export default function StandardCheck({ title, check, kind }) {
  const valid = check?.status === 'valid';
  const unknown = check?.status === 'unknown';
  const [revealing, setRevealing] = useState(Boolean(valid && check?.partial));
  useEffect(() => {
    setRevealing(Boolean(valid && check?.partial));
    if (!valid || !check?.partial) return;
    const timeout = window.setTimeout(() => setRevealing(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [valid, check?.partial, check?.image]);
  const link = kind === 'v1' ? `https://solscan.io/tx/${check?.signature}` : `https://solscan.io/account/${kind === 'libreplex' ? check?.inscriptionAccount : check?.imageAccount}`;
  return <article className="border-t border-[#e5e8e0]">
    <div className="flex items-start gap-3 p-5">
      <span className={valid ? 'rounded-full bg-[#c2f486] p-1.5' : unknown ? 'rounded-full bg-[#f1ecd7] p-1.5 text-[#887330]' : 'rounded-full bg-[#f3f4ef] p-1.5 text-[#8b9185]'}>{valid ? <Check size={16} /> : unknown ? <CircleHelp size={16} /> : <X size={16} />}</span>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{title}</h3>{kind === 'v1' && valid && <span className={check.confidence === 'high' ? 'rounded-full bg-[#e0f4c7] px-2 py-0.5 font-mono text-[8px] uppercase text-[#53752f]' : 'rounded-full bg-[#f1ecd7] px-2 py-0.5 font-mono text-[8px] uppercase text-[#887330]'}>{check.confidence} confidence</span>}</div><p className="mt-1 text-xs leading-relaxed text-[#7c8275]">{valid ? revealing ? 'Revealing on-chain image…' : 'Image bytes found on Solana.' : check?.reason || check?.message || 'Not found.'}</p></div>
    </div>
    {valid && <><div className="proof-image flex min-h-40 items-center justify-center border-y border-[#e5e8e0] p-5">{check.undecodable || !check.image ? <div className="flex max-w-sm items-center gap-3 rounded-xl border border-[#dce1d5] bg-[#f3f4ef] px-5 py-4 text-[#7c8275]"><ImageOff size={18} className="shrink-0" /><span className="text-xs leading-relaxed">Preview unavailable — image bytes verified on-chain</span></div> : check.partial ? <motion.div className="flex w-full items-center justify-center" initial={{ clipPath: 'inset(0 0 100% 0)' }} animate={{ clipPath: 'inset(0 0 0% 0)' }} transition={{ duration: 4, ease: 'easeInOut' }}><Image src={check.image} alt={`Partially revealed image decoded from ${title}`} className="max-h-72 max-w-full rounded-lg" fittingType="fit" /></motion.div> : <Image src={check.image} alt={`Image decoded from ${title}`} className="max-h-72 max-w-full rounded-lg" fittingType="fit" />}</div><div className="space-y-3 p-5 text-xs"><div className="flex justify-between gap-3"><span className="text-[#878d7f]">Storage</span><span className="text-right">Solana · {(check.bytes / 1024).toFixed(1)} KB · {check.mime.split('/')[1].toUpperCase()}</span></div>{kind === 'metaplex' && <div className="flex justify-between gap-3"><span className="text-[#878d7f]">Update authority</span><span className="text-right">{check.immutable ? 'Removed · immutable' : 'Active · image can change'}</span></div>}{kind === 'held' && <div className="flex justify-between gap-3"><span className="shrink-0 text-[#878d7f]">Inscribed NFT</span><span className="break-all text-right font-mono text-[10px]">{check.heldNft}</span></div>}<a href={link} target="_blank" rel="noreferrer" className="flex items-center justify-end gap-1 text-[#58812d]">View on explorer<ArrowUpRight size={12} /></a><details className="border-t border-[#e5e8e0] pt-3"><summary className="cursor-pointer text-[#7c8275]">Verification details</summary><p className="mt-3 break-all font-mono text-[10px] leading-5 text-[#7c8275]">Standard: {check.standard}<br />SHA-256: {check.hash}<br />Checked: {check.checkedAt}</p></details></div></>}
  </article>;
}