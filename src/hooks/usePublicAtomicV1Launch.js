import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAtomicV1Wallet } from '@/contexts/AtomicV1WalletContext';
import { hasLaunchMintKey, launchMintKey, removeLaunchMintKey } from '@/lib/launchMintKey';
import { atomicV1Codec } from '@/lib/atomicV1Kit';
import { signAtomicV1 } from '@/lib/atomicV1UserSign';
import { isPhantomRequest } from '@/lib/atomicV1PhantomRequest';
import { clearRecovery, newRecovery, readRecovery, writeRecovery } from '@/lib/atomicV1Recovery';
import { invariant, sha256, solLamports, toBase64 } from '../../base44/shared/atomicV1Protocol.js';
import { preparationAuthorizationBytes } from '../../base44/shared/atomicV1Authorization.js';

const initial = { name: '', symbol: '', description: '', firstBuyAmount: '' };
const emptyLinks = { website: '', twitter: '', github: '' };
const invoke = async payload => (await base44.functions.invoke('publicAtomicV1Launch', payload)).data;
const errorText = reason => reason.response?.data?.error || reason.message || 'Atomic V1 launch failed.';
export default function usePublicAtomicV1Launch() {
  const wallet = useAtomicV1Wallet();
  const [session, setSession] = useState(null), [input, setInput] = useState(initial), [links, setLinks] = useState(emptyLinks);
  const [file, setFile] = useState(null), [imageBase64, setImageBase64] = useState('');
  const [size, setSize] = useState(null), [sizing, setSizing] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [failure, setFailure] = useState(null), [result, setResult] = useState(null), [stage, setStage] = useState('');
  const sessionRef = useRef(null), activeAddress = useRef(wallet.address), lock = useRef(false), sizeRevision = useRef(0);
  const stageRef = useRef(''), mounted = useRef(true), pollingCount = useRef({ key: '', count: 0 });
  activeAddress.current = wallet.address;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function progress(text) { stageRef.current = text; if (mounted.current) setStage(text); }
  function report(reason) {
    const message = errorText(reason);
    setError(message);
    setFailure({ source: reason.source === 'phantom' ? 'Phantom' : 'Application / RPC',
      code: reason.source === 'phantom' ? reason.code : reason.response?.status || reason.status,
      stage: reason.stage || stageRef.current, message });
  }
  function persist(saved) {
    writeRecovery(localStorage, saved);
    if (mounted.current && activeAddress.current === saved.walletAddress) { sessionRef.current = saved; setSession(saved); }
    return saved;
  }
  async function initialize(address) {
    let saved = readRecovery(localStorage, address);
    if (!saved) { saved = newRecovery(address); writeRecovery(localStorage, saved); }
    if (!saved.coinMint) {
      invariant(!saved.preparationRequested, 'The saved launch mint is missing. Preserve the recovery data.');
      const mint = await launchMintKey(saved.requestId);
      saved = { ...saved, coinMint: mint.address }; writeRecovery(localStorage, saved);
    }
    if (!mounted.current || activeAddress.current !== address) return;
    sessionRef.current = saved; setSession(saved); setInput(saved.input || initial); setLinks(saved.socials || emptyLinks);
    setResult(saved.launch || null); setImageBase64(saved.imageBase64 || ''); setSize(saved.prepared?.size || null); setFile(null);
  }
  useEffect(() => {
    sessionRef.current = null; setSession(null); setResult(null); setSize(null); setError(''); setFailure(null);
    if (wallet.address) initialize(wallet.address).catch(reason => report(reason));
  }, [wallet.address]);
  useEffect(() => {
    let cancelled = false;
    if (!file) { if (!sessionRef.current?.preparationRequested) setImageBase64(''); return undefined; }
    setImageBase64(''); setSize(null);
    if (file.size > 7500) { setError('The image exceeds 7,500 bytes. Shrink it before preparing the transaction.'); return undefined; }
    file.arrayBuffer().then(bytes => { if (!cancelled) setImageBase64(toBase64(new Uint8Array(bytes))); })
      .catch(() => { if (!cancelled) setError('Unable to read the image.'); });
    return () => { cancelled = true; };
  }, [file]);
  useEffect(() => {
    const revision = ++sizeRevision.current;
    if (session?.preparationRequested) return undefined;
    setSize(null);
    if (!wallet.method || !imageBase64 || !input.name || !input.symbol || !session?.coinMint) return undefined;
    const timer = setTimeout(async () => {
      setSizing(true);
      try {
        const data = await invoke({ action: 'size', ...input, imageBase64, requestId: session.requestId, walletAddress: wallet.address,
          mintAddress: session.coinMint, walletName: wallet.selected.name, signingMethod: wallet.method,
          signingTransport: wallet.nativeRequest ? 'phantom-request' : 'wallet-standard' });
        if (revision === sizeRevision.current) setSize(data.size);
      } catch (reason) {
        if (revision === sizeRevision.current) { setSize(null); setError(`Size preview: ${errorText(reason)} The launch button will perform a fresh preparation.`); }
      } finally { if (revision === sizeRevision.current) setSizing(false); }
    }, 450);
    return () => { clearTimeout(timer); sizeRevision.current++; setSizing(false); };
  }, [input, imageBase64, wallet.address, wallet.method, wallet.nativeRequest, session?.coinMint, session?.preparationRequested]);
  async function guarded(task) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setFailure(null);
    try {
      if (globalThis.navigator?.locks && wallet.address) {
        await navigator.locks.request(`spunk:atomic-v1:${wallet.address}`, { ifAvailable: true }, async lease => {
          invariant(lease, 'This wallet already has an atomic launch action open in another tab. Return to that tab.');
          const saved = readRecovery(localStorage, wallet.address);
          if (saved && sessionRef.current && saved.requestId === sessionRef.current.requestId) sessionRef.current = saved;
          else invariant(!saved || !sessionRef.current || saved.requestId === sessionRef.current.requestId,
            'Another tab replaced the saved draft. Reload before requesting approval.');
          await task();
        });
      } else await task();
    } catch (reason) { if (mounted.current) report(reason); }
    finally { lock.current = false; if (mounted.current) { setBusy(false); setStage(''); } }
  }
  function auth(saved, action) { return { action, id: saved.id, submitToken: saved.submitToken }; }
  function receive(saved, data) {
    const next = persist({ ...saved, id: data.launch?.id || saved.id, prepared: data.prepared || saved.prepared, launch: data.launch || saved.launch });
    if (activeAddress.current === next.walletAddress && mounted.current) { setResult(data.launch || null); setSize(data.size || next.prepared?.size || null); }
    if (data.launch?.status === 'confirmed' && data.launch.atomicV1Verified) {
      removeLaunchMintKey(next.requestId); clearRecovery(localStorage, next.walletAddress);
      const completed = { ...next, completed: true, submitToken: '', signedTransactionBase64: '' };
      if (activeAddress.current === next.walletAddress && mounted.current) { sessionRef.current = completed; setSession(completed); }
      return completed;
    }
    return next;
  }
  async function mintAuthorization(saved) {
    invariant(hasLaunchMintKey(saved.requestId), 'The original mint key is missing. Preserve this launch instead of generating a replacement.');
    const mint = await launchMintKey(saved.requestId);
    invariant(mint.address === saved.coinMint, 'The saved mint key does not match the launch.');
    return toBase64(await mint.sign(preparationAuthorizationBytes({ ...saved.input, ...saved, socials: saved.socials })));
  }
  async function prepareSaved(saved) {
    progress('Preparing the complete V1 transaction and image.');
    const proof = await mintAuthorization(saved);
    const data = await invoke({ action: 'prepare', ...saved.input, requestId: saved.requestId, submitToken: saved.submitToken,
      walletAddress: saved.walletAddress, mintAddress: saved.coinMint, walletName: saved.walletName, signingMethod: saved.signingMethod,
      signingTransport: saved.signingTransport || 'wallet-standard', mintAuthorization: proof,
      imageBase64: saved.imageBase64, imageUrl: saved.imageUrl, socials: saved.socials });
    return receive(saved, data);
  }
  async function status(saved) {
    if (saved.walletSent && saved.transactionSignature && !saved.launch?.transactionSignature) {
      return invoke({ ...auth(saved, 'register'), transactionSignature: saved.transactionSignature });
    }
    return invoke(auth(saved, 'resume'));
  }
  async function continueSaved(saved, snapshot) {
    invariant(snapshot.wallet && snapshot.account?.address === saved.walletAddress && snapshot.isCurrent(), 'Connect the original launch wallet.');
    if (!saved.id) saved = await prepareSaved(saved);
    else saved = receive(saved, await status(saved));
    if (saved.completed) return;
    if (saved.launch.status === 'expired') {
      progress('Refreshing the expired message for the same mint.');
      const data = await invoke(auth(saved, 'refresh'));
      saved = receive({ ...saved, signedTransactionBase64: '', transactionSignature: '', broadcastStarted: false, walletSent: false }, data);
    }
    if (isPhantomRequest(snapshot.wallet) && saved.launch.status === 'prepared' &&
        (saved.prepared.signingTransport !== 'phantom-request' || !saved.launch.metadataAuthorized)) {
      const data = await invoke({ ...auth(saved, 'native-route'), mintAuthorization: await mintAuthorization(saved) });
      saved = receive({ ...saved, walletName: 'Phantom', signingMethod: 'signTransaction', signingTransport: 'phantom-request' }, data);
    }
    if (saved.signedTransactionBase64 && ['prepared', 'unknown', 'pending', 'submitting'].includes(saved.launch.status)) {
      progress('Submitting the previously approved transaction unchanged.');
      receive(saved, await invoke({ ...auth(saved, 'submit'), signedTransactionBase64: saved.signedTransactionBase64 })); return;
    }
    invariant(!saved.broadcastStarted && saved.launch.status === 'prepared', 'An existing submission must be checked before requesting another approval.');
    invariant(hasLaunchMintKey(saved.requestId), 'The original mint key is missing. Do not generate a replacement.');
    const mint = await launchMintKey(saved.requestId);
    invariant(mint.address === saved.coinMint, 'Saved mint key mismatch.');
    const output = await signAtomicV1({ ...snapshot, prepared: saved.prepared, mint, codec: atomicV1Codec, onStage: progress,
      intent: { ...saved.input, walletAddress: saved.walletAddress, coinMint: saved.coinMint, imageSha256: saved.imageSha256, imageByteLength: saved.imageByteLength },
      assertFresh: async prepared => {
        const fresh = await invoke({ ...auth(saved, 'preflight'), messageHash: prepared.messageHash });
        invariant(fresh.fresh && fresh.messageHash === prepared.messageHash, 'The prepared message is no longer current.');
      },
      persistSigned: async signed => { saved = persist({ ...saved, ...signed }); },
      beforeWalletSend: async () => {
        const armed = await invoke(auth(saved, 'arm'));
        saved = receive(saved, armed);
        saved = persist({ ...saved, broadcastStarted: true });
      },
    });
    saved = persist({ ...saved, ...output });
    progress('Submitting and checking the approved transaction.');
    receive(saved, await invoke(output.walletSent ? { ...auth(saved, 'register'), transactionSignature: output.transactionSignature }
      : { ...auth(saved, 'submit'), signedTransactionBase64: output.signedTransactionBase64 }));
  }
  async function launch(event) {
    event?.preventDefault();
    return guarded(async () => {
      const snapshot = wallet.capture();
      invariant(wallet.canLaunch && sessionRef.current, 'Connect Phantom using the native request button.');
      let saved = sessionRef.current;
      if (!saved.preparationRequested) {
        invariant(file && file.size > 0 && file.size <= 7500, 'Select a complete image of 7,500 bytes or less.');
        const bytes = new Uint8Array(await file.arrayBuffer());
        const normalized = { name: input.name.trim(), symbol: input.symbol.trim().toUpperCase(), description: input.description.trim(),
          firstBuyAmount: solLamports(input.firstBuyAmount) === 0n ? '' : input.firstBuyAmount };
        saved = persist({ ...saved, input: normalized, socials: links, imageBase64: toBase64(bytes), imageSha256: await sha256(bytes), imageByteLength: bytes.length,
          walletName: snapshot.wallet.name, signingMethod: snapshot.method,
          signingTransport: isPhantomRequest(snapshot.wallet) ? 'phantom-request' : 'wallet-standard' });
        progress('Uploading the exact image for metadata.');
        const core = /** @type {{UploadPublicFile?: (args: {file: File}) => Promise<{file_url: string}>}} */ (base44.integrations.Core);
        invariant(typeof core.UploadPublicFile === 'function', 'The Base44 public file-upload integration is unavailable.');
        const uploaded = await core.UploadPublicFile({ file });
        invariant(snapshot.isCurrent(), 'Wallet changed before preparation.');
        saved = persist({ ...saved, imageUrl: uploaded.file_url, preparationRequested: true });
      }
      await continueSaved(saved, snapshot);
    });
  }
  const check = () => guarded(async () => {
    const saved = sessionRef.current;
    invariant(saved?.id && !saved.completed, 'No pending saved launch.');
    progress('Checking the saved transaction.'); receive(saved, await status(saved));
  });
  // Bounded polling only reads/reconciles. It never signs, sends or refreshes.
  useEffect(() => {
    if (!session?.id || session.completed || busy || !['pending', 'unknown', 'submitting'].includes(result?.status)) return undefined;
    const key = `${session.id}:${session.prepared?.messageHash}`;
    if (pollingCount.current.key !== key) pollingCount.current = { key, count: 0 };
    let cancelled = false, timer;
    const poll = async () => {
      const saved = sessionRef.current;
      if (cancelled || !saved?.id || saved.id !== session.id || saved.completed || pollingCount.current.count >= 40) return;
      pollingCount.current.count++;
      try {
        const data = await status(saved);
        if (!cancelled && activeAddress.current === saved.walletAddress) receive(saved, data);
      } catch { /* A transient read failure is not a failed transaction. */ }
      if (!cancelled && pollingCount.current.count < 40) timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [session?.id, session?.prepared?.messageHash, session?.completed, result?.status, busy, wallet.address]);
  const refresh = () => guarded(async () => {
    const saved = sessionRef.current;
    const data = await invoke(auth(saved, 'refresh'));
    receive({ ...saved, signedTransactionBase64: '', transactionSignature: '', broadcastStarted: false, walletSent: false }, data);
  });
  const retry = () => guarded(async () => {
    const saved = sessionRef.current; receive(saved, await invoke(auth(saved, 'retry')));
  });
  const reset = () => guarded(async () => {
    const saved = sessionRef.current;
    invariant(saved && (saved.completed || (!saved.broadcastStarted && !saved.signedTransactionBase64 &&
      !saved.launch?.transactionSignature && !['submitting', 'unknown', 'pending'].includes(saved.launch?.status))),
      'Keep the recovery record until the submitted transaction is resolved.');
    removeLaunchMintKey(saved.requestId); clearRecovery(localStorage, saved.walletAddress);
    setFile(null); setInput(initial); setLinks(emptyLinks); setImageBase64(''); setResult(null); setSize(null);
    await initialize(saved.walletAddress);
  });
  return { wallet, session, input, setInput, file, setFile, size, sizing, busy, error, failure, result, stage, launch, check, refresh, retry, reset,
    links, setLink: (key, value) => setLinks(current => ({ ...current, [key]: value })) };
}
