import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Image } from '@/components/ui/image';
import BuyPanel from '@/components/launchpad/BuyPanel';

export default function LaunchPublic() {
  const { id } = useParams();
  const { data: quote, isLoading, refetch } = useQuery({ queryKey: ['quote', id], queryFn: async () => (await base44.functions.invoke('buyLaunchToken', { action: 'quote', launchId: id })).data });
  const { data: proof } = useQuery({ queryKey: ['proof', quote?.tokenMint], enabled: Boolean(quote?.tokenMint) && !['preparing', 'inscribed'].includes(quote?.status), queryFn: async () => (await base44.functions.invoke('validateInscription', { address: quote.tokenMint })).data });
  const bound = proof?.checks?.bound;
  return <main className="validate-surface min-h-screen px-5 py-10 text-[#252b20]">
    <div className="mx-auto max-w-2xl"><Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm text-[#657456]"><ArrowLeft size={16} />Validator</Link>
      {isLoading || !quote ? <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#dce1d5] border-t-[#66834a]" /> : <>
        <p className="font-mono text-[10px] tracking-widest text-[#66834a]">INSCRIBED TOKEN-2022 · SOLANA MAINNET</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{quote.name} <span className="font-mono text-lg text-[#7e8773]">${quote.symbol}</span></h1>
        <p className="mt-2 mb-6 text-sm leading-6 text-[#7e8773]">{quote.description}</p>
        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-[#dce1d5] bg-white">
            <div className="proof-image flex justify-center border-b border-[#e5e8e0] p-6">{bound?.status === 'valid' ? <Image src={bound.image} alt={`${quote.name} image read from Solana`} className="max-h-72 max-w-full rounded-lg" fittingType="fit" /> : <p className="py-10 font-mono text-xs text-[#7e8773]">{proof ? 'On-chain image not yet verifiable.' : 'Reading image bytes from chain…'}</p>}</div>
            <div className="p-5 text-xs"><div className="flex justify-between gap-3"><span className="text-[#878d7f]">Token mint</span><Link to={`/?address=${quote.tokenMint}`} className="break-all text-right font-mono text-[10px] text-[#58812d] underline">{quote.tokenMint}</Link></div>{bound?.status === 'valid' && <p className="mt-2 break-all font-mono text-[10px] text-[#7e8773]">SHA-256 {bound.hash} · {bound.immutable ? 'all authorities removed' : 'authorities still active'}</p>}</div>
          </section>
          <BuyPanel quote={quote} onClaimed={refetch} />
        </div>
      </>}
    </div>
  </main>;
}