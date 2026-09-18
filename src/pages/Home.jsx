import React, { useState } from 'react';
import { Check, ArrowUpRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ValidateHeader from '@/components/ValidateHeader';
import ValidationForm from '@/components/ValidationForm';
import ValidationResult from '@/components/ValidationResult';
import ValidationExplainer from '@/components/ValidationExplainer';
import CurationPreservation from '@/components/CurationPreservation';
import ValidationAbout from '@/components/ValidationAbout';
import InscriptionExamples from '@/components/InscriptionExamples';
import SupportToken from '@/components/SupportToken';
import ValidateBottomBar from '@/components/nav/ValidateBottomBar';
export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [about, setAbout] = useState(false);
  const validate = async address => {
    setLoading(true); setResult(null);
    try {
      const { data } = await base44.functions.invoke('validateInscription', { address });
      setResult(data);
      if (data.status === 'valid') {
        Promise.all(Object.entries(data.checks || {}).map(async ([kind, check]) => {
          if (check?.status !== 'valid' || !check.image) return [kind, check];
          try {
            const image = new window.Image(); image.src = check.image; await image.decode();
            return [kind, check];
          } catch { return [kind, { ...check, image: null, undecodable: true }]; }
        })).then(checks => setResult(current => current === data ? { ...data, checks: Object.fromEntries(checks) } : current));
      }
    } catch { setResult({ status: 'unknown', message: 'The verification service is unavailable. Please try again shortly.' }); }
    finally { setLoading(false); }
  };
  return <div className="validate-surface flex min-h-screen flex-col pb-24 text-foreground">
    <ValidateHeader onLearn={() => setAbout(true)} />
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-20 pt-14 text-center sm:pt-20">
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 font-mono text-[9px] tracking-[0.16em] text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" />DON’T TRUST. VERIFY.</div>
      <h1 className="font-display text-[48px] font-bold leading-[0.98] tracking-[-3px] sm:text-[72px] sm:tracking-[-4px]">Is it really<br /><span className="gold-text">on-chain?</span></h1>
      <p className="mx-auto mb-8 mt-6 max-w-md text-sm leading-6 text-muted-foreground">Anyone can claim it. The chain can prove it.<br />Verify that a token’s image actually lives on Solana.</p>
      <ValidationForm onValidate={validate} loading={loading} /><InscriptionExamples onValidate={validate} disabled={loading} /><ValidationResult result={result} />
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-[9px] text-muted-foreground"><span className="flex items-center gap-1.5"><Check size={11} className="text-primary" />ACTUAL IMAGE BYTES</span><span className="flex items-center gap-1.5"><Check size={11} className="text-primary" />NO OFF-CHAIN SHORTCUTS</span></div>
      <ValidationExplainer />
      <CurationPreservation />
    </main>
    <footer className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 border-t border-border px-4 py-7 text-center text-[10px] text-muted-foreground"><div className="flex w-full items-center justify-between"><span className="font-display font-semibold tracking-wider text-foreground">VALIDATE</span><button onClick={() => setAbout(true)} className="flex items-center gap-1 hover:text-primary">Metaplex + Solana v1 + LibrePlex <ArrowUpRight size={12} /></button></div><nav aria-label="External links" className="flex items-center gap-4"><a href="https://github.com/doji0x/validate" target="_blank" rel="noreferrer" className="hover:text-primary">Docs</a><a href="https://x.com/humanevolvd?s=11" target="_blank" rel="noreferrer" className="hover:text-primary">X</a><span className="font-mono">BUILT ON SOLANA</span></nav><SupportToken /></footer>
    <ValidateBottomBar />
    <ValidationAbout open={about} onOpenChange={setAbout} />
  </div>;
}