import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import AdminGate from '@/components/admin/AdminGate';
import LaunchAddresses from '@/components/launchpad/LaunchAddresses';
import LaunchPipeline from '@/components/launchpad/LaunchPipeline';
import SaleControls from '@/components/launchpad/SaleControls';
import useTokenLaunch from '@/hooks/useTokenLaunch';

export default function LaunchDetail() {
  const { id } = useParams();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['launch', id], queryFn: async () => (await base44.functions.invoke('launchToken', { action: 'status', launchId: id })).data });
  const launch = data?.launch;
  const runner = useTokenLaunch(launch || { id }, refetch);
  return <AdminGate><main className="validate-surface min-h-screen px-5 py-10 text-[#252b20]">
    <div className="mx-auto max-w-2xl"><Link to="/admin/launchpad" className="mb-8 inline-flex items-center gap-2 text-sm text-[#657456]"><ArrowLeft size={16} />All launches</Link>
      {isLoading || !launch ? <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#dce1d5] border-t-[#66834a]" /> : <>
        <p className="font-mono text-[10px] tracking-widest text-[#66834a]">LAUNCH · {launch.status.replace('_', ' ').toUpperCase()}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{launch.name} <span className="font-mono text-lg text-[#7e8773]">${launch.symbol}</span></h1>
        <p className="mt-2 mb-6 text-sm leading-6 text-[#7e8773]">{launch.supply.toLocaleString()} tokens · {launch.imageMime.split('/')[1].toUpperCase()} · {(launch.imageSize / 1024).toFixed(1)} KB image</p>
        <div className="space-y-5">
          <LaunchAddresses launch={launch} />
          <LaunchPipeline launch={launch} writtenBytes={data.writtenBytes} runner={runner} onRun={runner.run} />
          {['launched', 'on_sale', 'closed'].includes(launch.status) && <SaleControls launch={launch} vaultLamports={data.vaultLamports} onChange={refetch} />}
        </div>
      </>}
    </div>
  </main></AdminGate>;
}