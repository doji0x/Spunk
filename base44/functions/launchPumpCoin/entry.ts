import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { Buffer } from 'node:buffer';
import BN from 'npm:bn.js@5.2.2';
import { Connection, Keypair, PublicKey, Transaction, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from 'npm:@solana/web3.js@1.98.4';
import { OnlinePumpSdk, PUMP_SDK, Platform, bondingCurvePda, feeSharingConfigPda, getBuyTokenAmountFromSolAmount, socialFeePda } from 'npm:@pump-fun/pump-sdk@2.0.0';
import { parseWallet, assertMainnet, rpcRequest } from '../../shared/mintWallet.ts';
import { verifyInscription } from '../../shared/verifyInscription.ts';
import { launchMint, isLaunched, settleAttempt, metadataUri, imageUri } from '../../shared/pumpLaunch.ts';
import { supportedPairOptions } from '../../shared/pumpPairs.ts';
import { checkMetadataProxy } from './metadataProxy.ts';
import { walletOwnsInscription } from './ownership.ts';

const minLamports = 30_000_000;
const token2022Program = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function atomicAmount(value, decimals) {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value) || Number(value) <= 0) throw new Error('Enter a positive first-buy amount.');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error(`This pair asset supports at most ${decimals} decimal places.`);
  return new BN(`${whole}${fraction.padEnd(decimals, '0')}`.replace(/^0+(?=\d)/, ''));
}
function parseRecipients(value, holderReward) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) throw new Error('Use no more than 10 fee recipients.');
  if (holderReward && value.length) throw new Error('Choose either holder rewards or a custom creator-fee split, not both.');
  const recipients = value.map(item => ({ type: item.type, value: String(item.value || '').trim(), shareBps: Number(item.shareBps) }));
  if (recipients.length && recipients.reduce((sum, item) => sum + item.shareBps, 0) !== 10000) throw new Error('Fee recipient shares must total exactly 100%.');
  const seen = new Set();
  for (const item of recipients) {
    if (!Number.isInteger(item.shareBps) || item.shareBps < 1 || item.shareBps > 10000) throw new Error('Every fee recipient needs a positive share.');
    if (item.type === 'creator') item.value = 'Creator';
    if (item.type === 'wallet' && !addressPattern.test(item.value)) throw new Error('Enter a valid Solana wallet recipient.');
    if (item.type === 'github' && !/^\d{1,20}$/.test(item.value)) throw new Error('GitHub recipients require a numeric GitHub user ID.');
    if (!['creator', 'wallet', 'github'].includes(item.type) || seen.has(`${item.type}:${item.value}`)) throw new Error('Fee recipients must be unique creator, wallet, or GitHub recipients.');
    seen.add(`${item.type}:${item.value}`);
  }
  return recipients;
}
async function accountExists(rpcUrl, address) { return Boolean((await rpcRequest(rpcUrl, 'getAccountInfo', [address, { encoding: 'base64', commitment: 'confirmed' }])).value); }
async function tokenBalance(rpcUrl, owner, mint) {
  const result = await rpcRequest(rpcUrl, 'getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  return result.value.reduce((sum, item) => sum + BigInt(item.account.data.parsed.info.tokenAmount.amount), 0n);
}
function signedTransaction(instructions, latest, wallet) {
  const tx = new Transaction({ feePayer: wallet.publicKey, ...latest }).add(...instructions);
  tx.sign(wallet);
  return tx.serialize().toString('base64');
}
function signedVersionedTransaction(instructions, latest, wallet, mint = null) {
  const message = new TransactionMessage({ payerKey: wallet.publicKey, recentBlockhash: latest.blockhash, instructions }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign(mint ? [wallet, mint] : [wallet]);
  return Buffer.from(tx.serialize()).toString('base64');
}

export default async function(req: Request): Promise<Response> {
  let safeToEdit = true;
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.', safeToEdit }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized', safeToEdit }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required.', safeToEdit }, { status: 403 });
    const body = await req.json();
    const rpcUrl = secrets.get('SOLANA_RPC_URL');
    await assertMainnet(rpcUrl);
    const onlineSdk = new OnlinePumpSdk(new Connection(rpcUrl, 'confirmed'));
    const global = await onlineSdk.fetchGlobal();
    if (body.action === 'options') return Response.json({ pairs: await supportedPairOptions(onlineSdk), holderRewardEnabled: global.isHolderRewardEnabled, creatorFeeConfigurable: global.creatorFeeConfigurable, maxCreatorFeeBps: Number(global.maxConfigurableCreatorFeeBps?.toString() || 0) });

    const walletBytes = parseWallet(secrets.get('MINT_WALLET_SECRET_KEY'));
    const wallet = Keypair.fromSecretKey(walletBytes);
    if (body.action === 'configureSharing') {
      const [attempt] = await base44.entities.LaunchAttempt.filter({ requestId: String(body.requestId || '') });
      if (!attempt || attempt.status !== 'confirmed') return Response.json({ error: 'Confirm the coin launch before configuring fee sharing.' }, { status: 409 });
      const recipients = parseRecipients(attempt.feeRecipients, attempt.holderReward);
      if (!recipients.length) return Response.json({ error: 'This launch has no fee-sharing recipients.' }, { status: 400 });
      const mint = new PublicKey(attempt.coinMint);
      if (await accountExists(rpcUrl, feeSharingConfigPda(mint).toBase58())) return Response.json({ attempt: await base44.entities.LaunchAttempt.update(attempt.id, { feeSharingStatus: 'configured', checkedAt: new Date().toISOString() }) });
      const quote = await onlineSdk.resolveQuoteMint(new PublicKey(attempt.quoteMint));
      const shareholders = [], socialCreates = [];
      for (const recipient of recipients) {
        if (recipient.type === 'creator') shareholders.push({ address: wallet.publicKey, shareBps: recipient.shareBps });
        else if (recipient.type === 'wallet') shareholders.push({ address: new PublicKey(recipient.value), shareBps: recipient.shareBps });
        else { const address = socialFeePda(recipient.value, Platform.GitHub); shareholders.push({ address, shareBps: recipient.shareBps }); if (!await accountExists(rpcUrl, address.toBase58())) socialCreates.push(await PUMP_SDK.createSocialFeePda({ payer: wallet.publicKey, userId: recipient.value, platform: Platform.GitHub })); }
      }
      const instructions = [ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }), await PUMP_SDK.createFeeSharingConfig({ creator: wallet.publicKey, mint, pool: null }), ...socialCreates, await PUMP_SDK.updateFeeSharesV2({ authority: wallet.publicKey, mint, currentShareholders: [wallet.publicKey], newShareholders: shareholders, quoteMint: quote.mint, quoteTokenProgram: quote.quoteTokenProgram })];
      const latest = (await rpcRequest(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
      const signature = await rpcRequest(rpcUrl, 'sendTransaction', [signedTransaction(instructions, latest, wallet), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 2 }]);
      return Response.json({ attempt: await base44.entities.LaunchAttempt.update(attempt.id, { feeSharingStatus: 'submitted', feeSharingSignature: signature, checkedAt: new Date().toISOString() }) });
    }

    const input = { inscribedMint: String(body.inscribedMint || '').trim(), name: String(body.name || '').trim(), symbol: String(body.symbol || '').trim().toUpperCase(), requestId: body.requestId, quoteMint: String(body.quoteMint || '').trim(), firstBuyAmount: String(body.firstBuyAmount || '').trim(), holderReward: body.holderReward === true, creatorFeeBps: Math.round(Number(body.creatorFeePercent || 0) * 100) };
    if (!addressPattern.test(input.inscribedMint) || !input.name || Buffer.byteLength(input.name) > 32 || !input.symbol || Buffer.byteLength(input.symbol) > 10 || typeof input.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.requestId) || !addressPattern.test(input.quoteMint)) return Response.json({ error: 'Check the inscription, name, ticker, pair, and launch request.', safeToEdit, inputError: true }, { status: 400 });
    let recipients;
    try { recipients = parseRecipients(body.feeRecipients, input.holderReward); }
    catch (error) { return Response.json({ error: error.message, safeToEdit, inputError: true }, { status: 400 }); }
    const maxFee = Number(global.maxConfigurableCreatorFeeBps?.toString() || 0);
    if (input.holderReward && !global.isHolderRewardEnabled) return Response.json({ error: 'pump.fun currently has holder rewards disabled.', safeToEdit, inputError: true }, { status: 422 });
    if (!Number.isInteger(input.creatorFeeBps) || input.creatorFeeBps < 0 || input.creatorFeeBps > maxFee || (input.creatorFeeBps > 0 && !global.creatorFeeConfigurable)) return Response.json({ error: 'The creator fee is outside pump.fun’s current allowed range.', safeToEdit, inputError: true }, { status: 400 });
    const pair = (await supportedPairOptions(onlineSdk)).find(item => item.mint === input.quoteMint);
    if (!pair) return Response.json({ error: 'That pair asset is not currently enabled by pump.fun.', safeToEdit, inputError: true }, { status: 400 });
    const quote = await onlineSdk.resolveQuoteMint(new PublicKey(input.quoteMint));
    const quoteAmount = atomicAmount(input.firstBuyAmount, quote.decimals);
    const mint = await launchMint(walletBytes, user.id, input), coinMint = mint.publicKey.toBase58(), bondingCurve = bondingCurvePda(mint.publicKey).toBase58(), uri = metadataUri(input.inscribedMint);
    let [attempt] = await base44.entities.LaunchAttempt.filter({ requestId: input.requestId });
    const save = async patch => { const data = { ...patch, checkedAt: new Date().toISOString() }; attempt = attempt ? await base44.entities.LaunchAttempt.update(attempt.id, data) : await base44.entities.LaunchAttempt.create({ requestId: input.requestId, inscribedMint: input.inscribedMint, coinMint, bondingCurve, name: input.name, symbol: input.symbol, metadataUri: uri, signature: '', phase: 'atomic_pending', quoteMint: input.quoteMint, quoteSymbol: pair.symbol, firstBuyAmount: input.firstBuyAmount, creatorFeeBps: input.creatorFeeBps, holderReward: input.holderReward, feeRecipients: recipients, feeSharingStatus: recipients.length ? 'ready' : 'not_requested', ...data }); return attempt; };
    if (attempt?.status === 'confirmed') return Response.json({ attempt, safeToEdit: false });
    if (attempt?.status === 'pending') { await save(await settleAttempt(rpcUrl, attempt)); if (attempt.status !== 'expired') return Response.json({ attempt, safeToEdit: false }); }
    const launched = await isLaunched(rpcUrl, coinMint, bondingCurve);
    if (launched && attempt && !['create_pending', 'buy_ready', 'buy_pending'].includes(attempt.phase)) return Response.json({ attempt: await save({ status: 'confirmed', phase: 'complete', error: '' }), safeToEdit: false });
    const proof = await verifyInscription(input.inscribedMint);
    if (proof.status !== 'valid' || !await walletOwnsInscription(rpcUrl, wallet.publicKey.toBase58(), input.inscribedMint, proof)) return Response.json({ error: proof.reason || proof.message || 'The mint wallet does not control a valid inscription.', safeToEdit }, { status: 422 });
    const proxy = await checkMetadataProxy(uri, imageUri(input.inscribedMint));
    if (!proxy.ready) return Response.json({ error: proxy.message, safeToEdit }, { status: 422 });
    const lamports = (await rpcRequest(rpcUrl, 'getBalance', [wallet.publicKey.toBase58(), { commitment: 'confirmed' }])).value;
    if (lamports < minLamports + (pair.symbol === 'SOL' ? Number(quoteAmount.toString()) : 0)) return Response.json({ error: 'The mint wallet lacks SOL for the first buy, rent, and fees.', safeToEdit }, { status: 422 });
    if (pair.symbol !== 'SOL' && await tokenBalance(rpcUrl, wallet.publicKey.toBase58(), input.quoteMint) < BigInt(quoteAmount.toString())) return Response.json({ error: `The mint wallet lacks ${pair.symbol} for the first buy.`, safeToEdit }, { status: 422 });
    const feeConfig = await onlineSdk.fetchFeeConfig(), quoteControl = await onlineSdk.fetchQuoteControl(), fee = input.creatorFeeBps ? new BN(input.creatorFeeBps) : undefined;
    const latest = (await rpcRequest(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }])).value;

    if (launched) {
      const buyState = await onlineSdk.fetchBuyState(mint.publicKey, wallet.publicKey, token2022Program, quote.mint);
      const amount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: buyState.bondingCurve, amount: quoteAmount, quoteMint: quote.mint, quoteControl, creatorFeeBps: fee });
      const buyIxs = await PUMP_SDK.buyV2Instructions({ global, bondingCurveAccountInfo: buyState.bondingCurveAccountInfo, bondingCurve: buyState.bondingCurve, associatedUserAccountInfo: buyState.associatedUserAccountInfo, mint: mint.publicKey, user: wallet.publicKey, amount, quoteAmount, slippage: 0, tokenProgram: token2022Program, quoteTokenProgram: quote.quoteTokenProgram });
      const buildBuy = units => signedVersionedTransaction([ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }), ...buyIxs], latest, wallet);
      const simulation = (await rpcRequest(rpcUrl, 'simulateTransaction', [buildBuy(300000), { encoding: 'base64', commitment: 'confirmed', sigVerify: true }])).value;
      if (simulation.err) return Response.json({ error: `First-buy simulation failed: ${JSON.stringify(simulation.err)}`, logs: simulation.logs, safeToEdit }, { status: 422 });
      if (body.simulate === true) return Response.json({ simulated: true, coinMint, bondingCurve, phase: 'buy', logs: simulation.logs, safeToEdit });
      safeToEdit = false; await save({ status: 'pending', phase: 'buy_pending', signature: '', error: '', lastValidBlockHeight: latest.lastValidBlockHeight });
      try { const signature = await rpcRequest(rpcUrl, 'sendTransaction', [buildBuy(Math.min(1400000, Math.max(300000, Math.ceil((simulation.unitsConsumed || 240000) * 1.2)))), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 2 }]); await save({ signature }); return Response.json({ attempt, safeToEdit }); }
      catch (error) { await save({ status: 'expired', phase: 'buy_ready', error: `First buy sending failed: ${error.message}. Resume with the same mint.` }); return Response.json({ attempt, error: attempt.error, safeToEdit }, { status: 502 }); }
    }

    const amount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: quoteAmount, quoteMint: quote.mint, quoteControl, creatorFeeBps: fee });
    const launchIxs = await PUMP_SDK.createV2AndBuyV2Instructions({ global, mint: mint.publicKey, name: input.name, symbol: input.symbol, uri, creator: wallet.publicKey, user: wallet.publicKey, amount, quoteAmount, quoteMint: quote.mint, quoteTokenProgram: quote.quoteTokenProgram, creatorFeeBps: fee, holderReward: input.holderReward, mayhemMode: false });
    const atomicIxs = [ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }), ...launchIxs];
    let atomicTransaction = null;
    try { atomicTransaction = signedVersionedTransaction(atomicIxs, latest, wallet, mint); }
    catch (error) { if (!/encoding overruns|too large|Transaction too large/i.test(error.message)) throw error; }

    if (!atomicTransaction) {
      const createIx = await PUMP_SDK.createV2Instruction({ mint: mint.publicKey, name: input.name, symbol: input.symbol, uri, creator: wallet.publicKey, user: wallet.publicKey, quoteMint: quote.mint, quoteTokenProgram: quote.quoteTokenProgram, creatorFeeBps: fee, holderReward: input.holderReward, mayhemMode: false });
      const buildCreate = units => signedVersionedTransaction([ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }), createIx], latest, wallet, mint);
      const simulation = (await rpcRequest(rpcUrl, 'simulateTransaction', [buildCreate(300000), { encoding: 'base64', commitment: 'confirmed', sigVerify: true }])).value;
      if (simulation.err) return Response.json({ error: `Coin-creation simulation failed: ${JSON.stringify(simulation.err)}`, logs: simulation.logs, safeToEdit }, { status: 422 });
      if (body.simulate === true) return Response.json({ simulated: true, coinMint, bondingCurve, phase: 'create', logs: simulation.logs, safeToEdit });
      safeToEdit = false; await save({ status: 'pending', phase: 'create_pending', signature: '', error: '', lastValidBlockHeight: latest.lastValidBlockHeight });
      try { const signature = await rpcRequest(rpcUrl, 'sendTransaction', [buildCreate(Math.min(1400000, Math.max(300000, Math.ceil((simulation.unitsConsumed || 240000) * 1.2)))), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 2 }]); await save({ signature }); return Response.json({ attempt, safeToEdit }); }
      catch (error) { await save({ status: 'expired', phase: 'create_pending', error: `Coin creation sending failed: ${error.message}. Resume with the same mint.` }); return Response.json({ attempt, error: attempt.error, safeToEdit }, { status: 502 }); }
    }

    const simulation = (await rpcRequest(rpcUrl, 'simulateTransaction', [atomicTransaction, { encoding: 'base64', commitment: 'confirmed', sigVerify: true }])).value;
    if (simulation.err) return Response.json({ error: `Create-and-buy simulation failed, so nothing was sent: ${JSON.stringify(simulation.err)}`, logs: simulation.logs, safeToEdit }, { status: 422 });
    const units = Math.min(1400000, Math.max(500000, Math.ceil((simulation.unitsConsumed || 420000) * 1.2)));
    if (body.simulate === true) return Response.json({ simulated: true, coinMint, bondingCurve, units, logs: simulation.logs, safeToEdit });
    safeToEdit = false; await save({ status: 'pending', phase: 'atomic_pending', signature: '', error: '', lastValidBlockHeight: latest.lastValidBlockHeight });
    try { const signature = await rpcRequest(rpcUrl, 'sendTransaction', [signedVersionedTransaction([ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }), ...launchIxs], latest, wallet, mint), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 2 }]); await save({ signature }); return Response.json({ attempt, safeToEdit }); }
    catch (error) { if (await isLaunched(rpcUrl, coinMint, bondingCurve)) return Response.json({ attempt: await save({ status: 'confirmed', phase: 'complete', error: '' }), safeToEdit }); await save({ status: 'expired', error: `Sending failed: ${error.message}. Resume with the same mint.` }); return Response.json({ attempt, error: attempt.error, safeToEdit }, { status: 502 }); }
  } catch (error) { return Response.json({ error: error.message || 'Unable to complete the launch.', safeToEdit }, { status: 500 }); }
}