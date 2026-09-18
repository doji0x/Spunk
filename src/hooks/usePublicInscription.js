import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { usePhantomWallet } from '@/contexts/PhantomWalletContext';
import { phantomTransaction } from '@/lib/phantomTransaction';
import { clearPublicInscription, loadPublicInscription, publicInscriptionProgress, savePublicInscription } from '@/lib/publicInscriptionProgress';
import writePublicInscriptionChunks from '@/lib/writePublicInscriptionChunks';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value)), byte => byte.toString(16).padStart(2, '0')).join('');
const randomSecret = () => { const bytes = crypto.getRandomValues(new Uint8Array(32)); return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''); };
export default function usePublicInscription() {
  const wallet = usePhantomWallet(), running = useRef(false);
  const [state, setState] = useState({ busy: false, progress: 0, activity: 'Ready', error: '', pending: null, result: null });
  useEffect(() => { if (!wallet.address) return; const pending = loadPublicInscription(wallet.address); if (pending) setState({ busy: false, progress: publicInscriptionProgress(pending), activity: 'Paused — ready to resume', error: 'An unfinished inscription was restored.', pending, result: null }); }, [wallet.address]);
  const remember = pending => { savePublicInscription(wallet.address, pending); setState(current => ({ ...current, pending, progress: publicInscriptionProgress(pending) })); };
  async function complete(pending) {
    setState(current => ({ ...current, activity: 'Writing image bytes on-chain' }));
    pending = await writePublicInscriptionChunks(pending, remember);
    setState(current => ({ ...current, activity: 'Verifying the on-chain image' }));
    const expected = await hash(pending.bytes); let proof;
    for (let attempt = 0; attempt < 12; attempt += 1) { const response = await base44.functions.invoke('validateInscription', { address: pending.mint }); proof = response.data.checks?.metaplex; if (proof?.status === 'valid') break; await wait(2000); }
    if (proof?.status !== 'valid' || proof.hash?.toLowerCase() !== expected) throw new Error('The image write finished but has not passed on-chain verification. Resume this inscription.');
    setState(current => ({ ...current, activity: 'Finalizing and delivering your NFT' }));
    await base44.functions.invoke('mintInscribedNft', { action: 'finalize', mint: pending.mint, totalSize: pending.bytes.length, publicAuth: pending.publicAuth });
    await base44.functions.invoke('mintInscribedNft', { action: 'transfer', mint: pending.mint, destination: wallet.address, totalSize: pending.bytes.length, publicAuth: pending.publicAuth });
    clearPublicInscription(wallet.address); setState({ busy: false, progress: 100, activity: 'Complete', error: '', pending: null, result: { mint: pending.mint, hash: proof.hash } });
  }
  async function start(values) {
    if (!wallet.address) { await wallet.connect(); return; } if (wallet.network !== 'mainnet-beta' || running.current) return;
    running.current = true; setState({ busy: true, progress: 0, activity: 'Preparing inscription payment', error: '', pending: null, result: null });
    let pending;
    try {
      const bytes = new Uint8Array(await values.file.arrayBuffer()), requestId = crypto.randomUUID(), sessionSecret = randomSecret(), sessionHash = await hash(new TextEncoder().encode(sessionSecret));
      const quote = await base44.functions.invoke('mintInscribedNft', { action: 'publicQuote', walletAddress: wallet.address, requestId, sessionHash, totalSize: bytes.length });
      const payment = await wallet.provider.signAndSendTransaction(phantomTransaction(quote.data.transaction));
      pending = { ...values, file: undefined, bytes, fileName: values.file.name, mimeType: values.file.type, requestId, publicAuth: { walletAddress: wallet.address, paymentSignature: payment.signature, requestId, sessionSecret }, confirmedOffsets: [], prepared: false };
      remember(pending); setState(current => ({ ...current, activity: 'Preparing your NFT accounts' }));
      const response = await base44.functions.invoke('mintInscribedNft', { action: 'start', requestId, name: values.name, symbol: values.symbol, details: values.details, mimeType: values.file.type, totalSize: bytes.length, publicAuth: pending.publicAuth });
      if (response.data.error) throw new Error(response.data.error); pending = { ...pending, ...response.data, publicAuth: pending.publicAuth }; remember(pending); await complete(pending);
    } catch (error) { setState(current => ({ ...current, busy: false, pending: current.pending || pending, activity: 'Paused — progress saved', error: error.response?.data?.error || error.message || 'The inscription paused.' })); }
    finally { running.current = false; }
  }
  async function resume() { if (!state.pending || running.current) return; running.current = true; setState(current => ({ ...current, busy: true, error: '', activity: 'Resuming inscription' })); try { let pending = state.pending; if (!pending.prepared) { const response = await base44.functions.invoke('mintInscribedNft', { action: 'start', requestId: pending.requestId, name: pending.name, symbol: pending.symbol, details: pending.details, mimeType: pending.mimeType, totalSize: pending.bytes.length, publicAuth: pending.publicAuth }); pending = { ...pending, ...response.data, publicAuth: pending.publicAuth }; remember(pending); } await complete(pending); } catch (error) { setState(current => ({ ...current, busy: false, error: error.response?.data?.error || error.message, activity: 'Paused — progress saved' })); } finally { running.current = false; } }
  return { wallet, ...state, start, resume };
}