import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAtomicV1Wallet } from '@/contexts/AtomicV1WalletContext';
import { hasLaunchMintKey, launchMintKey, removeLaunchMintKey } from '@/lib/launchMintKey';
import { atomicV1Codec } from '@/lib/atomicV1Kit';
import { signAtomicV1 } from '@/lib/atomicV1UserSign';
import { clearRecovery, newRecovery, readRecovery, writeRecovery } from '@/lib/atomicV1Recovery';
import { fromBase64, invariant, sha256, solLamports, toBase64 } from '../../base44/shared/atomicV1Protocol.js';

const initial = { name: '', symbol: '', description: '', firstBuyAmount: '' };
const emptyLinks = { website: '', twitter: '', github: '' };
const invoke = async payload => (await base44.functions.invoke('publicAtomicV1Launch', payload)).data;
const errorText = reason => reason.response?.data?.error || reason.message || 'Atomic V1 launch failed.';
export default function usePublicAtomicV1Launch() {
  const wallet = useAtomicV1Wallet();
  const [session, setSession] = useState(null), [input, setInput] = useState(initial), [links, setLinks] = useState(emptyLinks);
  const [file, setFile] = useState(null), [imageBase64, setImageBase64] = useState('');
  const [size, setSize] = useState(null), [sizing, setSizing] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [result, setResult] = useState(null), [stage, setStage] = useState('');
  const sessionRef = useRef(null), activeAddress = useRef(wallet.address), lock = useRef(false), sizeRevision = useRef(0);
  activeAddress.current = wallet.address;
  function persist(saved) {
    writeRecovery(localStorage, saved);
    if (activeAddress.current === saved.walletAddress) { sessionRef.current = saved; setSession(saved); }
    return saved;
  }
  async function initialize(address) {
    let saved = readRecovery(localStorage, address);
    if (!saved) {
      saved = newRecovery(address);
      writeRecovery(localStorage, saved);
    }
    if (!saved.coinMint) {
      invariant(!saved.preparationRequested, 'The saved launch mint is missing. Preserve the recovery data.');
      const mint = await launchMintKey(saved.requestId);
      saved = { ...saved, coinMint: mint.address };
      writeRecovery(localStorage, saved);
    }
    if (activeAddress.current !== address) return;
    sessionRef.current = saved; setSession(saved); setInput(saved.input || initial); setLinks(saved.socials || emptyLinks);
    setResult(saved.launch || null); setImageBase64(saved.imageBase64 || ''); setSize(saved.prepared?.size || null); setFile(null);
  }
  useEffect(() => {
    sessionRef.current = null; setSession(null); setResult(null); setSize(null); setError('');
    if (wallet.address) initialize(wallet.address).catch(reason => setError(errorText(reason)));
  }, [wallet.address]);
  useEffect(() => {
    let cancelled = false;
    if (!file) { if (!sessionRef.current?.preparationRequested) setImageBase64(''); return undefined; }
    if (file.size > 7500) { setError('The selected file exceeds 7,500 bytes; shrink it before calculating the V1 transaction size.'); setImageBase64(''); return undefined; }
    file.arrayBuffer().then(bytes => { if (!cancelled) setImageBase64(toBase64(new Uint8Array(bytes))); }).catch(() => { if (!cancelled) setError('Unable to read the image.'); });
    return () => { cancelled = true; };
  }, [file]);
  useEffect(() => {
    const revision = ++sizeRevision.current;
    if (session?.preparationRequested) return undefined;
    setSize(null);
    if (!wallet.method || !imageBase64 || !input.name || !input.symbol || !session?.coinMint) return undefined;
    const timer = setTimeout(async () => {
      setSizing(true); setError('');
      try {
        const data = await invoke({ action: 'size', ...input, imageBase64, requestId: session.requestId, walletAddress: wallet.address,
          mintAddress: session.coinMint, walletName: wallet.selected.name, signingMethod: wallet.method });
        if (revision === sizeRevision.current) setSize(data.size);
      } catch (reason) { if (revision === sizeRevision.current) { setSize(null); setError(errorText(reason)); } }
      finally { if (revision === sizeRevision.current) setSizing(false); }
    }, 450);
    return () => { clearTimeout(timer); sizeRevision.current++; setSizing(false); };
  }, [input, imageBase64, wallet.address, wallet.method, session?.coinMint, session?.preparationRequested]);
  async function guarded(task) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await task(); } catch (reason) { setError(errorText(reason)); }
    finally { lock.current = false; setBusy(false); setStage(''); }
  }
  function auth(saved, action) { return { action, id: saved.id, submitToken: saved.submitToken }; }
  function receive(saved, data) {
    const next = persist({ ...saved, id: data.launch?.id || saved.id, prepared: data.prepared || saved.prepared, launch: data.launch || saved.launch });
    if (activeAddress.current === next.walletAddress) { setResult(data.launch || null); setSize(data.size || next.prepared?.size || null); }
    if (data.launch?.status === 'confirmed' && data.launch.atomicV1Verified) {
      removeLaunchMintKey(next.requestId); clearRecovery(localStorage, next.walletAddress);
      const completed = { ...next, completed: true, submitToken: '', signedTransactionBase64: '' };
      if (activeAddress.current === next.walletAddress) { sessionRef.current = completed; setSession(completed); }
      return completed;
    }
    return next;
  }
  async function prepareSaved(saved) {
    const data = await invoke({ action: 'prepare', ...saved.input, requestId: saved.requestId, submitToken: saved.submitToken,
      walletAddress: saved.walletAddress, mintAddress: saved.coinMint, walletName: saved.walletName, signingMethod: saved.signingMethod,
      imageBase64: saved.imageBase64, imageUrl: saved.imageUrl, socials: saved.socials });
    return receive(saved, data);
  }
  async function continueSaved(saved, snapshot) {
    invariant(snapshot.wallet && snapshot.account?.address === saved.walletAddress && snapshot.isCurrent(), 'Connect the original launch wallet.');
    if (!saved.id) saved = await prepareSaved(saved);
    else saved = receive(saved, await invoke(auth(saved, 'resume')));
    if (saved.completed) return;
    if (saved.signedTransactionBase64 && ['prepared', 'unknown', 'pending', 'submitting'].includes(saved.launch.status)) {
      receive(saved, await invoke({ ...auth(saved, 'submit'), signedTransactionBase64: saved.signedTransactionBase64 })); return;
    }
    invariant(!saved.broadcastStarted && saved.launch.status === 'prepared', 'Check the existing submission or refresh it after finalized expiry. No second wallet submission was requested.');
    invariant(hasLaunchMintKey(saved.requestId), 'The original mint key is missing. Do not generate a replacement for this saved launch.');
    const mint = await launchMintKey(saved.requestId);
    invariant(mint.address === saved.coinMint, 'Saved mint key mismatch.');
    setStage('Review the native wallet transaction approval.');
    const output = await signAtomicV1({ ...snapshot, prepared: saved.prepared, mint, codec: atomicV1Codec,
      intent: { ...saved.input, walletAddress: saved.walletAddress, coinMint: saved.coinMint, imageSha256: saved.imageSha256, imageByteLength: saved.imageByteLength },
      assertFresh: async prepared => { const fresh = await invoke({ ...auth(saved, 'preflight'), messageHash: prepared.messageHash }); invariant(fresh.fresh && fresh.messageHash === prepared.messageHash, 'The prepared message is no longer current.'); },
      persistSigned: async signed => { saved = persist({ ...saved, ...signed }); },
      beforeWalletSend: async () => {
        saved = persist({ ...saved, broadcastStarted: true });
        const armed = await invoke(auth(saved, 'arm')); saved = receive(saved, armed);
      },
    });
    saved = persist({ ...saved, ...output });
    setStage('Checking the saved transaction on Solana.');
    receive(saved, await invoke(output.walletSent ? { ...auth(saved, 'register'), transactionSignature: output.transactionSignature }
      : { ...auth(saved, 'submit'), signedTransactionBase64: output.signedTransactionBase64 }));
  }
  async function launch(event) {
    event?.preventDefault();
    return guarded(async () => {
      const snapshot = wallet.capture();
      invariant(wallet.method && wallet.config.enabled && sessionRef.current, 'Select an enabled V1-capable wallet.');
      let saved = sessionRef.current;
      if (!saved.preparationRequested) {
        invariant(file && size?.remainingBytes >= 0 && imageBase64, 'Select a fitting image and wait for the size check.');
        const bytes = fromBase64(imageBase64, 7500);
        const normalized = { name: input.name.trim(), symbol: input.symbol.trim().toUpperCase(), description: input.description.trim(),
          firstBuyAmount: solLamports(input.firstBuyAmount) === 0n ? '' : input.firstBuyAmount };
        saved = persist({ ...saved, input: normalized, socials: links, imageBase64, imageSha256: await sha256(bytes), imageByteLength: bytes.length,
          walletName: snapshot.wallet.name, signingMethod: snapshot.method });
        setStage('Uploading the public image.');
        const uploaded = await base44.integrations.Core.UploadPublicFile({ file });
        invariant(snapshot.isCurrent(), 'Wallet changed before preparation.');
        saved = persist({ ...saved, imageUrl: uploaded.file_url, preparationRequested: true });
      }
      await continueSaved(saved, snapshot);
    });
  }
  const check = () => guarded(async () => {
    const saved = sessionRef.current;
    invariant(saved?.id && !saved.completed, 'No pending saved launch.');
    receive(saved, await invoke(saved.walletSent && saved.transactionSignature
      ? { ...auth(saved, 'register'), transactionSignature: saved.transactionSignature } : auth(saved, 'resume')));
  });
  const refresh = () => guarded(async () => {
    let saved = sessionRef.current;
    const data = await invoke(auth(saved, 'refresh'));
    saved = { ...saved, signedTransactionBase64: '', transactionSignature: '', broadcastStarted: false, walletSent: false };
    receive(saved, data);
  });
  const retry = () => guarded(async () => { const saved = sessionRef.current; receive(saved, await invoke(auth(saved, 'retry'))); });
  const reset = () => guarded(async () => {
    const saved = sessionRef.current;
    invariant(saved && (saved.completed || (!saved.broadcastStarted && !saved.signedTransactionBase64 && !saved.launch?.transactionSignature)),
      'Keep the recovery record until the submitted transaction is resolved.');
    removeLaunchMintKey(saved.requestId); clearRecovery(localStorage, saved.walletAddress);
    setFile(null); setInput(initial); setLinks(emptyLinks); setImageBase64(''); setResult(null); setSize(null);
    await initialize(saved.walletAddress);
  });
  return { wallet, session, input, setInput, file, setFile, size, sizing, busy, error, result, stage, launch, check, refresh, retry, reset,
    links, setLink: (key, value) => setLinks(current => ({ ...current, [key]: value })) };
}
