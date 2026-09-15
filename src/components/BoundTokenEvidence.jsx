import React from 'react';

const Row = ({ label, value, mono = true }) => <div className="flex justify-between gap-3"><span className="shrink-0 text-[#878d7f]">{label}</span><span className={mono ? 'break-all text-right font-mono text-[10px]' : 'text-right'}>{value}</span></div>;

export default function BoundTokenEvidence({ check }) {
  const fields = check.fields || {};
  const authorities = check.authorities || {};
  return <div className="space-y-3">
    <Row label="Token" value={`${check.tokenName} · $${check.tokenSymbol}`} mono={false} />
    <div className="rounded-lg bg-[#f7f8f2] p-3"><p className="mb-2 font-mono text-[9px] tracking-widest text-[#66834a]">TOKEN → INSCRIPTION · ON-MINT FIELDS</p><div className="space-y-1.5">{Object.entries(fields).map(([key, value]) => <Row key={key} label={key} value={value} />)}</div></div>
    <div className="rounded-lg bg-[#f7f8f2] p-3"><p className="mb-2 font-mono text-[9px] tracking-widest text-[#66834a]">INSCRIPTION → TOKEN</p><Row label="token_mint" value={check.tokenMint} /><Row label="inscription NFT" value={check.nftMint} /></div>
    <Row label="Authorities" value={check.immutable ? 'Mint · freeze · metadata all removed' : ['mintAuthority', 'freezeAuthority', 'updateAuthority'].filter(key => authorities[key]).join(', ') + ' still active'} mono={false} />
  </div>;
}