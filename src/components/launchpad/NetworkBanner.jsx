import React from 'react';
import { FlaskConical } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function useProbeEnv() {
  return useQuery({ queryKey: ['probeEnv'], queryFn: async () => (await base44.functions.invoke('pumpProbe', { action: 'env' })).data, staleTime: 60000 });
}

export default function NetworkBanner() {
  const { data } = useProbeEnv();
  if (!data?.isDevnet) return null;
  return <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#c8a23c] bg-[#fdf6e3] p-4">
    <FlaskConical size={18} className="mt-0.5 shrink-0 text-[#8a6d1f]" />
    <div>
      <p className="font-mono text-[10px] tracking-widest text-[#8a6d1f]">DEVNET PROBE</p>
      <p className="mt-1 text-sm leading-6 text-[#5f4d17]">This app is pointed at Solana devnet. Nothing here touches mainnet or real SOL. Probe wallet {data.wallet?.slice(0, 8)}… holds {(data.balance / 1e9).toFixed(3)} devnet SOL.</p>
    </div>
  </div>;
}