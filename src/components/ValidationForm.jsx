import React, { useState } from 'react';
import { ArrowRight, Clipboard, ScanLine, LoaderCircle, LockKeyhole } from 'lucide-react';
export default function ValidationForm({ onValidate, loading }) {
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const paste = async () => { try { setAddress((await navigator.clipboard.readText()).trim()); setError(''); } catch { setError('Paste with your keyboard, or press and hold the address field.'); } };
  const submit = e => { e.preventDefault(); const value = address.trim(); if (!/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(value)) { setError('Enter a Solana token mint address or transaction signature.'); return; } setError(''); onValidate(value); };
  return <form onSubmit={submit} className="relative rounded-[20px] border border-[#dce1d5] bg-white p-5 shadow-[0_8px_32px_-16px_#31491c24] sm:p-7">
    <div className="mb-5 flex items-center justify-between"><label htmlFor="address" className="font-mono text-[10px] font-medium tracking-[0.14em] text-[#666c61]">YOUR ADDRESS. THE CHAIN’S TRUTH.</label><ScanLine size={16} className="text-[#8c9485]" /></div>
    <div className="flex items-center rounded-lg border border-[#dfe3da] bg-[#f8f9f6] pl-4 transition focus-within:border-[#81a752] focus-within:ring-2 focus-within:ring-[#b8ef69]/20"><input id="address" autoComplete="off" spellCheck={false} value={address} onChange={e => { setAddress(e.target.value); setError(''); }} placeholder="Paste a transaction or token address" disabled={loading} className="min-w-0 flex-1 bg-transparent py-[19px] font-mono text-xs outline-none placeholder:text-[#9a9e94] sm:text-sm" /><button type="button" onClick={paste} disabled={loading} aria-label="Paste address from clipboard" className="m-2 rounded-md p-2 text-[#858d7c] hover:bg-[#ebeee5]"><Clipboard size={17} /></button></div>
    {error && <p role="alert" className="mt-3 text-left text-xs text-[#a54132]">{error}</p>}
    <button type="submit" disabled={loading || !address.trim()} className="mt-3 flex w-full items-center justify-center gap-3 rounded-lg bg-[#21271e] py-[17px] text-sm font-semibold text-white transition hover:bg-[#34452b] disabled:cursor-not-allowed disabled:opacity-60">{loading ? <><LoaderCircle size={17} className="animate-spin" />Reading the chain…</> : <>Validate inscription <ArrowRight size={17} className="text-[#b8ef69]" /></>}</button>
    <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-[#92978c]"><LockKeyhole size={11} />No wallet connection. Just on-chain proof.</p>
  </form>;
}