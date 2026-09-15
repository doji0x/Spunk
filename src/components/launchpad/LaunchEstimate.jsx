import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { formatSol } from '@/lib/bytes';

export default function LaunchEstimate({ totalSize, name, symbol, description }) {
  const [estimate, setEstimate] = useState(null);
  useEffect(() => {
    if (!totalSize) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      const { data } = await base44.functions.invoke('launchToken', { action: 'estimate', totalSize, name, symbol, description });
      if (active) setEstimate(data);
    }, 400);
    return () => { active = false; window.clearTimeout(timer); };
  }, [totalSize, name, symbol, description]);
  if (!totalSize) return null;
  if (!estimate) return <p className="font-mono text-xs text-[#7e8773]">Estimating on-chain cost…</p>;
  const rows = [['Inscription NFT accounts', estimate.nftRent], ['Inscription + image rent', estimate.inscriptionRent], ['Token-2022 mint + supply account', estimate.tokenRent], [`${estimate.chunks} image chunks + ${estimate.setupTransactions} setup transactions`, estimate.fees]];
  return <div className="rounded-xl border border-dashed border-[#c9d1bd] bg-[#f7f8f2] p-4 text-xs">
    <p className="mb-3 font-mono text-[10px] tracking-widest text-[#66834a]">PREFLIGHT ESTIMATE · PAID BY SERVER WALLET</p>
    <dl className="space-y-1.5">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt className="text-[#7e8773]">{label}</dt><dd className="font-mono">{formatSol(value)}</dd></div>)}</dl>
    <div className="mt-3 flex justify-between border-t border-[#dce1d5] pt-3 font-semibold"><span>Total</span><span className="font-mono">{formatSol(estimate.total)}</span></div>
    <p className="mt-2 text-[10px] leading-relaxed text-[#959b8e]">The sale vault is a system account funded by buyers; it needs no setup rent. Fees assume 5,000 lamports per transaction.</p>
  </div>;
}