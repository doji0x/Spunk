import React, { useState } from 'react';
import { AudioLines, BrainCircuit, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import ValidateHeader from '@/components/ValidateHeader';
import ValidationForm from '@/components/ValidationForm';
import ValidationResult from '@/components/ValidationResult';

export default function ProofOfFart() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const validate = async address => {
    setLoading(true);
    setResult(null);
    try {
      const { data } = await base44.functions.invoke('validateInscription', { address });
      setResult(data);
    } catch {
      setResult({ status: 'unknown', message: 'The verification service is unavailable. Please try again shortly.' });
    } finally {
      setLoading(false);
    }
  };

  return <div className="validate-surface min-h-screen pb-20 text-foreground">
    <ValidateHeader />
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-14 sm:pt-20">
      <section className="text-center" aria-labelledby="proof-of-fart-title">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary"><AudioLines size={28} /></div>
        <p className="mt-6 font-mono text-[10px] tracking-[0.2em] text-primary">PROOF OF FART</p>
        <h1 id="proof-of-fart-title" className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">A fart, permanently on-chain.</h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-muted-foreground">A Fly Brain agent captures an MP3 fart, submits it through a locked inscription endpoint, and writes the actual audio bytes to Solana. No mutable audio host. No off-chain shortcut.</p>
      </section>
      <section className="mt-12 grid gap-3 sm:grid-cols-3" aria-label="How it works">
        <div className="rounded-2xl border border-border bg-card p-5"><BrainCircuit className="text-primary" size={20} /><h2 className="mt-4 font-display font-semibold">Fly Brain submits</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">The authorized agent sends the MP3 and inscription details.</p></div>
        <div className="rounded-2xl border border-border bg-card p-5"><ShieldCheck className="text-primary" size={20} /><h2 className="mt-4 font-display font-semibold">Validate guards</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Format, size, rate, and cost limits are checked before minting.</p></div>
        <div className="rounded-2xl border border-border bg-card p-5"><AudioLines className="text-primary" size={20} /><h2 className="mt-4 font-display font-semibold">Solana preserves</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">The MP3 bytes are inscribed and independently verifiable.</p></div>
      </section>
      <section className="mt-14 border-t border-primary/20 pt-12 text-center" aria-labelledby="check-fart-title">
        <p className="font-mono text-[10px] tracking-[0.18em] text-primary">CHECK THE RECEIPT</p><h2 id="check-fart-title" className="mt-3 font-display text-3xl font-bold">Verify the inscription</h2><p className="mx-auto mb-7 mt-3 max-w-md text-sm leading-6 text-muted-foreground">Paste the resulting mint address to confirm its complete audio bytes live on-chain.</p>
        <ValidationForm onValidate={validate} loading={loading} /><ValidationResult result={result} />
      </section>
      <div className="mt-10 text-center"><Link to="/" className="text-xs text-muted-foreground transition hover:text-primary">Back to Punks</Link></div>
    </main>
  </div>;
}