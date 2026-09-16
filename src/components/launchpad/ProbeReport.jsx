import React from 'react';

const sol = lamports => `${((lamports || 0) / 1e9).toFixed(6)} SOL`;

function Row({ label, value }) {
  return <div className="flex items-baseline justify-between gap-4 border-b border-[#e6dcbd] py-1.5 last:border-0">
    <span className="text-[#6b5822]">{label}</span>
    <span className="break-all text-right font-mono text-[#3f3413]">{value}</span>
  </div>;
}

export default function ProbeReport({ action, data }) {
  const curve = data.curve;
  return <div className="rounded-xl border border-[#e6dcbd] bg-white p-4 text-xs">
    <p className="mb-2 font-mono text-[10px] tracking-widest text-[#8a6d1f]">{action.toUpperCase()} RESULT</p>
    {data.signature && <Row label="Signature" value={data.signature} />}
    {data.mint && <Row label="Coin mint" value={data.mint} />}
    {data.bondingCurve && <Row label="Bonding curve" value={data.bondingCurve} />}
    {typeof data.fee === 'number' && <Row label="Network fee" value={sol(data.fee)} />}
    {typeof data.computeUnits === 'number' && data.computeUnits > 0 && <Row label="Compute units" value={data.computeUnits.toLocaleString()} />}
    {typeof data.balance === 'number' && <Row label="Probe wallet balance" value={sol(data.balance)} />}
    {curve && <>
      <Row label="Curve complete" value={curve.complete ? 'yes' : 'no'} />
      <Row label="Holder-rewards coin" value={curve.isHolderReward ? 'yes' : 'no'} />
      <Row label="Real SOL in curve" value={sol(curve.realSolReserves)} />
      <Row label="Tokens left on curve" value={(curve.realTokenReserves || 0).toLocaleString()} />
    </>}
    {action === 'report' && <>
      <Row label="Inscription binding" value={data.bindingVerified ? 'verified' : `mismatch (${data.onChainBytes}/${data.expectedBytes} bytes)`} />
      <Row label="Total probe spend" value={sol(data.totalSpentLamports)} />
      <Row label="Total compute units" value={(data.totalComputeUnits || 0).toLocaleString()} />
      <Row label="PumpSwap pool" value={data.launch?.pumpPoolAddress || 'not migrated yet'} />
    </>}
  </div>;
}