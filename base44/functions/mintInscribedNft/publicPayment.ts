import { Buffer } from 'node:buffer';
import { ComputeBudgetProgram, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from 'npm:@solana/web3.js@1.98.4';
import { rpcRequest } from '../../shared/mintWallet.ts';

const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const signaturePattern = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const idPattern = /^[0-9a-f-]{36}$/i;
const memoProgram = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function publicMintCost(rpcUrl, totalSize) {
  if (!Number.isInteger(totalSize) || totalSize < 1 || totalSize > 1024 * 1024) throw new Error('The image must be 1 MB or smaller.');
  const rent = await rpcRequest(rpcUrl, 'getMinimumBalanceForRentExemption', [totalSize + 2400, { commitment: 'confirmed' }]);
  const transactionCount = Math.ceil(totalSize / 800) + 7;
  return rent + transactionCount * 10000 + 30000000;
}

export async function preparePublicMintPayment(rpcUrl, walletAddress, recipient, requestId, sessionHash, totalSize) {
  if (!addressPattern.test(walletAddress) || !idPattern.test(requestId) || !/^[0-9a-f]{64}$/i.test(sessionHash)) throw new Error('Invalid public inscription request.');
  const lamports = await publicMintCost(rpcUrl, totalSize);
  const latest = (await rpcRequest(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
  const wallet = new PublicKey(walletAddress);
  const memo = `validate-inscribe:${requestId}:${sessionHash.toLowerCase()}`;
  const instructions = [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }), SystemProgram.transfer({ fromPubkey: wallet, toPubkey: new PublicKey(recipient), lamports }), new TransactionInstruction({ keys: [], programId: memoProgram, data: Buffer.from(memo) })];
  const message = new TransactionMessage({ payerKey: wallet, recentBlockhash: latest.blockhash, instructions }).compileToV0Message();
  return { transaction: Buffer.from(new VersionedTransaction(message).serialize()).toString('base64'), lamports, sol: lamports / 1e9, lastValidBlockHeight: latest.lastValidBlockHeight };
}

export async function verifyPublicMintPayment(rpcUrl, recipient, input) {
  const auth = input.publicAuth || {};
  const walletAddress = String(auth.walletAddress || '');
  const signature = String(auth.paymentSignature || '');
  const requestId = String(auth.requestId || '');
  const secret = String(auth.sessionSecret || '');
  if (!addressPattern.test(walletAddress) || !signaturePattern.test(signature) || !idPattern.test(requestId) || !secret || secret.length > 128) throw new Error('Public inscription authorization is incomplete.');
  const digest = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))).toString('hex');
  const expectedMemo = `validate-inscribe:${requestId}:${digest}`;
  const required = await publicMintCost(rpcUrl, Number(input.totalSize));
  let transaction = null;
  for (let attempt = 0; attempt < 6 && !transaction; attempt += 1) {
    transaction = await rpcRequest(rpcUrl, 'getTransaction', [signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
    if (!transaction) await wait(1000);
  }
  if (!transaction || transaction.meta?.err) throw new Error('The inscription payment has not confirmed. Resume after it confirms.');
  const instructions = transaction.transaction?.message?.instructions || [];
  const transfer = instructions.find(item => item.program === 'system' && item.parsed?.type === 'transfer' && item.parsed.info?.source === walletAddress && item.parsed.info?.destination === recipient && Number(item.parsed.info?.lamports) >= required);
  const memo = instructions.find(item => item.program === 'spl-memo' && item.parsed === expectedMemo);
  if (!transfer || !memo) throw new Error('The payment does not authorize this inscription request.');
  return { walletAddress, requestId };
}