import { Buffer } from 'node:buffer';
import BN from 'npm:bn.js@5.2.2';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { Connection, PublicKey, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from 'npm:@solana/web3.js@1.98.4';
import { getBuyTokenAmountFromSolAmount } from 'npm:@pump-fun/pump-sdk@2.0.0';
import { compileLaunchTransaction, TransactionTooLargeError } from '../../shared/launchTransaction.ts';
import { readLaunchLookupTable, publicLaunchTableLabel } from '../../shared/launchLookupTable.ts';
import { atomicAmount } from '../../shared/pumpBuy.ts';
import { OnlinePumpSdk, PUMP_SDK, Platform, bondingCurvePda, feeSharingConfigPda, socialFeePda } from 'npm:@pump-fun/pump-sdk@2.0.0';
import { secrets } from 'base44:runtime';
import { assertMainnet, rpcRequest } from '../../shared/mintWallet.ts';
import { verifyInscription } from '../../shared/verifyInscription.ts';
import { isLaunched, metadataUri, imageUri } from '../../shared/pumpLaunch.ts';
import { checkMetadataProxy } from '../../shared/pumpLaunchValidation.ts';
import { parseRecipients } from '../../shared/pumpRewards.ts';
import { supportedPairOptions, resolveSupportedPair, tokenBalance } from '../../shared/pumpPairs.ts';

const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const signaturePattern = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const requestIdPattern = /^[0-9a-f-]{36}$/i;
const solMint = new PublicKey('So11111111111111111111111111111111111111112');
const associatedTokenProgram = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
function socialUrl(value, label) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length > 200) throw new Error(`${label} must be 200 characters or less.`);
  try { const url = new URL(text); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); return url.toString(); }
  catch { throw new Error(`Enter a valid ${label} URL.`); }
}
async function accountExists(rpcUrl, address) {
  return Boolean((await rpcRequest(rpcUrl, 'getAccountInfo', [address, { encoding: 'base64', commitment: 'confirmed' }])).value);
}
// Tamper-detection only: no wallet key is involved in a public launch, so the token
// is keyed off a plain server secret.
async function submissionKey() {
  const material = new TextEncoder().encode(`validate-public-launch-submit-v2:${secrets.get('INSCRIPTION_API_KEY')}`);
  const digest = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', digest, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function createSubmitToken(messageBytes) {
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await submissionKey(), messageBytes));
  return [...signature].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function verifySubmitToken(messageBytes, token) {
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  const signature = Uint8Array.from(token.match(/.{2}/g).map(value => Number.parseInt(value, 16)));
  return crypto.subtle.verify('HMAC', await submissionKey(), signature, messageBytes);
}

