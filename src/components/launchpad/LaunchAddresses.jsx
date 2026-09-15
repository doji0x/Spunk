import React from 'react';
import { ArrowUpRight } from 'lucide-react';

export default function LaunchAddresses({ launch }) {
  const rows = [['Token-2022 mint', launch.tokenMint, 'token'], ['Inscription NFT mint', launch.nftMint, 'token'], ['Inscription account', launch.inscriptionAccount, 'account'], ['Image account', launch.imageAccount, 'account'], ['Sale vault', launch.vaultAddress, 'account']];
  return <section className="rounded-2xl border border-[#dce1d5] bg-white p-5 text-xs">
    <p className="mb-3 font-mono text-[10px] tracking-widest text-[#66834a]">DERIVED ADDRESSES · FIXED FOR THIS LAUNCH</p>
    <dl className="space-y-2">{rows.map(([label, value, kind]) => <div key={label} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><dt className="text-[#7e8773]">{label}</dt><dd className="flex min-w-0 items-center gap-1"><span className="truncate font-mono text-[10px]">{value}</span><a href={`https://solscan.io/${kind}/${value}`} target="_blank" rel="noreferrer" className="text-[#58812d]" aria-label={`View ${label} on explorer`}><ArrowUpRight size={12} /></a></dd></div>)}</dl>
    <p className="mt-3 break-all font-mono text-[10px] text-[#959b8e]">Image SHA-256: {launch.imageHash}</p>
  </section>;
}