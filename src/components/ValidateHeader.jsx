import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Image } from '@/components/ui/image';
export default function ValidateHeader({ onLearn }) {
  return <header className="flex items-center justify-between border-b border-[#dfE3da] px-5 py-5 sm:px-10 lg:px-16">
    <a href="/" aria-label="Validate home" className="flex items-center gap-2.5 text-[23px] font-bold tracking-[-1px]"><Image src="https://media.base44.com/images/public/6aa8d3c82020abebe308c467/84de47794_IMG_1830.jpeg" alt="Validate logo" className="h-9 w-9 rounded-lg" />validate<span className="-ml-2 text-[#578832]">.</span></a>
    <div className="flex items-center gap-3 sm:gap-7"><nav aria-label="External links" className="flex items-center gap-3 text-xs font-medium text-[#53574f]"><a href="https://github.com/doji0x/validate" target="_blank" rel="noreferrer" className="transition-colors hover:text-black">Docs</a><a href="https://x.com/humanevolvd?s=11" target="_blank" rel="noreferrer" className="transition-colors hover:text-black">X</a></nav><button onClick={onLearn} className="hidden items-center gap-1.5 text-xs font-medium text-[#53574f] transition-colors hover:text-black sm:flex">How it works <ArrowUpRight size={14} /></button><span className="hidden items-center gap-2 rounded-full border border-[#dce1d4] bg-white/50 px-3 py-1.5 font-mono text-[10px] tracking-wide sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#74a344]" />SOLANA MAINNET</span></div>
  </header>;
}