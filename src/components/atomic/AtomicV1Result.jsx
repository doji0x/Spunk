import React from 'react';
import { Link } from 'react-router-dom';
const labels = { prepared: 'Ready for wallet approval', submitting: 'Submission started', unknown: 'Submission outcome uncertain',
  pending: 'Waiting for finalization', expired: 'Approval expired without a verified launch', failed: 'Transaction failed', incomplete: 'Launch needs investigation' };
export default function AtomicV1Result({ result, onCheck, busy, linksTo = '/admin/links', walletFailure = false }) {
  if (!result) return null;
  const verified = result.atomicV1Verified;
  const checkable = ['submitting', 'unknown', 'pending', 'prepared', 'incomplete'].includes(result.status);
  return <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
    <h2 className="text-lg font-semibold">{verified ? 'Atomic V1 verified' : (walletFailure && result.status === 'prepared' ? 'Wallet request failed - transaction remains prepared' : labels[result.status]) || 'Launch not verified'}</h2>
    <p className="text-sm text-muted-foreground">{verified ? 'Coin creation and the exact image commitment were independently checked.' : result.error || 'Check the saved launch before attempting another transaction.'}</p>
    <dl className="space-y-2 break-all font-mono text-xs"><dt>Coin mint</dt><dd>{result.coinMint}</dd>
      {result.transactionSignature && <><dt>Transaction signature</dt><dd>{result.transactionSignature}</dd></>}
      <dt>Image / transaction bytes</dt><dd>{result.imageByteLength} / {result.serializedTransactionBytes} (V{result.transactionVersion})</dd>
    </dl>
    <div className="flex flex-wrap gap-4 text-xs text-primary">
      {result.transactionSignature && <a href={`https://explorer.solana.com/tx/${result.transactionSignature}`} target="_blank" rel="noreferrer">View transaction</a>}
      {checkable && <button type="button" disabled={busy} onClick={onCheck}>Check status</button>}
      {linksTo && <Link to={`${linksTo}?coin=${result.coinMint}`}>Edit links</Link>}
    </div>
  </section>;
}
