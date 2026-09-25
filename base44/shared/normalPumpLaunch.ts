import { Buffer } from 'node:buffer';
import nacl from 'npm:tweetnacl@1.0.3';
import { PublicKey, ComputeBudgetProgram } from 'npm:@solana/web3.js@1.98.4';
import { PUMP_SDK, bondingCurvePda } from 'npm:@pump-fun/pump-sdk@2.0.0';
import { compileLaunchTransaction } from './launchTransaction.ts';
import { rpcRequest } from './mintWallet.ts';
import { isLaunched } from './pumpLaunch.ts';
import { readLaunchLookupTable, publicLaunchTableLabel } from './launchLookupTable.ts';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
export function normalPublicAttempt({ submitToken, preparedTransaction, ...attempt }) { return attempt; }
export async function checkNormalLaunch(base44, rpcUrl, body) {
  const attempts = base44.asServiceRole.entities.PublicLaunchAttempt;
  const [row] = await attempts.filter({ requestId: String(body.requestId || ''), walletAddress: String(body.walletAddress || ''), launchMode: 'normal' });
  if (!row) return { attempt: null };
  let status = 'pending';
  // Finalized height is conservative: never refresh a message merely because a processed fork expired.
  const height = await rpcRequest(rpcUrl, 'getBlockHeight', [{ commitment: 'finalized' }]);
  if (await isLaunched(rpcUrl, row.coinMint, row.bondingCurve)) status = 'confirmed';
  else {
    const signature = row.signature || String(body.signature || '');
    const state = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)
      ? (await rpcRequest(rpcUrl, 'getSignatureStatuses', [[signature], { searchTransactionHistory: true }])).value[0] : null;
    if (state?.err) status = 'failed';
    else if (state) status = 'pending';
    else if (height > row.lastValidBlockHeight) status = 'expired';
    else status = signature ? 'pending' : 'prepared';
  }
  const updated = await attempts.update(row.id, { status, checkedAt: new Date().toISOString() });
  return { attempt: normalPublicAttempt(updated) };
}
export async function prepareNormalLaunch(base44, rpcUrl, body, createSubmitToken) {
  const requestId = String(body.requestId || ''), walletAddress = String(body.walletAddress || ''), coinMint = String(body.coinMint || '');
  assert(/^[0-9a-f-]{36}$/i.test(requestId), 'Invalid launch request.');
  const wallet = new PublicKey(walletAddress), mint = new PublicKey(coinMint);
  const name = String(body.name || '').trim(), symbol = String(body.symbol || '').trim().toUpperCase();
  const metadataUrl = String(body.metadataUrl || ''), imageUrl = String(body.imageUrl || '');
  const description = String(body.description || '');
  assert(name && Buffer.byteLength(name) <= 32 && symbol && Buffer.byteLength(symbol) <= 10, 'Name must fit 32 bytes and ticker 10 bytes.');
  assert(description.length <= 2000, 'Description is too long.');
  assert(metadataUrl.length <= 200 && new URL(metadataUrl).protocol === 'https:', 'Metadata needs a public HTTPS URL of at most 200 bytes.');
  assert(imageUrl.length <= 2048 && new URL(imageUrl).protocol === 'https:', 'Invalid image URL.');
  const socials = Object.fromEntries(['website', 'twitter', 'github'].map(key => {
    const value = String(body.socials?.[key] || '').trim();
    assert(!value || (value.length <= 200 && ['http:', 'https:'].includes(new URL(value).protocol)), `Invalid ${key} link.`);
    return [key, value];
  }));
  const intent = JSON.stringify(['validate-normal-pump-v1', requestId, walletAddress, coinMint, name, symbol, metadataUrl, imageUrl, description, socials.website, socials.twitter, socials.github]);
  const proof = Buffer.from(String(body.mintAuthorization || ''), 'base64');
  assert(proof.length === 64 && nacl.sign.detached.verify(new TextEncoder().encode(intent), proof, mint.toBytes()), 'Invalid mint authorization.');
  const attempts = base44.asServiceRole.entities.PublicLaunchAttempt;
  let [row] = await attempts.filter({ requestId });
  if (row) {
    assert(row.launchMode === 'normal' && row.walletAddress === walletAddress && row.coinMint === coinMint && row.name === name && row.symbol === symbol && row.metadataUrl === metadataUrl, 'Saved launch details cannot be changed.');
    const checked = await checkNormalLaunch(base44, rpcUrl, body); row = { ...row, ...checked.attempt };
    if (row.status === 'confirmed') return { ...normalPublicAttempt(row), alreadyLaunched: true };
    assert(row.status !== 'pending', 'This launch is still pending. Check it before requesting another approval.');
    if (row.status === 'prepared' && row.preparedTransaction) return { ...normalPublicAttempt(row), transaction: row.preparedTransaction, submitToken: row.submitToken };
  }
  const bondingCurve = bondingCurvePda(mint).toBase58();
  if (await isLaunched(rpcUrl, coinMint, bondingCurve)) return { requestId, coinMint, bondingCurve, name, symbol, status: 'confirmed', alreadyLaunched: true };
  const instruction = await PUMP_SDK.createV2Instruction({ mint, name, symbol, uri: metadataUrl, creator: wallet, user: wallet, mayhemMode: false, holderReward: false });
  const table = await readLaunchLookupTable(base44, rpcUrl, publicLaunchTableLabel);
  const latest = (await rpcRequest(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
  const { transaction, encoded } = compileLaunchTransaction({ payerKey: wallet, blockhash: latest.blockhash, lookupTables: table ? [table] : [], instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }), instruction] });
  const simulation = (await rpcRequest(rpcUrl, 'simulateTransaction', [encoded, { encoding: 'base64', commitment: 'confirmed', sigVerify: false }])).value;
  if (simulation.err) {
    console.warn('Create-only simulation failed', JSON.stringify(simulation.err), simulation.logs);
    throw new Error(`Coin creation simulation failed: ${JSON.stringify(simulation.err)}. Ensure your wallet has SOL for rent and fees. ${(simulation.logs || []).slice(-4).join(' ')}`);
  }
  const submitToken = await createSubmitToken(transaction.message.serialize());
  const record = { requestId, walletAddress, coinMint, bondingCurve, name, symbol, description, metadataUrl, imageUrl, socials, launchMode: 'normal', firstBuyAmount: '', quoteMint: 'So11111111111111111111111111111111111111112', status: 'prepared', signature: '', preparedTransaction: encoded, submitToken, lastValidBlockHeight: latest.lastValidBlockHeight, checkedAt: new Date().toISOString() };
  const saved = row ? await attempts.update(row.id, record) : await attempts.create(record);
  return { ...normalPublicAttempt(saved), transaction: encoded, submitToken };
}