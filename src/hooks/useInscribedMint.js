import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import writeInscriptionChunks from '@/components/admin/writeInscriptionChunks';
import { savePending, loadPending, clearPending, confirmedProgress } from '@/components/admin/inscriptionProgress';
import { addInscriptionLog, loadInscriptionLog } from '@/components/admin/inscriptionLog';

const sha256 = async bytes => {
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));

export default function useInscribedMint(userId, selectedMint = '') {
  const [state, setState] = useState({ busy: false, progress: 0, error: '', result: null, pending: null, activity: 'Ready', logs: [] });
  const running = useRef(false);
  const log = (message, details = '') => {
    const logs = addInscriptionLog(userId, message, details);
    setState(current => ({ ...current, logs }));
  };
  useEffect(() => {
    if (!userId) return;
    try {
      const logs = loadInscriptionLog(userId);
      const savedPending = loadPending(userId);
      const pending = savedPending && (!selectedMint || savedPending.mint === selectedMint) ? savedPending : null;
      if (pending) {
        const restored = addInscriptionLog(userId, 'Restored unfinished inscription', `${pending.mint || 'Mint preparation pending'} · ${confirmedProgress(pending)}% confirmed`);
        setState({ busy: false, progress: confirmedProgress(pending), error: 'An unfinished inscription was restored. Resume to continue the same mint.', result: null, pending, activity: 'Paused — ready to resume', logs: restored });
      } else setState(current => ({ ...current, logs }));
    } catch (error) { setState(current => ({ ...current, error: error.message, activity: 'Recovery needs attention', logs: loadInscriptionLog(userId) })); }
  }, [userId, selectedMint]);
  const remember = pending => {
    savePending(pending, userId);
    setState(current => ({ ...current, pending, progress: confirmedProgress(pending) }));
  };
  const append = async pending => {
    setState(current => ({ ...current, activity: 'Writing remaining image chunks' }));
    log('Writing remaining image chunks', `${(pending.confirmedOffsets || []).length} already confirmed`);
    pending = await writeInscriptionChunks(pending, next => {
      remember(next);
      log('Chunk confirmed', `${next.confirmedOffsets.length} of ${Math.ceil(next.bytes.length / next.batchBytes)} · ${confirmedProgress(next)}%`);
    });
    setState(current => ({ ...current, activity: 'Verifying complete on-chain image' }));
    log('All chunks submitted', 'Waiting for on-chain verification');
    const expectedHash = await sha256(pending.bytes);
    let proof = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const { data: verification } = await base44.functions.invoke('validateInscription', { address: pending.mint });
      proof = verification.checks?.metaplex;
      if (proof?.status === 'valid') break;
      if (attempt === 0 || attempt === 5) log('Verification still pending', `Check ${attempt + 1} of 12`);
      await wait(2000);
    }
    if (proof?.status !== 'valid') throw new Error('The image transactions completed, but the on-chain bytes are not readable yet. Resume only this mint to verify again.');
    if (proof.hash?.toLowerCase() !== expectedHash) throw new Error('On-chain image verification failed: the embedded bytes do not match the uploaded image. Do not create another mint.');
    let edition = { maxSupply: pending.maxSupply, supply: pending.supply };
    if (pending.maxSupply === '1') {
      setState(current => ({ ...current, activity: 'Finalizing NFT edition' }));
      log('Image verified', `SHA-256 ${proof.hash}`);
      const response = await base44.functions.invoke('mintInscribedNft', { action: 'finalize', mint: pending.mint });
      edition = response.data;
    }
    await base44.entities.MintRecord.update(pending.mintRecordId, { status: 'success', imageHash: proof.hash, owner: pending.owner, errorMessage: '' });
    clearPending(userId);
    const logs = addInscriptionLog(userId, 'Inscription completed', pending.mint);
    setState({ busy: false, progress: 100, error: '', pending: null, result: { mint: pending.mint, owner: pending.owner, hash: proof.hash, ...edition }, activity: 'Complete', logs });
  };
  const prepare = async pending => {
    setState(current => ({ ...current, activity: pending.prepared ? 'Checking saved preparation' : 'Preparing mint accounts' }));
    log(pending.prepared ? 'Checking saved preparation' : 'Preparing mint accounts', pending.mint || pending.requestId);
    let preparedBase = pending;
    if (!pending.prepared) {
      const { data } = await base44.functions.invoke('mintInscribedNft', { action: 'start', requestId: pending.requestId, mint: pending.mint || undefined, name: pending.name, symbol: pending.symbol, details: pending.details, mimeType: pending.mimeType, totalSize: pending.bytes.length });
      if (data.error || !data.prepared || !Number.isInteger(data.batchBytes) || data.batchBytes <= 0) throw new Error(data.error || 'Mint preparation did not complete. Resume this attempt.');
      // Unknown chunks are rechecked by the backend, never skipped based on allocated length.
      preparedBase = { ...pending, ...data, offset: pending.offset || 0, confirmedOffsets: pending.confirmedOffsets || [] };
    }
    const recordData = { mint: preparedBase.mint, requestId: pending.requestId, name: pending.name, symbol: pending.symbol.toUpperCase(), description: pending.details, owner: preparedBase.owner, status: 'in_progress', errorMessage: '' };
    const matches = await base44.entities.MintRecord.filter({ requestId: pending.requestId });
    const record = matches[0] ? await base44.entities.MintRecord.update(matches[0].id, recordData) : await base44.entities.MintRecord.create(recordData);
    const prepared = { ...preparedBase, mintRecordId: record.id };
    remember(prepared);
    log('Mint preparation confirmed', prepared.mint);
    return prepared;
  };
  const start = async values => {
    if (running.current || !userId) return;
    running.current = true;
    setState({ busy: true, progress: 0, error: '', result: null, pending: null, activity: 'Reading selected image', logs: loadInscriptionLog(userId) });
    log('Started inscription attempt');
    let pending = null;
    try {
      if (!values.file || values.file.size < 1 || values.file.size > 1024 * 1024) throw new Error('The image must be 1 MB or smaller.');
      const bytes = new Uint8Array(await values.file.arrayBuffer());
      pending = { requestId: values.requestId || crypto.randomUUID(), mint: values.mint?.trim() || '', name: values.name, symbol: values.symbol, details: values.details, bytes, fileName: values.file.name, mimeType: values.file.type, offset: 0, confirmedOffsets: [], prepared: false };
      // Save the image and stable mint request before any transaction is sent.
      savePending(pending, userId, true);
      setState(current => ({ ...current, pending }));
      pending = await prepare(pending);
      await append(pending);
    } catch (error) {
      const message = error.response?.data?.error || error.message || 'Minting stopped. Resume the existing mint instead of creating another.';
      if (pending?.mintRecordId) await base44.entities.MintRecord.update(pending.mintRecordId, { status: 'failed', errorMessage: message });
      const logs = addInscriptionLog(userId, 'Inscription paused', message);
      setState(current => ({ ...current, pending: current.pending || pending, busy: false, error: message, activity: 'Paused — progress saved', logs }));
    } finally { running.current = false; }
  };
  const resume = async () => {
    if (!state.pending || running.current || !userId) return;
    running.current = true;
    setState(current => ({ ...current, busy: true, error: '', activity: 'Resuming saved inscription' }));
    log('Resume requested', `${state.pending.mint || 'Mint preparation pending'} · ${state.progress}% confirmed`);
    let pending = state.pending;
    try { pending = await prepare(pending); await append(pending); } catch (error) {
      const message = error.response?.data?.error || error.message || 'The inscription stopped. Try resuming again.';
      if (pending?.mintRecordId) await base44.entities.MintRecord.update(pending.mintRecordId, { status: 'failed', errorMessage: message });
      const logs = addInscriptionLog(userId, 'Resume paused', message);
      setState(current => ({ ...current, busy: false, error: message, activity: 'Paused — progress saved', logs }));
    }
    finally { running.current = false; }
  };
  return { ...state, start, resume };
}