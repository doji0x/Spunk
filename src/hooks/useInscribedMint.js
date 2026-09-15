import { useState } from 'react';
import { base44 } from '@/api/base44Client';

const encode = bytes => {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return window.btoa(value);
};

export default function useInscribedMint() {
  const [state, setState] = useState({ busy: false, progress: 0, error: '', result: null, pending: null });
  const append = async pending => {
    let offset = pending.offset;
    while (offset < pending.bytes.length) {
      const batch = pending.bytes.slice(offset, offset + pending.batchBytes);
      const { data } = await base44.functions.invoke('mintInscribedNft', { action: 'append', mint: pending.mint, offset, totalSize: pending.bytes.length, mimeType: pending.mimeType, data: encode(batch) });
      offset = data.nextOffset;
      pending = { ...pending, offset };
      setState(current => ({ ...current, pending, progress: Math.round(offset / pending.bytes.length * 100) }));
    }
    const { data: verification } = await base44.functions.invoke('validateInscription', { address: pending.mint });
    const proof = verification.checks?.metaplex;
    if (proof?.status !== 'valid') throw new Error('The bytes were written, but the on-chain image proof is not readable yet. Resume to verify again.');
    setState({ busy: false, progress: 100, error: '', pending: null, result: { mint: pending.mint, owner: pending.owner, hash: proof.hash } });
  };
  const prepare = async pending => {
    if (pending.prepared) return pending;
    const { data } = await base44.functions.invoke('mintInscribedNft', { action: 'start', mint: pending.mint || undefined, name: pending.name, symbol: pending.symbol, details: pending.details, mimeType: pending.mimeType, totalSize: pending.bytes.length });
    const prepared = { ...pending, ...data };
    setState(current => ({ ...current, pending: prepared, progress: 1 }));
    return prepared;
  };
  const start = async values => {
    setState({ busy: true, progress: 0, error: '', result: null, pending: null });
    let pending = null;
    try {
      const bytes = new Uint8Array(await values.file.arrayBuffer());
      pending = { mint: values.mint?.trim() || '', name: values.name, symbol: values.symbol, details: values.details, bytes, mimeType: values.file.type, offset: 0, prepared: false };
      if (pending.mint) setState(current => ({ ...current, pending }));
      pending = await prepare(pending);
      await append(pending);
    } catch (error) {
      setState(current => ({ ...current, pending: current.pending || pending, busy: false, error: error.response?.data?.error || error.message || 'Minting stopped. Resume the existing mint instead of creating another.' }));
    }
  };
  const resume = async () => {
    if (!state.pending) return;
    setState(current => ({ ...current, busy: true, error: '' }));
    try { const pending = await prepare(state.pending); await append(pending); } catch (error) { setState(current => ({ ...current, busy: false, error: error.response?.data?.error || error.message || 'The inscription stopped. Try resuming again.' })); }
  };
  return { ...state, start, resume };
}