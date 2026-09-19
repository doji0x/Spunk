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
import PunksHero from '@/components/punks/PunksHero';
import { Image } from '@/components/ui/image';
import { Link } from 'react-router-dom';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [about, setAbout] = useState(false);
  const [supportEnabled, setSupportEnabled] = useState(false); // Support toggle state

  const toggleSupport = () => setSupportEnabled(!supportEnabled); // Toggle function

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
    } catch {
      setResult({ status: 'unknown', message: 'The verification service is unavailable. Please try again shortly.' });
    } finally {
      setLoading(false);
    }
  };

  return <div className="validate-surface flex min-h-screen flex-col pb-24 text-foreground">
    <ValidateHeader onLearn={() => setAbout(true)} />
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-20 pt-14 text-center sm:pt-20">
      <PunksHero />
      <CurationPreservation />
      <button onClick={toggleSupport} className="mt-6 mb-4 bg-primary text-white px-4 py-2 rounded">
        {supportEnabled ? 'Disable Support' : 'Enable Support'}
      </button>
      {supportEnabled && <div className="rounded-md bg-secondary p-4 text-secondary-foreground">Support features are now enabled.</div>}

      <section className="mt-16 rounded-3xl border border-primary/25 bg-card p-7 text-left sm:p-9" aria-labelledby="proof-of-fart-heading">
        <p className="font-mono text-[9px] tracking-[0.18em] text-primary">ON-CHAIN AUDIO EXPERIMENT</p>
        <h2 id="proof-of-fart-heading" className="mt-3 font-display text-2xl font-bold tracking-tight">Proof of Fart</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">See how a Fly Brain agent inscribes an MP3 fart directly onto Solana, then verify the audio bytes yourself.</p>
        <Link to="/proof-of-fart" className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90">Explore Proof of Fart <ArrowUpRight size={14} /></Link>
      </section>
      
      <section className="mt-16 border-t border-primary/20 pt-14 sm:mt-20 sm:pt-16" aria-labelledby="verify-heading">
        <div className="mb-7">
          <p className="font-mono text-[9px] tracking-[0.18em] text-primary">PROVENANCE TOOL</p>
          <h2 id="verify-heading" className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Verify an inscription</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">Confirm that a token’s complete image bytes live on Solana—not behind a mutable off-chain link.</p>
        </div>
        
        <ValidationForm onValidate={validate} loading={loading} />
        <InscriptionExamples onValidate={validate} disabled={loading} />
        <ValidationResult result={result} />

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><Check size={11} className="text-primary" />ACTUAL IMAGE BYTES</span>
          <span className="flex items-center gap-1.5"><Check size={11} className="text-primary" />NO OFF-CHAIN SHORTCUTS</span>
        </div>
        
        <ValidationExplainer />
      </section>
    </main>
    
    <footer className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 border-t border-border px-4 py-7 text-center text-[10px] text-muted-foreground">
      <div className="flex w-full items-center justify-between">
        <span className="flex items-center gap-2 font-display font-semibold tracking-wider text-foreground">
          <Image src="https://media.base44.com/images/public/6aa8d3c82020abebe308c467/8d0945030_solana_pixel_avatar_under_1mb.png" alt="Punks" className="h-7 w-7 rounded-md ring-1 ring-primary/30" />PUNKS
        </span>
        <button onClick={() => setAbout(true)} className="flex items-center gap-1 hover:text-primary">Metaplex + Solana v1 + LibrePlex <ArrowUpRight size={12} /></button>
      </div>
      <nav aria-label="External links" className="flex items-center gap-4">
        <a href="https://github.com/doji0x/Spunk" target="_blank" rel="noreferrer" className="hover:text-primary">Docs</a>
        <a href="https://x.com/humanevolvd?s=11" target="_blank" rel="noreferrer" className="hover:text-primary">X</a>
        <span className="font-mono">SOLANA CYPHER PUNKS</span>
      </nav>
      <SupportToken />
    </footer>
    
    <ValidateBottomBar />
    <ValidationAbout open={about} onOpenChange={setAbout} />
  </div>;
}