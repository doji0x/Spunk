import React, { useEffect, useRef } from 'react';

/** A distinct user action, never a hidden consent flag or a login prompt. */
export default function AtomicV1MessageReview({ review, onDecision }) {
  const cancelButton = useRef(null);
  const decision = useRef(onDecision);
  decision.current = onDecision;
  useEffect(() => {
    if (!review) return undefined;
    const previous = document.activeElement;
    cancelButton.current?.focus();
    const escape = event => { if (event.key === 'Escape') decision.current(false); };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('keydown', escape); previous?.focus?.(); };
  }, [review]);
  if (!review) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="atomic-message-title"
      className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-primary bg-background p-5 text-foreground">
      <h2 id="atomic-message-title" className="text-lg font-semibold">Experimental transaction authorization</h2>
      <p className="mt-3 text-sm"><strong>This is not a login or harmless ownership check.</strong> Approving the next Phantom message request authorizes this coin creation, its image inscription, rent and network fees, and the first buy below. A verified signature will be submitted as a Solana transaction.</p>
      <p className="mt-3 text-sm">Phantom may show binary/hex data instead of its normal transaction preview. It may also reject transaction bytes passed to signMessage. That rejection will stop this attempt; no alternative signing request will be tried.</p>
      <dl className="mt-4 space-y-2 break-all text-xs">
        <dt className="font-semibold">Coin</dt><dd>{review.name} ({review.symbol})</dd>
        <dt className="font-semibold">Payer / creator</dt><dd>{review.payerAddress}</dd>
        <dt className="font-semibold">Mint</dt><dd>{review.mintAddress}</dd>
        <dt className="font-semibold">First-buy maximum</dt><dd>{review.firstBuySol} SOL, plus rent and network fees</dd>
        <dt className="font-semibold">Priority fee cap</dt><dd>{review.priorityFeeLamports} lamports (not the total transaction cost)</dd>
        <dt className="font-semibold">Image / message / full transaction</dt><dd>{review.imageByteLength} / {review.messageBytes} / {review.transactionBytes} bytes</dd>
        <dt className="font-semibold">Image SHA-256</dt><dd>{review.imageSha256}</dd>
        <dt className="font-semibold">Exact message SHA-256</dt><dd>{review.messageHash}</dd>
        <dt className="font-semibold">Metadata URI</dt><dd>{review.metadataUri}</dd>
        <dt className="font-semibold">Last valid block height</dt><dd>{review.lastValidBlockHeight}</dd>
      </dl>
      <p className="mt-4 text-xs text-muted-foreground">This summary describes the validated transaction. Only its exact raw message bytes are signed; this warning and the displayed hash are not substituted for those bytes.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button ref={cancelButton} type="button" onClick={() => onDecision(false)} className="rounded-full border border-border px-4 py-3">Cancel</button>
        <button type="button" onClick={() => onDecision(true)} className="rounded-full bg-primary px-4 py-3 font-semibold text-primary-foreground">Authorize this transaction and open Phantom</button>
      </div>
    </section>
  </div>;
}
