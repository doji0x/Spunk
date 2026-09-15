import React from 'react';
import { ArrowLeft, Plus, Rocket } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import AdminGate from '@/components/admin/AdminGate';
import LaunchList from '@/components/launchpad/LaunchList';
import { Button } from '@/components/ui/button';

export default function Launchpad() {
  const { data: launches, isLoading } = useQuery({ queryKey: ['launches'], queryFn: () => base44.entities.Launch.list('-created_date', 100) });
  return <AdminGate><main className="validate-surface min-h-screen px-5 py-10 text-[#252b20]">
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 flex items-center justify-between"><Link to="/" className="inline-flex items-center gap-2 text-sm text-[#657456]"><ArrowLeft size={16} />Back to validator</Link><Link to="/admin/mint" className="text-sm text-[#657456] underline">NFT mint console</Link></div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3"><span className="rounded-full bg-[#edf2e6] p-2 text-[#66834a]"><Rocket size={20} /></span><div><p className="font-mono text-[10px] tracking-widest text-[#66834a]">ADMIN · TOKEN-2022 LAUNCHPAD · MAINNET</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Inscribed token launches</h1><p className="mt-2 max-w-xl text-sm leading-6 text-[#7e8773]">Each token's image lives entirely on-chain, bound in both directions between the Token-2022 mint and its inscription.</p></div></div>
        <Button asChild><Link to="/admin/launchpad/new"><Plus className="mr-2 h-4 w-4" />New launch</Link></Button>
      </div>
      {isLoading ? <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#dce1d5] border-t-[#66834a]" /> : <LaunchList launches={launches || []} />}
    </div>
  </main></AdminGate>;
}