export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const body = await req.json();
    if (body.network !== 'mainnet-beta') return Response.json({ error: 'pump.fun launches are available on mainnet only. Switch the network to Mainnet.' }, { status: 400 });
    const rpcUrl = secrets.get('SOLANA_RPC_URL');
    await assertMainnet(rpcUrl);
    if (body.action === 'options') {
      const onlineSdk = new OnlinePumpSdk(new Connection(rpcUrl, 'confirmed'));
      const global = await onlineSdk.fetchGlobal();
      return Response.json({ pairs: await supportedPairOptions(onlineSdk), holderRewardEnabled: global.isHolderRewardEnabled, creatorFeeConfigurable: global.creatorFeeConfigurable, maxCreatorFeeBps: Number(global.maxConfigurableCreatorFeeBps?.toString() || 0) });
    }
    if (body.action === 'submit') {
      const encoded = String(body.transaction || '');
      if (!encoded || encoded.length > 1800) return Response.json({ error: 'Invalid signed launch transaction.' }, { status: 400 });
      let transaction;
      try { transaction = VersionedTransaction.deserialize(Buffer.from(encoded, 'base64')); }
      catch { return Response.json({ error: 'Invalid signed launch transaction.' }, { status: 400 }); }
      if (!await verifySubmitToken(transaction.message.serialize(), String(body.submitToken || ''))) return Response.json({ error: 'This signed transaction does not match the prepared public launch.' }, { status: 403 });
      const attempts = createClientFromRequest(req).asServiceRole.entities.PublicLaunchAttempt;
      const requestId = String(body.requestId || '');
      const [attempt] = requestIdPattern.test(requestId) ? await attempts.filter({ requestId }) : [];
      // The coin mint keypair lives in the launching user's browser; it signs there and
      // sends only its signature, so no server wallet ever signs a public launch.
      const mintSignature = String(body.mintSignature || '');
      if (!attempt?.coinMint || !/^[A-Za-z0-9+/=]{86,90}$/.test(mintSignature)) return Response.json({ error: 'The coin mint signature for this launch is missing. Tap Launch again.' }, { status: 400 });
      transaction.addSignature(new PublicKey(attempt.coinMint), Buffer.from(mintSignature, 'base64'));
      const signedTransaction = Buffer.from(transaction.serialize()).toString('base64');
      // A blockhash that expired while the user reviewed in Phantom is not a failure:
      // tell the client to re-prepare with the same request so the coin mint is reused.
      const expired = { error: 'The transaction expired while waiting for approval. Preparing a fresh one…', reprepare: true };
      if (attempt?.lastValidBlockHeight && await rpcRequest(rpcUrl, 'getBlockHeight', [{ commitment: 'confirmed' }]) > attempt.lastValidBlockHeight) return Response.json(expired, { status: 410 });
      let signature;
      try { signature = await rpcRequest(rpcUrl, 'sendTransaction', [signedTransaction, { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 }]); }
      catch (error) { if (/blockhash not found/i.test(error.message)) return Response.json(expired, { status: 410 }); throw error; }
      if (attempt) await attempts.update(attempt.id, { status: 'pending', signature, checkedAt: new Date().toISOString() });
      return Response.json({ signature });
    }
    if (body.action === 'resume') {
      const walletAddress = String(body.walletAddress || '').trim();
      if (!addressPattern.test(walletAddress)) return Response.json({ error: 'Invalid wallet address.' }, { status: 400 });
      const records = await createClientFromRequest(req).asServiceRole.entities.PublicLaunchAttempt.filter({ walletAddress }, '-created_date', 20);
      return Response.json({ attempts: records.filter(item => ['prepared', 'pending'].includes(item.status)).map(({ submitToken, ...rest }) => rest) });
    }
    if (body.action === 'confirmSharing') {
      const signature = String(body.signature || '');
      if (!signaturePattern.test(signature)) return Response.json({ error: 'Invalid reward confirmation.' }, { status: 400 });
      const state = (await rpcRequest(rpcUrl, 'getSignatureStatuses', [[signature], { searchTransactionHistory: true }])).value[0];
      return Response.json({ status: state?.err ? 'failed' : ['confirmed', 'finalized'].includes(state?.confirmationStatus) ? 'confirmed' : 'pending' });
    }
    if (body.action === 'prepareSharing') {
      const walletAddress = String(body.walletAddress || '').trim();
      const coinMint = String(body.coinMint || '').trim();
      if (!addressPattern.test(walletAddress) || !addressPattern.test(coinMint)) return Response.json({ error: 'Invalid reward configuration.' }, { status: 400 });
      let recipients;
      try { recipients = parseRecipients(body.feeRecipients, false); }
      catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
      if (!recipients.length) return Response.json({ error: 'Add at least one fee recipient.' }, { status: 400 });
      const wallet = new PublicKey(walletAddress), mint = new PublicKey(coinMint), curve = bondingCurvePda(mint).toBase58();
      if (!await isLaunched(rpcUrl, coinMint, curve)) return Response.json({ error: 'Confirm the coin launch before configuring reward sharing.' }, { status: 409 });
      const onlineSdk = new OnlinePumpSdk(new Connection(rpcUrl, 'confirmed'));
      let quote;
      try { ({ quote } = await resolveSupportedPair(onlineSdk, String(body.quoteMint || solMint.toBase58()).trim())); }
      catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
      const shareholders = [], socialCreates = [];
      for (const recipient of recipients) {
        if (recipient.type === 'creator') shareholders.push({ address: wallet, shareBps: recipient.shareBps });
        else if (recipient.type === 'wallet') shareholders.push({ address: new PublicKey(recipient.value), shareBps: recipient.shareBps });
        else { const address = socialFeePda(recipient.value, Platform.GitHub); shareholders.push({ address, shareBps: recipient.shareBps }); if (!await accountExists(rpcUrl, address.toBase58())) socialCreates.push(await PUMP_SDK.createSocialFeePda({ payer: wallet, userId: recipient.value, platform: Platform.GitHub })); }
      }
      const instructions = [ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 })];
      if (!await accountExists(rpcUrl, feeSharingConfigPda(mint).toBase58())) instructions.push(await PUMP_SDK.createFeeSharingConfig({ creator: wallet, mint, pool: null }));
      instructions.push(...socialCreates, await PUMP_SDK.updateFeeSharesV2({ authority: wallet, mint, currentShareholders: [wallet], newShareholders: shareholders, quoteMint: quote.mint, quoteTokenProgram: quote.quoteTokenProgram }));
      const latest = (await rpcRequest(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
      const message = new TransactionMessage({ payerKey: wallet, recentBlockhash: latest.blockhash, instructions }).compileToV0Message();
      return Response.json({ transaction: Buffer.from(new VersionedTransaction(message).serialize()).toString('base64'), lastValidBlockHeight: latest.lastValidBlockHeight });
    }
    if (body.action === 'confirm') {
      const signature = String(body.signature || '');
      const coinMint = String(body.coinMint || '');
      const bondingCurve = String(body.bondingCurve || '');
      if (!signaturePattern.test(signature) || !addressPattern.test(coinMint) || !addressPattern.test(bondingCurve)) return Response.json({ error: 'Invalid launch confirmation.' }, { status: 400 });
      const state = (await rpcRequest(rpcUrl, 'getSignatureStatuses', [[signature], { searchTransactionHistory: true }])).value[0];
      const launched = await isLaunched(rpcUrl, coinMint, bondingCurve);
      const status = state?.err ? 'failed' : launched ? 'confirmed' : 'pending';
      const requestId = String(body.requestId || '');
      if (status !== 'pending' && requestIdPattern.test(requestId)) {
        const attempts = createClientFromRequest(req).asServiceRole.entities.PublicLaunchAttempt;
        const [attempt] = await attempts.filter({ requestId });
        if (attempt) await attempts.update(attempt.id, { status, signature, checkedAt: new Date().toISOString() });
      }
      return Response.json({ status, error: state?.err ? JSON.stringify(state.err) : '' });
    }
    if (body.action !== 'prepare') return Response.json({ error: 'Invalid public launch action.' }, { status: 400 });
    const input = { inscribedMint: String(body.inscribedMint || '').trim(), name: String(body.name || '').trim(), symbol: String(body.symbol || '').trim().toUpperCase(), requestId: String(body.requestId || ''), quoteMint: String(body.quoteMint || solMint.toBase58()).trim(), firstBuyAmount: String(body.firstBuyAmount || '').trim(), holderReward: body.holderReward === true, creatorFeeBps: Math.round(Number(body.creatorFeePercent || 0) * 100) };
    let socials, recipients;
    try { socials = { website: socialUrl(body.website, 'website'), twitter: socialUrl(body.twitter, 'X / Twitter'), github: socialUrl(body.github, 'GitHub') }; recipients = parseRecipients(body.feeRecipients, input.holderReward); }
    catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
    const walletAddress = String(body.walletAddress || '').trim();
    if (!addressPattern.test(walletAddress) || !addressPattern.test(input.inscribedMint) || !input.name || Buffer.byteLength(input.name) > 32 || !input.symbol || Buffer.byteLength(input.symbol) > 10 || !/^[0-9a-f-]{36}$/i.test(input.requestId)) return Response.json({ error: 'Check your wallet, inscription, coin name, and ticker.' }, { status: 400 });
    const onlineSdk = new OnlinePumpSdk(new Connection(rpcUrl, 'confirmed'));
    let pair, quote;
    try { ({ pair, quote } = await resolveSupportedPair(onlineSdk, input.quoteMint)); }
    catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
    const proof = await verifyInscription(input.inscribedMint);
    if (proof.status !== 'valid') return Response.json({ error: proof.reason || proof.message || 'This is not a valid inscription.' }, { status: 422 });
    const wallet = new PublicKey(walletAddress);
    // The coin mint is generated in the launching user's browser and supplied here, so
    // the coin originates from their Phantom session and never from a server wallet.
    const coinMint = String(body.coinMint || '').trim();
    if (!addressPattern.test(coinMint)) return Response.json({ error: 'Reconnect your wallet and tap Launch again — the coin mint could not be read.' }, { status: 400 });
    // Socials stay off the on-chain uri (Metaplex caps it at 200 bytes) and are served
    // from this attempt record instead, keyed by the coin mint.
    const uri = metadataUri(input.inscribedMint, coinMint);
    const proxy = await checkMetadataProxy(uri, imageUri(input.inscribedMint));
    if (!proxy.ready) return Response.json({ error: proxy.message }, { status: 422 });
    const mintKey = new PublicKey(coinMint);
    const bondingCurve = bondingCurvePda(mintKey).toBase58();
    const attempts = createClientFromRequest(req).asServiceRole.entities.PublicLaunchAttempt;
    let [attempt] = await attempts.filter({ requestId: input.requestId, walletAddress });
    if (attempt && attempt.coinMint !== coinMint) return Response.json({ error: 'This launch request was prepared with different coin details. Start a new launch.' }, { status: 409 });
    const launchSummary = { coinMint, bondingCurve, quoteMint: input.quoteMint, quoteSymbol: pair.symbol, firstBuyAmount: input.firstBuyAmount, rewards: { creatorFeeBps: input.creatorFeeBps, holderReward: input.holderReward, customSplit: recipients.length > 0 }, socials, requestId: input.requestId };
    // A resumed request whose coin already landed must never be relaunched.
    if (await isLaunched(rpcUrl, coinMint, bondingCurve)) {
      if (attempt) attempt = await attempts.update(attempt.id, { status: 'confirmed', checkedAt: new Date().toISOString() });
      return Response.json({ ...launchSummary, alreadyLaunched: true, signature: attempt?.signature || '' });
    }
    const global = await onlineSdk.fetchGlobal();
    const maxFee = Number(global.maxConfigurableCreatorFeeBps?.toString() || 0);
    if (input.holderReward && !global.isHolderRewardEnabled) return Response.json({ error: 'pump.fun currently has holder rewards disabled.' }, { status: 422 });
    if (!Number.isInteger(input.creatorFeeBps) || input.creatorFeeBps < 0 || input.creatorFeeBps > maxFee || (input.creatorFeeBps > 0 && !global.creatorFeeConfigurable)) return Response.json({ error: 'The creator fee is outside pump.fun’s current allowed range.' }, { status: 400 });
    let quoteAmount;
    try { quoteAmount = atomicAmount(input.firstBuyAmount, quote.decimals); }
    catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
    const balance = (await rpcRequest(rpcUrl, 'getBalance', [walletAddress, { commitment: 'confirmed' }])).value;
    const isSol = quote.mint.equals(solMint);
    if (BigInt(balance) < 30_000_000n + (isSol ? BigInt(quoteAmount.toString()) : 0n)) return Response.json({ error: isSol ? 'This wallet needs your first-buy amount plus about 0.03 SOL for launch rent and network fees.' : 'This wallet needs about 0.03 SOL for launch rent and network fees, in addition to the selected pair asset.' }, { status: 422 });
    if (!isSol && await tokenBalance(rpcUrl, walletAddress, input.quoteMint) < BigInt(quoteAmount.toString())) return Response.json({ error: `This wallet needs ${input.firstBuyAmount} ${pair.symbol} for the first buy. No automatic swap from SOL is performed.` }, { status: 422 });
    const feeConfig = await onlineSdk.fetchFeeConfig();
    const quoteControl = await onlineSdk.fetchQuoteControl();
    const fee = input.creatorFeeBps ? new BN(input.creatorFeeBps) : undefined;
    const amount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: quoteAmount, quoteMint: quote.mint, quoteControl, creatorFeeBps: fee });
    const buildLaunch = (coinMint, user = wallet) => PUMP_SDK.createV2AndBuyV2Instructions({ global, mint: coinMint, name: input.name, symbol: input.symbol, uri, creator: user, user, amount, quoteAmount, quoteMint: quote.mint, quoteTokenProgram: quote.quoteTokenProgram, creatorFeeBps: fee, holderReward: input.holderReward, mayhemMode: false });
    // Read-only: the shared table of global pump accounts is bootstrapped outside this
    // flow, so no server wallet creates, extends, or pays for anything per launch.
    const table = await readLaunchLookupTable(createClientFromRequest(req), rpcUrl, publicLaunchTableLabel);
    const lookupTables = table ? [table] : [];
    // The pump program debits SOL natively from the user on SOL-paired trades, so no
    // WSOL wrap is prepended. User-derived accounts stay static keys in the message.
    const launchIxs = await buildLaunch(mintKey);
    const latest = (await rpcRequest(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
    const build = units => compileLaunchTransaction({ payerKey: wallet, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }), ...launchIxs], blockhash: latest.blockhash, lookupTables }).encoded;
    let encoded;
    try {
      encoded = build(500000);
    } catch (error) {
      // compileToV0Message overflows its fixed buffer before serialize() can measure the size.
      const overrun = /encoding overruns Uint8Array/i.test(error.message || '');
      if (!(error instanceof TransactionTooLargeError) && !overrun) throw error;
      const size = error instanceof TransactionTooLargeError ? `${error.size} bytes` : 'over 1232 bytes';
      return Response.json({ error: `Create and first buy do not fit in one transaction (${size}), so nothing was launched. Shorten the coin name or ticker and try again.` }, { status: 422 });
    }
    // Non-blocking preflight: a failure here (value.err or a JSON-RPC error) is captured
    // for the UI and logged, never thrown — sendTransaction's own preflight is final.
    let simulation;
    try { simulation = (await rpcRequest(rpcUrl, 'simulateTransaction', [encoded, { encoding: 'base64', commitment: 'confirmed', sigVerify: false }])).value; }
    catch (error) { simulation = { err: error.message, logs: [], unitsConsumed: 0 }; }
    if (simulation.err) console.warn('publicPumpLaunch preflight simulation failed; continuing', JSON.stringify(simulation.err), (simulation.logs || []).slice(-8).join('\n'));
    // Size the compute budget from what the simulation actually consumed, same as the admin path.
    const units = Math.min(1400000, Math.max(500000, Math.ceil((simulation.unitsConsumed || 420000) * 1.2)));
    if (units !== 500000) encoded = build(units);
    const preparedTransaction = VersionedTransaction.deserialize(Buffer.from(encoded, 'base64'));
    const submitToken = await createSubmitToken(preparedTransaction.message.serialize());
    const record = { requestId: input.requestId, walletAddress, inscribedMint: input.inscribedMint, coinMint, bondingCurve, name: input.name, symbol: input.symbol, quoteMint: input.quoteMint, firstBuyAmount: input.firstBuyAmount, creatorFeeBps: input.creatorFeeBps, holderReward: input.holderReward, feeRecipients: recipients, socials, submitToken, signature: '', status: 'prepared', lastValidBlockHeight: latest.lastValidBlockHeight, checkedAt: new Date().toISOString() };
    attempt = attempt ? await attempts.update(attempt.id, record) : await attempts.create(record);
    // Surface our RPC's view of the transaction so a Phantom-side simulation failure
    // can be compared against it instead of guessed at.
    const preflight = { ok: !simulation.err, error: simulation.err ? (typeof simulation.err === 'string' ? simulation.err : JSON.stringify(simulation.err)) : '', unitsConsumed: simulation.unitsConsumed || 0, logs: (simulation.logs || []).slice(-12) };
    return Response.json({ ...launchSummary, transaction: encoded, submitToken, attemptId: attempt.id, lastValidBlockHeight: latest.lastValidBlockHeight, preflight });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to prepare the public launch.' }, { status: 500 });
  }
}