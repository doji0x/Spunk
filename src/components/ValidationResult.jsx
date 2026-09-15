import React from 'react';
import { Check, X, CircleHelp } from 'lucide-react';
import StandardCheck from '@/components/StandardCheck';

export default function ValidationResult({ result }) {
  if (!result) return null;
  const valid = result.status === 'valid';
  const invalid = result.status === 'invalid';
  const legacyCheck = result.checks?.metaplex || result;
  const v1Check = result.checks?.v1 || { status: 'unknown', message: 'This check was not returned.' };
  const libreplexCheck = result.checks?.libreplex || { status: 'unknown', message: 'This check was not returned.' };
  return <section aria-live="polite" className="mt-5 overflow-hidden rounded-2xl border border-[#dce1d5] bg-white text-left">
    <div className="flex items-start gap-3 p-5"><span className={valid ? 'rounded-full bg-[#c2f486] p-2' : invalid ? 'rounded-full bg-[#f8e2dc] p-2 text-[#a54132]' : 'rounded-full bg-[#f1ecd7] p-2 text-[#887330]'}>{valid ? <Check size={20} /> : invalid ? <X size={20} /> : <CircleHelp size={20} />}</span><div className="min-w-0"><h2 className="font-semibold">{valid ? 'On-chain image found.' : invalid ? 'No supported inscription found.' : 'Verification incomplete'}</h2><p className="mt-1 text-xs leading-relaxed text-[#7c8275]">{valid ? 'See the independent standard checks below.' : result.reason || result.message}</p></div></div>
    <StandardCheck title="Metaplex Inscription" check={legacyCheck} kind="metaplex" />
    <StandardCheck title="Solana V1 Transaction Inscription" check={v1Check} kind="v1" />
    <StandardCheck title="LibrePlex Inscription" check={libreplexCheck} kind="libreplex" />
    <p className="border-t border-[#e5e8e0] p-5 text-[10px] leading-relaxed text-[#959b8e]">Verifies on-chain image bytes at lookup time, not ownership, originality, token value, or safety.</p>
  </section>;
}