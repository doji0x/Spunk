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
    setState({ busy: false, progress: 100, error: '', pending: null, result: { mint: pending.mint, owner: pending.owner, gatewayUrl: pending.gatewayUrl } });
  };
  const start = async values => {
    setState({ busy: true, progress: 0, error: '', result: null, pending: null });
    try {
      const bytes = new Uint8Array(await values.file.arrayBuffer());
      const { data } = await base44.functions.invoke('mintInscribedNft', { action: 'start', name: values.name, symbol: values.symbol, details: values.details, mimeType: values.file.type, totalSize: bytes.length });
      const pending = { ...data, bytes, mimeType: values.file.type, offset: 0 };
      setState(current => ({ ...current, pending, progress: 1 }));
      await append(pending);
    } catch (error) {
      setState(current => ({ ...current, busy: false, error: error.response?.data?.error || error.message || 'Minting failed. You can resume if the NFT was already created.' }));
    }
  };
  const resume = async () => {
    if (!state.pending) return;
    setState(current => ({ ...current, busy: true, error: '' }));
    try { await append(state.pending); } catch (error) { setState(current => ({ ...current, busy: false, error: error.response?.data?.error || error.message || 'The inscription stopped. Try resuming again.' })); }
  };
  return { ...state, start, resume };
}