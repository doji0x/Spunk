import React, { useState } from 'react';
import { ArrowRight, Clipboard, ScanLine, LoaderCircle, LockKeyhole } from 'lucide-react';
export default function ValidationForm({ onValidate, loading }) {
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const paste = async () => { try { setAddress((await navigator.clipboard.readText()).trim()); setError(''); } catch { setError('Paste with your keyboard, or press and hold the address field.'); } };
  const submit = e => { e.preventDefault(); const value = address.trim(); if (!/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(value)) { setError('Enter a Solana token mint address or transaction signature.'); return; } setError(''); onValidate(value); };
  return <form onSubmit={submit} className="gold-glow relative rounded-3xl border border-primary/25 bg-card p-5 sm:p-7">
    <div className="mb-5 flex items-center justify-between"><label htmlFor="address" className="font-mono text-[10px] font-medium tracking-[0.14em] text-muted-foreground">YOUR ADDRESS. THE CHAIN’S TRUTH.</label><ScanLine size={16} className="text-primary" /></div>
    <div className="flex items-center rounded-xl border border-input bg-background pl-4 transition focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10"><input id="address" autoComplete="off" spellCheck={false} value={address} onChange={e => { setAddress(e.target.value); setError(''); }} placeholder="Paste a transaction or token address" disabled={loading} className="min-w-0 flex-1 bg-transparent py-[19px] font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground sm:text-sm" /><button type="button" onClick={paste} disabled={loading} aria-label="Paste address from clipboard" className="m-2 rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"><Clipboard size={17} /></button></div>
    {error && <p role="alert" className="mt-3 text-left text-xs text-destructive">{error}</p>}
    <button type="submit" disabled={loading || !address.trim()} className="mt-3 flex w-full items-center justify-center gap-3 rounded-full bg-primary py-[17px] text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">{loading ? <><LoaderCircle size={17} className="animate-spin" />Reading the chain…</> : <>Validate inscription <ArrowRight size={17} /></>}</button>
    <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground"><LockKeyhole size={11} />No wallet connection. Just on-chain proof.</p>
  </form>;
}