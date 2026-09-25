import { rpcRequest } from './mintWallet.ts';
import { isLaunched } from './pumpLaunch.ts';

export function publicAttempt({ submitToken, preparedTransaction, ...attempt }) { return attempt; }
export async function checkPublicLaunch(base44, rpcUrl, body) {
  const requestId = String(body.requestId || ''), walletAddress = String(body.walletAddress || '');
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) throw new Error('Invalid saved launch.');
  const attempts = base44.asServiceRole.entities.PublicLaunchAttempt;
  const [row] = await attempts.filter({ requestId, walletAddress });
  if (!row) return { attempt: null };
  let status = 'pending';
  if (await isLaunched(rpcUrl, row.coinMint, row.bondingCurve)) status = 'confirmed';
  else {
    const height = await rpcRequest(rpcUrl, 'getBlockHeight', [{ commitment: 'finalized' }]);
    const signature = row.signature || String(body.signature || '');
    const state = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)
      ? (await rpcRequest(rpcUrl, 'getSignatureStatuses', [[signature], { searchTransactionHistory: true }])).value[0] : null;
    if (state?.err) status = 'failed';
    else if (state) status = 'pending';
    else if (height > row.lastValidBlockHeight) status = 'expired';
    else status = signature ? 'pending' : 'prepared';
  }
  const updated = await attempts.update(row.id, { status, checkedAt: new Date().toISOString() });
  return { attempt: publicAttempt(updated) };
}