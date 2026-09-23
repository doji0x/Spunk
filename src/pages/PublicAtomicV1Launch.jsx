import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import AtomicV1Hero from '@/components/atomic/AtomicV1Hero';
import AtomicV1Form from '@/components/atomic/AtomicV1Form';
import AtomicV1Result from '@/components/atomic/AtomicV1Result';
import AtomicV1WalletSelector from '@/components/atomic/AtomicV1WalletSelector';
import usePublicAtomicV1Launch from '@/hooks/usePublicAtomicV1Launch';

export default function PublicAtomicV1Launch() {
  const state = usePublicAtomicV1Launch();
  const { wallet, session, result, busy, error, stage } = state;
  const saved = session?.preparationRequested && !session.completed;
  const canDiscard = session && (session.completed || (!session.broadcastStarted && !session.signedTransactionBase64 && !result?.transactionSignature));
  return <div className="validate-surface min-h-screen text-foreground">
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl"><div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
      <Link to="/" aria-label="Back home" className="rounded-full p-2 hover:bg-card"><ArrowLeft size={19} /></Link>
      <div className="flex-1 min-w-0"><p className="font-mono text-[9px] tracking-[0.25em] text-primary">MAINNET / SOL</p><h1 className="truncate font-display font-semibold">Atomic V1 Image Launch</h1></div>
      <Link to="/atomic-v1/history" className="shrink-0 text-xs text-primary">My launches</Link>
    </div></header>
    <main className="mx-auto max-w-2xl space-y-7 px-4 py-9 pb-24 sm:px-6">
      <AtomicV1Hero enabled={wallet.config.enabled} />
      <AtomicV1WalletSelector disabled={busy} />
      <p className="text-sm text-muted-foreground">Coin creation and the complete image stay in one V1 transaction. Your wallet pays rent and fees; the browser signs only with the separate mint key. No wallet private key or Jupiter API key is requested.</p>
      {!saved && !session?.completed && <>
        <p className="text-xs text-muted-foreground">Budget a 0.03 SOL rent/fee reserve plus your optional first buy. This reserve is not an exact fee quote. Priority fee is capped at 5,000 lamports. Review the native wallet approval before confirming.</p>
        {!wallet.method && <p className="text-sm text-muted-foreground">Connect a wallet with native V1 signing above, then complete the coin details and image size check to enable launch.</p>}
        <AtomicV1Form state={state} allowFirstBuy={wallet.config.firstBuyEnabled} launchDisabled={wallet.configLoading || !wallet.config.enabled || !wallet.method || !session} />
      </>}
      {saved && <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold">Saved launch: {session.input?.name}</h2>
        <p className="break-all text-xs text-muted-foreground">Mint: {session.coinMint}</p>
        <p className="text-sm">The launch inputs are frozen. Keep this browser's recovery data until the transaction is resolved.</p>
        {session.imageBase64 && <img src={`data:${result?.imageMime || 'image/png'};base64,${session.imageBase64}`} alt="Saved inscription" className="h-24 w-24 rounded-lg object-contain" />}
        <p className="text-xs text-muted-foreground">First-buy maximum: {session.input?.firstBuyAmount || '0'} SOL. Signed transaction: {state.size?.finalSerializedTransactionBytes ?? 'not prepared'} bytes.</p>
        <div className="flex flex-wrap gap-4 text-sm text-primary">
          {wallet.method && (!result || result.status === 'prepared') && !session.broadcastStarted && <button type="button" disabled={busy} onClick={state.launch}>Continue saved launch</button>}
          {session.id && <button type="button" disabled={busy} onClick={state.check}>Check transaction</button>}
          {wallet.method && session.signingMethod === 'signTransaction' && ['unknown', 'pending', 'submitting'].includes(result?.status) && <button type="button" disabled={busy} onClick={state.retry}>Rebroadcast identical bytes</button>}
          {wallet.method && result?.status === 'expired' && <button type="button" disabled={busy} onClick={state.refresh}>Prepare fresh approval for this mint</button>}
        </div>
      </section>}
      {stage && <p role="status" className="text-sm">{stage}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AtomicV1Result result={result} onCheck={state.check} busy={busy} linksTo="" />
      {canDiscard && (saved || session.completed) && <button type="button" disabled={busy} onClick={state.reset} className="text-sm text-primary underline">{session.completed ? 'Start a new launch' : 'Discard unsigned draft'}</button>}
    </main>
  </div>;
}