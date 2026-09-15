import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { formatSol } from '@/lib/bytes';

const labels = { preparing: 'Preparing', inscribed: 'Inscribed', launched: 'Launched', on_sale: 'On sale', closed: 'Closed' };
const tones = { preparing: 'bg-[#f1ecd7] text-[#887330]', inscribed: 'bg-[#e6ecf7] text-[#3f5a8a]', launched: 'bg-[#e0f4c7] text-[#53752f]', on_sale: 'bg-[#c2f486] text-[#25371d]', closed: 'bg-[#f3f4ef] text-[#8b9185]' };

export default function LaunchList({ launches }) {
  if (!launches.length) return <div className="rounded-2xl border border-dashed border-[#c9d1bd] bg-white p-10 text-center text-sm text-[#7e8773]">No launches yet. Create the first inscribed token.</div>;
  return <ul className="divide-y divide-[#e5e8e0] overflow-hidden rounded-2xl border border-[#dce1d5] bg-white">
    {launches.map(launch => <li key={launch.id}>
      <Link to={`/admin/launchpad/${launch.id}`} className="flex items-center gap-4 p-5 transition-colors hover:bg-[#f7f8f2]">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{launch.name}</h3><span className="font-mono text-xs text-[#7e8773]">${launch.symbol}</span><span className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${tones[launch.status]}`}>{labels[launch.status]}</span></div>
          <p className="mt-1 truncate font-mono text-[10px] text-[#959b8e]">{launch.tokenMint}</p>
        </div>
        <div className="hidden text-right text-xs sm:block"><p className="font-mono">{(launch.soldTokens || 0).toLocaleString()} / {launch.supply.toLocaleString()}</p><p className="mt-1 text-[#7e8773]">{formatSol(launch.proceedsLamports)}</p></div>
        <ArrowUpRight size={16} className="shrink-0 text-[#959b8e]" />
      </Link>
    </li>)}
  </ul>;
}