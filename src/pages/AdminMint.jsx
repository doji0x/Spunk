import React, { useEffect, useState } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import MintForm from '@/components/admin/MintForm';
import MintStatus from '@/components/admin/MintStatus';
import useInscribedMint from '@/hooks/useInscribedMint';

export default function AdminMint() {
  const [user, setUser] = useState();
  const mint = useInscribedMint();
  useEffect(() => { base44.auth.me().then(setUser); }, []);
  if (!user) return <div className="validate-surface flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#dce1d5] border-t-[#66834a]" /></div>;
  if (user.role !== 'admin') return <main className="validate-surface flex min-h-screen items-center justify-center px-5"><div className="max-w-md rounded-2xl border border-[#dce1d5] bg-white p-8 text-center"><h1 className="text-xl font-semibold">Admin access required</h1><p className="mt-2 text-sm text-[#7e8773]">This mint console is restricted to administrator accounts.</p><Link to="/" className="mt-5 inline-block text-sm underline">Return home</Link></div></main>;
  return <main className="validate-surface min-h-screen px-5 py-10 text-[#252b20]">
    <div className="mx-auto max-w-2xl"><Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm text-[#657456]"><ArrowLeft size={16} />Back to validator</Link>
      <div className="mb-7 flex items-start gap-3"><span className="rounded-full bg-[#edf2e6] p-2 text-[#66834a]"><ShieldCheck size={20} /></span><div><p className="font-mono text-[10px] tracking-widest text-[#66834a]">ADMIN · SOLANA MAINNET</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Mint an inscribed NFT</h1><p className="mt-2 text-sm leading-6 text-[#7e8773]">Creates one NFT owned by the server mint wallet and writes its metadata and complete image bytes directly on-chain.</p></div></div>
      <MintForm onMint={mint.start} busy={mint.busy} /><MintStatus {...mint} onResume={mint.resume} />
    </div>
  </main>;
}