import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAtomicV1Wallet } from '@/contexts/AtomicV1WalletContext';
import { hasLaunchMintKey, launchMintKey, removeLaunchMintKey } from '@/lib/launchMintKey';
import { atomicV1Codec } from '@/lib/atomicV1Kit';
import { signAtomicV1 } from '@/lib/atomicV1UserSign';
import { isPhantomRequest } from '@/lib/atomicV1PhantomRequest';
import { clearRecovery, readRecovery, writeRecovery } from '@/lib/atomicV1Recovery';
import { createLaunchSessionLoader } from '@/lib/atomicV1LaunchSession';
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
  const sessionRef = useRef(null), lock = useRef(false), sizeRevision = useRef(0);
  const sessionLoader = useRef(null), hydrationRevision = useRef(0);
  if (!sessionLoader.current) sessionLoader.current = createLaunchSessionLoader(localStorage, launchMintKey);
  const stageRef = useRef(''), mounted = useRef(true), pollingCount = useRef({ key: '', count: 0 });
  const isActive = address => mounted.current && wallet.capture().account?.address === address;
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
    if (isActive(saved.walletAddress)) { sessionRef.current = saved; setSession(saved); }
    return saved;
  }
  function adoptSession(saved, restorePrepared = true) {
    if (!isActive(saved.walletAddress)) return;
    sessionRef.current = saved; setSession(saved); setResult(saved.launch || null); setSize(saved.prepared?.size || null);
    // A new connection must not erase a File or details entered before Connect.
    // Frozen recovery is different: present its original details before approval.
    if (restorePrepared && saved.preparationRequested) {
      setInput(saved.input || initial); setLinks(saved.socials || emptyLinks);
      setImageBase64(saved.imageBase64 || ''); setFile(null);
    }
  }
  async function initialize(address) {
    const revision = ++hydrationRevision.current;
    const saved = await sessionLoader.current(address);
    if (revision === hydrationRevision.current && !lock.current) adoptSession(saved);
    return saved;
  }
  useEffect(() => {
    if (lock.current) return; // Submit owns initialization during connect -> prepare -> sign.
    if (sessionRef.current?.walletAddress === wallet.address) return;
    sessionRef.current = null; setSession(null); setResult(null); setSize(null);
    const revision = ++hydrationRevision.current;
    if (wallet.address) {
      sessionLoader.current(wallet.address).then(saved => {
        if (revision === hydrationRevision.current && !lock.current) adoptSession(saved);
      }).catch(reason => { if (revision === hydrationRevision.current && isActive(wallet.address)) report(reason); });
    }
    return () => { hydrationRevision.current++; };
  }, [wallet.address, busy]);
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
    if (busy || session?.preparationRequested) return undefined;
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
  }, [input, imageBase64, wallet.address, wallet.method, wallet.nativeRequest, session?.coinMint, session?.preparationRequested, busy]);
  async function guarded(task, connectForLaunch = false) {
    if (lock.current) return;
    lock.current = true; hydrationRevision.current++; setBusy(true); setError(''); setFailure(null);
    try {
      // Invoke connect on the click stack, BEFORE a Web Lock callback, RPC, or
      // file read. Use the resolved snapshot, not the pre-connect React closure.
      if (connectForLaunch) progress('Connecting to Phantom for this launch.');
      const snapshot = connectForLaunch ? await wallet.ensureLaunchWallet() : wallet.capture();
      const address = snapshot.account?.address;
      const run = async () => {
        if (connectForLaunch) invariant(snapshot.isCurrent(), 'The connected wallet changed before preparation.');
        const saved = address ? readRecovery(localStorage, address) : null;
        const current = sessionRef.current;
        if (saved && current?.walletAddress === address) {
          invariant(saved.requestId === current.requestId, 'Another tab changed the saved launch. Reload its recovery record.');
          sessionRef.current = saved;
        }
        await task(snapshot);
      };
      if (globalThis.navigator?.locks && address) {
        await navigator.locks.request(`spunk:atomic-v1:${address}`, { ifAvailable: true }, async lease => {
          invariant(lease, 'This wallet already has an atomic launch action open in another tab. Return to that tab.');
          await run();
        });
      } else await run();
    } catch (reason) { if (mounted.current) report(reason); }
    finally { lock.current = false; if (mounted.current) { setBusy(false); setStage(''); } }
  }
  function auth(saved, action) { return { action, id: saved.id, submitToken: saved.submitToken }; }
  function receive(saved, data) {
    const next = persist({ ...saved, id: data.launch?.id || saved.id, prepared: data.prepared || saved.prepared, launch: data.launch || saved.launch });
    if (isActive(next.walletAddress)) { setResult(data.launch || null); setSize(data.size || next.prepared?.size || null); }
    if (data.launch?.status === 'confirmed' && data.launch.atomicV1Verified) {
      removeLaunchMintKey(next.requestId); clearRecovery(localStorage, next.walletAddress);
      const completed = { ...next, completed: true, submitToken: '', signedTransactionBase64: '' };
      if (isActive(next.walletAddress)) { sessionRef.current = completed; setSession(completed); }
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
    // Capture the user's submitted intent before connecting can re-render the form.
    const submitted = { input: { ...input }, links: { ...links }, file };
    const displayed = sessionRef.current;
    return guarded(async snapshot => {
      const address = snapshot.account.address;
      invariant(!displayed?.preparationRequested || displayed.walletAddress === address,
        'This saved launch belongs to a different wallet. Reconnect its original payer.');
      let saved = await sessionLoader.current(address);
      invariant(snapshot.isCurrent(), 'The wallet changed while initializing the launch.');
      adoptSession(saved, false);
      // Do not silently sign an undisplayed old preparation instead of the form.
      if (saved.preparationRequested && displayed?.requestId !== saved.requestId) {
        adoptSession(saved); return;
      }
      if (!saved.preparationRequested) {
        const selectedFile = submitted.file;
        invariant(selectedFile && selectedFile.size > 0 && selectedFile.size <= 7500, 'Select a complete image of 7,500 bytes or less.');
        const bytes = new Uint8Array(await selectedFile.arrayBuffer());
        invariant(snapshot.isCurrent(), 'The wallet changed while reading the image.');
        const normalized = { name: submitted.input.name.trim(), symbol: submitted.input.symbol.trim().toUpperCase(),
          description: submitted.input.description.trim(),
          firstBuyAmount: solLamports(submitted.input.firstBuyAmount) === 0n ? '' : submitted.input.firstBuyAmount };
        saved = persist({ ...saved, input: normalized, socials: submitted.links, imageBase64: toBase64(bytes), imageSha256: await sha256(bytes), imageByteLength: bytes.length,
          walletName: snapshot.wallet.name, signingMethod: snapshot.method,
          signingTransport: isPhantomRequest(snapshot.wallet) ? 'phantom-request' : 'wallet-standard' });
        progress('Uploading the exact image for metadata.');
        const core = /** @type {{UploadPublicFile?: (args: {file: File}) => Promise<{file_url: string}>}} */ (base44.integrations.Core);
        invariant(typeof core.UploadPublicFile === 'function', 'The Base44 public file-upload integration is unavailable.');
        const uploaded = await core.UploadPublicFile({ file: selectedFile });
        invariant(snapshot.isCurrent(), 'Wallet changed before preparation.');
        saved = persist({ ...saved, imageUrl: uploaded.file_url, preparationRequested: true });
      }
      await continueSaved(saved, snapshot);
    }, true);
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
        if (!cancelled && isActive(saved.walletAddress)) receive(saved, data);
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
    adoptSession(await initialize(saved.walletAddress));
  });
  return { wallet, session, input, setInput, file, setFile, size, sizing, busy, error, failure, result, stage, launch, check, refresh, retry, reset,
    links, setLink: (key, value) => setLinks(current => ({ ...current, [key]: value })) };
}
