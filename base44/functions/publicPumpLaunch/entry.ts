import { Buffer } from 'node:buffer';
import BN from 'npm:bn.js@5.2.2';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from 'npm:@solana/web3.js@1.98.4';
import { getBuyTokenAmountFromSolAmount } from 'npm:@pump-fun/pump-sdk@2.0.0';
import { compileLaunchTransaction, TransactionTooLargeError } from '../../shared/launchTransaction.ts';
import { ensureLaunchLookupTable, stableLaunchKeys } from '../../shared/launchLookupTable.ts';
import { atomicAmount } from '../../shared/pumpBuy.ts';
import { OnlinePumpSdk, PUMP_SDK, Platform, bondingCurvePda, feeSharingConfigPda, socialFeePda } from 'npm:@pump-fun/pump-sdk@2.0.0';
import { secrets } from 'base44:runtime';
import { parseWallet, assertMainnet, rpcRequest } from '../../shared/mintWallet.ts';
import { verifyInscription } from '../../shared/verifyInscription.ts';
import { launchMint, isLaunched, metadataUri, imageUri } from '../../shared/pumpLaunch.ts';
import { checkMetadataProxy, walletOwnsInscription } from '../../shared/pumpLaunchValidation.ts';
import { parseRecipients } from '../../shared/pumpRewards.ts';
import { supportedPairOptions, resolveSupportedPair, tokenBalance } from '../../shared/pumpPairs.ts';

const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const signaturePattern = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const solMint = new PublicKey('So11111111111111111111111111111111111111112');
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
async function submissionKey(walletBytes) {
  const domain = new TextEncoder().encode('validate-public-launch-submit-v1');
  const material = new Uint8Array(domain.length + walletBytes.length);
  material.set(domain); material.set(walletBytes, domain.length);
  const digest = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', digest, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function createSubmitToken(walletBytes, messageBytes) {
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await submissionKey(walletBytes), messageBytes));
  return [...signature].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function verifySubmitToken(walletBytes, messageBytes, token) {
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  const signature = Uint8Array.from(token.match(/.{2}/g).map(value => Number.parseInt(value, 16)));
  return crypto.subtle.verify('HMAC', await submissionKey(walletBytes), signature, messageBytes);
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
      const walletBytes = parseWallet(secrets.get('MINT_WALLET_SECRET_KEY'));
      if (!await verifySubmitToken(walletBytes, transaction.message.serialize(), String(body.submitToken || ''))) return Response.json({ error: 'This signed transaction does not match the prepared public launch.' }, { status: 403 });
      const signature = await rpcRequest(rpcUrl, 'sendTransaction', [encoded, { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 }]);
      return Response.json({ signature });
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
      return Response.json({ status: state?.err ? 'failed' : launched ? 'confirmed' : 'pending', error: state?.err ? JSON.stringify(state.err) : '' });
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
    if (proof.status !== 'valid' || !await walletOwnsInscription(rpcUrl, walletAddress, input.inscribedMint, proof)) return Response.json({ error: proof.reason || proof.message || 'The connected wallet must control this valid inscription.' }, { status: 422 });
    const uri = metadataUri(input.inscribedMint, socials);
    const proxy = await checkMetadataProxy(uri, imageUri(input.inscribedMint));
    if (!proxy.ready) return Response.json({ error: proxy.message }, { status: 422 });
    const wallet = new PublicKey(walletAddress);
    const walletBytes = parseWallet(secrets.get('MINT_WALLET_SECRET_KEY'));
    const mint = await launchMint(walletBytes, walletAddress, input);
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
    const buildLaunch = coinMint => PUMP_SDK.createV2AndBuyV2Instructions({ global, mint: coinMint, name: input.name, symbol: input.symbol, uri, creator: wallet, user: wallet, amount, quoteAmount, quoteMint: quote.mint, quoteTokenProgram: quote.quoteTokenProgram, creatorFeeBps: fee, holderReward: input.holderReward, mayhemMode: false });
    // Same lookup-table construction the admin launch uses, so both surfaces fit
    // create + first buy into one atomic transaction.
    const probeMints = [Keypair.generate().publicKey, Keypair.generate().publicKey];
    const probeSets = await Promise.all(probeMints.map(buildLaunch));
    const base44 = createClientFromRequest(req);
    const lookupTables = [await ensureLaunchLookupTable(base44, rpcUrl, Keypair.fromSecretKey(walletBytes), stableLaunchKeys(probeSets, [wallet, ...probeMints]))];
    const launchIxs = await buildLaunch(mint.publicKey);
    const latest = (await rpcRequest(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
    let encoded;
    try {
      encoded = compileLaunchTransaction({ payerKey: wallet, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }), ...launchIxs], blockhash: latest.blockhash, lookupTables, signers: [mint] }).encoded;
    } catch (error) {
      if (!(error instanceof TransactionTooLargeError)) throw error;
      return Response.json({ error: `Create and first buy do not fit in one transaction (${error.size} bytes), so nothing was launched. Shorten the coin name or ticker and try again.` }, { status: 422 });
    }
    const simulation = (await rpcRequest(rpcUrl, 'simulateTransaction', [encoded, { encoding: 'base64', commitment: 'confirmed', sigVerify: false }])).value;
    if (simulation.err) return Response.json({ error: `Launch simulation failed, so nothing was sent: ${JSON.stringify(simulation.err)}` }, { status: 422 });
    const preparedTransaction = VersionedTransaction.deserialize(Buffer.from(encoded, 'base64'));
    const submitToken = await createSubmitToken(walletBytes, preparedTransaction.message.serialize());
    return Response.json({ transaction: encoded, submitToken, coinMint: mint.publicKey.toBase58(), bondingCurve: bondingCurvePda(mint.publicKey).toBase58(), lastValidBlockHeight: latest.lastValidBlockHeight, quoteMint: input.quoteMint, quoteSymbol: pair.symbol, firstBuyAmount: input.firstBuyAmount, rewards: { creatorFeeBps: input.creatorFeeBps, holderReward: input.holderReward, customSplit: recipients.length > 0 }, socials });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to prepare the public launch.' }, { status: 500 });
  }
}