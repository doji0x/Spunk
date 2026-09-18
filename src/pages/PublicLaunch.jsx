import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import ValidateHeader from '@/components/ValidateHeader';
import PublicLaunchForm from '@/components/launch/PublicLaunchForm';
import PublicLaunchResult from '@/components/launch/PublicLaunchResult';
import usePublicPumpLaunch from '@/hooks/usePublicPumpLaunch';

export default function PublicLaunch() {
  const state = usePublicPumpLaunch();
  return <div className="validate-surface min-h-screen text-[#252b20]">
    <ValidateHeader />
    <main className="mx-auto w-full max-w-[680px] px-5 pb-16 pt-9 sm:pt-14">
      <Link to="/" className="mb-8 inline-flex items-center gap-2 text-xs font-medium text-[#657456]"><ArrowLeft size={14} />Back to verification</Link>
      <div className="mb-7 text-center"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#dce3d1] bg-[#edf2e6] px-3 py-1.5 font-mono text-[9px] tracking-[0.12em] text-[#6a7e56]"><ShieldCheck size={12} />WALLET-SIGNED LAUNCH</div><h1 className="text-4xl font-medium tracking-[-2px] sm:text-5xl">Launch from your wallet</h1><p className="mx-auto mt-4 max-w-[520px] text-sm leading-6 text-[#7e8773]">Connect Phantom and create a pump.fun coin linked to an on-chain inscription. You remain the creator and approve the launch transaction.</p></div>
      <PublicLaunchForm state={state} />
      <PublicLaunchResult result={state.result} />
    </main>
  </div>;
}