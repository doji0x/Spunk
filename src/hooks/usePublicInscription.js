import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { usePhantomWallet } from '@/contexts/PhantomWalletContext';
import { phantomTransaction } from '@/lib/phantomTransaction';

const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value)), byte => byte.toString(16).padStart(2, '0')).join('');
const randomSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
const percent = record => record?.totalSize ? Math.min(100, Math.round(((record.offset || 0) / record.totalSize) * 100)) : 0;

export default function usePublicInscription() {
  const wallet = usePhantomWallet(), running = useRef(false);
  const [state, setState] = useState({ busy: false, progress: 0, activity: 'Ready', error: '', pending: null, result: null });

  const applyRecord = useCallback(record => {
    if (!record) return;
    if (record.status === 'success') setState({ busy: false, progress: 100, activity: 'Complete', error: '', pending: null, result: { mint: record.mint, hash: record.imageHash } });
    else setState(current => ({
      ...current,
      busy: false,
      pending: record,
      progress: percent(record),
      result: null,
      error: record.status === 'failed' ? record.errorMessage || 'The inscription paused.' : '',
      activity: record.status === 'failed' ? 'Paused — ready to retry' : 'Inscribing on-chain in the background'
    }));
  }, []);

  const load = useCallback(async address => {
    const { data } = await base44.functions.invoke('publicMintStatus', { walletAddress: address });
    applyRecord(data?.record || data?.latest || null);
  }, [applyRecord]);

  useEffect(() => {
    if (!wallet.address) return;
    load(wallet.address);
    const timer = window.setInterval(() => { if (!running.current) load(wallet.address); }, 5000);
    return () => window.clearInterval(timer);
  }, [wallet.address, load]);

  async function start(values) {
    if (!wallet.address) { await wallet.connect(); return; }
    if (wallet.network !== 'mainnet-beta' || running.current) return;
    running.current = true;
    setState({ busy: true, progress: 0, activity: 'Preparing inscription payment', error: '', pending: null, result: null });
    try {
      if (!values.file || values.file.size < 1 || values.file.size > 1024 * 1024) throw new Error('The image must be 1 MB or smaller.');
      const requestId = crypto.randomUUID(), sessionSecret = randomSecret(), sessionHash = await hash(new TextEncoder().encode(sessionSecret));
      const quote = await base44.functions.invoke('mintInscribedNft', { action: 'publicQuote', walletAddress: wallet.address, requestId, sessionHash, totalSize: values.file.size });
      if (quote.data?.error) throw new Error(quote.data.error);
      const payment = await wallet.provider.signAndSendTransaction(phantomTransaction(quote.data.transaction));
      setState(current => ({ ...current, activity: 'Storing your image for the server' }));
      const upload = await base44.integrations.Core.UploadPrivateFile({ file: values.file });
      if (!upload?.file_uri) throw new Error('The private source image upload did not complete. Please select the image and try again.');
      setState(current => ({ ...current, activity: 'Handing the inscription to our server' }));
      const publicAuth = { walletAddress: wallet.address, paymentSignature: payment.signature, requestId, sessionSecret };
      const response = await base44.functions.invoke('mintInscribedNft', { action: 'startBackground', requestId, name: values.name, symbol: values.symbol, details: values.details, mimeType: values.file.type, totalSize: values.file.size, sourceUri: upload.file_uri, publicAuth });
      if (response.data?.error || !response.data?.job) throw new Error(response.data?.error || 'The inscription could not be queued.');
      applyRecord(response.data.job);
    } catch (error) {
      setState(current => ({ ...current, busy: false, activity: 'Paused', error: error.response?.data?.error || error.message || 'The inscription paused.' }));
    } finally { running.current = false; }
  }

  async function resume() {
    if (!wallet.address || running.current) return;
    running.current = true;
    setState(current => ({ ...current, busy: true, error: '', activity: 'Returning your inscription to the queue' }));
    try {
      const { data } = await base44.functions.invoke('publicMintStatus', { walletAddress: wallet.address, action: 'retry' });
      if (data?.error) throw new Error(data.error);
      applyRecord(data.record);
    } catch (error) {
      setState(current => ({ ...current, busy: false, error: error.response?.data?.error || error.message, activity: 'Paused — ready to retry' }));
    } finally { running.current = false; }
  }

  return { wallet, ...state, start, resume };
}