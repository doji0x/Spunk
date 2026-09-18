import React from 'react';
import { Check, X, CircleHelp } from 'lucide-react';
import StandardCheck from '@/components/StandardCheck';

export default function ValidationResult({ result }) {
  if (!result) return null;
  const valid = result.status === 'valid';
  const invalid = result.status === 'invalid';
  const legacyCheck = result.checks?.metaplex || { status: 'unknown', message: 'This check was not returned.' };
  const v1Check = result.checks?.v1 || { status: 'unknown', message: 'This check was not returned.' };
  const libreplexCheck = result.checks?.libreplex || { status: 'unknown', message: 'This check was not returned.' };
  const heldCheck = result.checks?.held || { status: 'unknown', message: 'This check was not returned.' };
  const uriLinkedCheck = result.checks?.uriLinked || { status: 'unknown', message: 'This check was not returned.' };
  return <section aria-live="polite" className="mt-5 overflow-hidden rounded-3xl border border-border bg-card text-left">
    <div className="flex items-start gap-3 p-5"><span className={valid ? 'rounded-full bg-primary p-2 text-primary-foreground' : invalid ? 'rounded-full bg-destructive/15 p-2 text-destructive' : 'rounded-full bg-primary/10 p-2 text-primary'}>{valid ? <Check size={20} /> : invalid ? <X size={20} /> : <CircleHelp size={20} />}</span><div className="min-w-0"><h2 className="font-display font-semibold">{valid ? 'On-chain image found.' : invalid ? 'No supported inscription found.' : 'Verification incomplete'}</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{valid ? 'See the independent standard checks below.' : result.reason || result.message}</p></div></div>
    <StandardCheck title="Metaplex Inscription" check={legacyCheck} kind="metaplex" />
    <StandardCheck title="Solana V1 Transaction Inscription" check={v1Check} kind="v1" />
    <StandardCheck title="LibrePlex Inscription" check={libreplexCheck} kind="libreplex" />
    <StandardCheck title="Inscription Held By Token Address" check={heldCheck} kind="held" />
    <StandardCheck title="Token Metadata URI Linked Inscription" check={uriLinkedCheck} kind="uriLinked" />
    <p className="border-t border-border p-5 text-[10px] leading-relaxed text-muted-foreground">Verifies on-chain image bytes at lookup time, not ownership, originality, token value, or safety.</p>
  </section>;
}