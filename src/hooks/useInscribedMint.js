import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import writeInscriptionChunks from '@/components/admin/writeInscriptionChunks';
import { savePending, loadPending, clearPending, confirmedProgress } from '@/components/admin/inscriptionProgress';

const sha256 = async bytes => {
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));

export default function useInscribedMint(userId) {
  const [state, setState] = useState({ busy: false, progress: 0, error: '', result: null, pending: null });
  const running = useRef(false);
  useEffect(() => {
    if (!userId) return;
    try {
      const pending = loadPending(userId);
      if (pending) setState({ busy: false, progress: confirmedProgress(pending), error: 'An unfinished inscription was restored. Resume to continue the same mint.', result: null, pending });
    } catch (error) { setState(current => ({ ...current, error: error.message })); }
  }, [userId]);
  const remember = pending => {
    savePending(pending, userId);
    setState(current => ({ ...current, pending, progress: confirmedProgress(pending) }));
  };
  const append = async pending => {
    pending = await writeInscriptionChunks(pending, remember);
    const expectedHash = await sha256(pending.bytes);
    let proof = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const { data: verification } = await base44.functions.invoke('validateInscription', { address: pending.mint });
      proof = verification.checks?.metaplex;
      if (proof?.status === 'valid') break;
      await wait(2000);
    }
    if (proof?.status !== 'valid') throw new Error('The image transactions completed, but the on-chain bytes are not readable yet. Resume only this mint to verify again.');
    if (proof.hash?.toLowerCase() !== expectedHash) throw new Error('On-chain image verification failed: the embedded bytes do not match the uploaded image. Do not create another mint.');
    let edition = { maxSupply: pending.maxSupply, supply: pending.supply };
    if (pending.maxSupply === '1') {
      const response = await base44.functions.invoke('mintInscribedNft', { action: 'finalize', mint: pending.mint });
      edition = response.data;
    }
    clearPending(userId);
    setState({ busy: false, progress: 100, error: '', pending: null, result: { mint: pending.mint, owner: pending.owner, hash: proof.hash, ...edition } });
  };
  const prepare = async pending => {
    if (pending.prepared) return pending;
    const { data } = await base44.functions.invoke('mintInscribedNft', { action: 'start', requestId: pending.requestId, mint: pending.mint || undefined, name: pending.name, symbol: pending.symbol, details: pending.details, mimeType: pending.mimeType, totalSize: pending.bytes.length });
    if (data.error || !data.prepared || !Number.isInteger(data.batchBytes) || data.batchBytes <= 0) throw new Error(data.error || 'Mint preparation did not complete. Resume this attempt.');
    // Account length can include holes from out-of-order writes. Unknown chunks
    // are rechecked by the backend, never skipped based on allocated length.
    const prepared = { ...pending, ...data, offset: pending.offset || 0, confirmedOffsets: pending.confirmedOffsets || [] };
    remember(prepared);
    return prepared;
  };
  const start = async values => {
    if (running.current || !userId) return;
    running.current = true;
    setState({ busy: true, progress: 0, error: '', result: null, pending: null });
    let pending = null;
    try {
      if (!values.file || values.file.size < 1 || values.file.size > 1024 * 1024) throw new Error('The image must be 1 MB or smaller.');
      const bytes = new Uint8Array(await values.file.arrayBuffer());
      pending = { requestId: crypto.randomUUID(), mint: values.mint?.trim() || '', name: values.name, symbol: values.symbol, details: values.details, bytes, mimeType: values.file.type, offset: 0, confirmedOffsets: [], prepared: false };
      // Save the image and stable mint request before any transaction is sent.
      savePending(pending, userId, true);
      setState(current => ({ ...current, pending }));
      pending = await prepare(pending);
      await append(pending);
    } catch (error) {
      setState(current => ({ ...current, pending: current.pending || pending, busy: false, error: error.response?.data?.error || error.message || 'Minting stopped. Resume the existing mint instead of creating another.' }));
    } finally { running.current = false; }
  };
  const resume = async () => {
    if (!state.pending || running.current || !userId) return;
    running.current = true;
    setState(current => ({ ...current, busy: true, error: '' }));
    try { const pending = await prepare(state.pending); await append(pending); } catch (error) { setState(current => ({ ...current, busy: false, error: error.response?.data?.error || error.message || 'The inscription stopped. Try resuming again.' })); }
    finally { running.current = false; }
  };
  return { ...state, start, resume };
}