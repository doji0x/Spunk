import React from 'react';
import { Check, ArrowUpRight } from 'lucide-react';
export default function ValidateHeader({ onLearn }) {
  return <header className="flex items-center justify-between border-b border-[#dfE3da] px-5 py-5 sm:px-10 lg:px-16">
    <a href="/" aria-label="Validate home" className="flex items-center gap-2.5 text-[23px] font-bold tracking-[-1px]"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#b8ef69]"><Check size={23} strokeWidth={3} /></span>validate<span className="-ml-2 text-[#578832]">.</span></a>
    <div className="flex items-center gap-6 sm:gap-9"><button onClick={onLearn} className="hidden items-center gap-1.5 text-xs font-medium text-[#53574f] transition-colors hover:text-black sm:flex">How it works <ArrowUpRight size={14} /></button><span className="flex items-center gap-2 rounded-full border border-[#dce1d4] bg-white/50 px-3 py-1.5 font-mono text-[10px] tracking-wide"><span className="h-1.5 w-1.5 rounded-full bg-[#74a344]" />SOLANA MAINNET</span></div>
  </header>;
}