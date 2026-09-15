import React, { useState } from 'react';
import { Check, ArrowUpRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ValidateHeader from '@/components/ValidateHeader';
import ValidationForm from '@/components/ValidationForm';
import ValidationResult from '@/components/ValidationResult';
import ValidationExplainer from '@/components/ValidationExplainer';
import ValidationAbout from '@/components/ValidationAbout';
export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [about, setAbout] = useState(false);
  const validate = async address => {
    setLoading(true); setResult(null);
    try {
      const { data } = await base44.functions.invoke('validateInscription', { address });
      if (data.status === 'valid') {
        const image = new window.Image(); image.src = data.image;
        try { await image.decode(); } catch { setResult({ status: 'unknown', message: 'The inscription exists, but its image bytes could not be decoded. It may be incomplete or corrupted.' }); return; }
      }
      setResult(data);
    } catch { setResult({ status: 'unknown', message: 'The verification service is unavailable. Please try again shortly.' }); }
    finally { setLoading(false); }
  };
  return <div className="validate-surface flex min-h-screen flex-col text-[#252b20]">
    <ValidateHeader onLearn={() => setAbout(true)} />
    <main className="mx-auto w-full max-w-[1100px] flex-1 px-5 pb-14 pt-12 text-center sm:pt-16 lg:pt-[72px]">
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#dce3d1] bg-[#edf2e6] px-3 py-1.5 font-mono text-[9px] tracking-[0.12em] text-[#6a7e56]"><span className="h-1 w-1 rounded-full bg-[#698d45]" />DON’T TRUST. VERIFY.</div>
      <h1 className="text-[52px] font-medium leading-[1.04] tracking-[-3px] sm:text-[76px] sm:tracking-[-4.5px]">Is it really<br /><span className="font-serif italic font-normal text-[#66834a]">on-chain?</span></h1>
      <p className="mx-auto mb-8 mt-6 max-w-[450px] text-[14px] leading-6 text-[#7e8773] sm:mb-9">Anyone can claim it. The chain can prove it.<br />Verify that a token’s image actually lives on Solana.</p>
      <div className="mx-auto max-w-[570px]"><ValidationForm onValidate={validate} loading={loading} /><ValidationResult result={result} /></div>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-[9px] text-[#939d85]"><span className="flex items-center gap-1.5"><Check size={11} />ACTUAL IMAGE BYTES</span><span className="flex items-center gap-1.5"><Check size={11} />NO OFF-CHAIN SHORTCUTS</span></div>
      <ValidationExplainer />
    </main>
    <footer className="mx-5 flex flex-col items-center justify-between gap-4 border-t border-[#dce1d5] py-6 text-[10px] text-[#929989] sm:mx-10 sm:flex-row lg:mx-16"><span className="flex items-center gap-2"><span className="font-semibold text-[#657456]">validate.</span> Less trust. More truth.</span><button onClick={() => setAbout(true)} className="flex items-center gap-1 hover:text-[#52683f]">Metaplex inscriptions · Mainnet only <ArrowUpRight size={12} /></button><span className="font-mono text-[9px] tracking-wider">BUILT ON <span className="ml-1 font-semibold text-[#4e5b42]">SOLANA</span></span></footer>
    <ValidationAbout open={about} onOpenChange={setAbout} />
  </div>;
}