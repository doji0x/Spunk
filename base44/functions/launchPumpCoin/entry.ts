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
import { checkMetadataProxy, walletOwnsInscription } from '../../shared/pumpLaunchValidation.ts';
import { parseRecipients } from '../../shared/pumpRewards.ts';
import { compileLaunchTransaction, TransactionTooLargeError } from '../../shared/launchTransaction.ts';
import { ensureLaunchLookupTable, stableLaunchKeys } from '../../shared/launchLookupTable.ts';
import { atomicAmount, devBuyInstructions, token2022Program } from '../../shared/pumpBuy.ts';

const minLamports = 30_000_000;
const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
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
// Every launch transaction compiles against the shared lookup table, which is what
// keeps create + first buy inside Solana's 1232-byte ceiling.
function signedVersionedTransaction(instructions, latest, wallet, mint = null, lookupTables = []) {
  return compileLaunchTransaction({ payerKey: wallet.publicKey, instructions, blockhash: latest.blockhash, lookupTables, signers: mint ? [wallet, mint] : [wallet] }).encoded;
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
    const createAmount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: quoteAmount, quoteMint: quote.mint, quoteControl, creatorFeeBps: fee });
    // Two throwaway mints reveal which accounts are mint-independent. Those are the
    // only ones safe to keep in a long-lived lookup table, and they are also the
    // accounts that make create + buy overflow when spelled out in full.
    const probeMints = [Keypair.generate().publicKey, Keypair.generate().publicKey];
    const probeSets = await Promise.all(probeMints.map(probe => PUMP_SDK.createV2AndBuyV2Instructions({ global, mint: probe, name: input.name, symbol: input.symbol, uri, creator: wallet.publicKey, user: wallet.publicKey, amount: createAmount, quoteAmount, quoteMint: quote.mint, quoteTokenProgram: quote.quoteTokenProgram, creatorFeeBps: fee, holderReward: input.holderReward, mayhemMode: false })));
    const lookupTables = [await ensureLaunchLookupTable(base44, rpcUrl, wallet, stableLaunchKeys(probeSets, [wallet.publicKey, ...probeMints]))];

    if (launched) {
      const buyIxs = await devBuyInstructions({ onlineSdk, global, feeConfig, quoteControl, mintKey: mint.publicKey, user: wallet.publicKey, quoteAmount, quote, creatorFeeBps: fee });
      const buildBuy = units => signedVersionedTransaction([ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }), ...buyIxs], latest, wallet, null, lookupTables);
      const simulation = (await rpcRequest(rpcUrl, 'simulateTransaction', [buildBuy(300000), { encoding: 'base64', commitment: 'confirmed', sigVerify: true }])).value;
      if (simulation.err) return Response.json({ error: `First-buy simulation failed: ${JSON.stringify(simulation.err)}`, logs: simulation.logs, safeToEdit }, { status: 422 });
      if (body.simulate === true) return Response.json({ simulated: true, coinMint, bondingCurve, phase: 'buy', logs: simulation.logs, safeToEdit });
      safeToEdit = false; await save({ status: 'pending', phase: 'buy_pending', signature: '', error: '', lastValidBlockHeight: latest.lastValidBlockHeight });
      try { const signature = await rpcRequest(rpcUrl, 'sendTransaction', [buildBuy(Math.min(1400000, Math.max(300000, Math.ceil((simulation.unitsConsumed || 240000) * 1.2)))), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 2 }]); await save({ signature }); return Response.json({ attempt, safeToEdit }); }
      catch (error) { await save({ status: 'expired', phase: 'buy_ready', error: `First buy sending failed: ${error.message}. Resume with the same mint.` }); return Response.json({ attempt, error: attempt.error, safeToEdit }, { status: 502 }); }
    }

    const launchIxs = await PUMP_SDK.createV2AndBuyV2Instructions({ global, mint: mint.publicKey, name: input.name, symbol: input.symbol, uri, creator: wallet.publicKey, user: wallet.publicKey, amount: createAmount, quoteAmount, quoteMint: quote.mint, quoteTokenProgram: quote.quoteTokenProgram, creatorFeeBps: fee, holderReward: input.holderReward, mayhemMode: false });
    const atomicIxs = [ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }), ...launchIxs];
    // Create and first buy ship together or not at all: there is no create-only path,
    // so a launch can never leave a coin on-chain without its dev buy.
    let atomicTransaction;
    try { atomicTransaction = signedVersionedTransaction(atomicIxs, latest, wallet, mint, lookupTables); }
    catch (error) {
      if (!(error instanceof TransactionTooLargeError)) throw error;
      return Response.json({ error: `Create and first buy do not fit in one transaction (${error.size} bytes), so nothing was launched. Shorten the coin name or ticker, or use a SOL pair, and try again.`, safeToEdit }, { status: 422 });
    }

    const simulation = (await rpcRequest(rpcUrl, 'simulateTransaction', [atomicTransaction, { encoding: 'base64', commitment: 'confirmed', sigVerify: true }])).value;
    if (simulation.err) return Response.json({ error: `Create-and-buy simulation failed, so nothing was sent: ${JSON.stringify(simulation.err)}`, logs: simulation.logs, safeToEdit }, { status: 422 });
    const units = Math.min(1400000, Math.max(500000, Math.ceil((simulation.unitsConsumed || 420000) * 1.2)));
    if (body.simulate === true) return Response.json({ simulated: true, coinMint, bondingCurve, units, logs: simulation.logs, safeToEdit });
    safeToEdit = false; await save({ status: 'pending', phase: 'atomic_pending', signature: '', error: '', lastValidBlockHeight: latest.lastValidBlockHeight });
    try { const signature = await rpcRequest(rpcUrl, 'sendTransaction', [signedVersionedTransaction([ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }), ...launchIxs], latest, wallet, mint, lookupTables), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 2 }]); await save({ signature }); return Response.json({ attempt, safeToEdit }); }
    catch (error) { if (await isLaunched(rpcUrl, coinMint, bondingCurve)) return Response.json({ attempt: await save({ status: 'confirmed', phase: 'complete', error: '' }), safeToEdit }); await save({ status: 'expired', error: `Sending failed: ${error.message}. Resume with the same mint.` }); return Response.json({ attempt, error: attempt.error, safeToEdit }, { status: 502 }); }
  } catch (error) { return Response.json({ error: error.message || 'Unable to complete the launch.', safeToEdit }, { status: 500 }); }
}