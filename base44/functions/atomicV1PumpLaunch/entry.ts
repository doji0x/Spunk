import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { Buffer } from 'node:buffer';
import { Connection, Keypair, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { OnlinePumpSdk, PUMP_SDK, bondingCurvePda, getBuyTokenAmountFromSolAmount } from 'npm:@pump-fun/pump-sdk@2.0.0';
import { parseWallet, assertMainnet, rpcRequest } from '../../shared/mintWallet.ts';
import { launchMint, isLaunched } from '../../shared/pumpLaunch.ts';
import { atomicAmount } from '../../shared/pumpBuy.ts';
import { detectImageMime, isCompleteImage } from '../../shared/imageMime.ts';
import { buildAtomicV1Transaction, atomicV1MaxBytes } from '../../shared/atomicV1Launch.ts';
import { inspectV1Transaction } from '../../shared/v1Transaction.ts';
import { cleanSocials } from '../../shared/launchSocials.ts';

const solMint = new PublicKey('So11111111111111111111111111111111111111112');
const appUrl = 'https://solvalidate.base44.app';
const requestPattern = /^[0-9a-f-]{36}$/i;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function cleanInput(body) {
  return { requestId: String(body.requestId || ''), name: String(body.name || '').trim(), symbol: String(body.symbol || '').trim().toUpperCase(), description: String(body.description || '').trim(), firstBuyAmount: String(body.firstBuyAmount || '').trim() };
}

export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const body = await req.json();
    const rpcUrl = secrets.get('SOLANA_RPC_URL');
    await assertMainnet(rpcUrl);

    if (body.action === 'confirm') {
      const [launch] = await base44.entities.AtomicV1Launch.filter({ requestId: String(body.requestId || '') });
      if (!launch) return Response.json({ error: 'Atomic V1 launch not found.' }, { status: 404 });
      if (launch.status !== 'pending') return Response.json({ launch });
      const state = (await rpcRequest(rpcUrl, 'getSignatureStatuses', [[launch.transactionSignature], { searchTransactionHistory: true }])).value[0];
      if (state?.err) return Response.json({ launch: await base44.entities.AtomicV1Launch.update(launch.id, { status: 'failed', error: `Atomic transaction failed: ${JSON.stringify(state.err)}`, checkedAt: new Date().toISOString() }) });
      if (state?.confirmationStatus !== 'finalized') return Response.json({ launch });
      const proof = await inspectV1Transaction(launch.transactionSignature, launch.coinMint);
      const verified = proof.status === 'valid' && proof.hash === launch.imageSha256 && proof.bytes === launch.imageByteLength && proof.commitment === 'VALIDATE-v1';
      const landed = await isLaunched(rpcUrl, launch.coinMint, launch.bondingCurve);
      return Response.json({ launch: await base44.entities.AtomicV1Launch.update(launch.id, { status: verified && landed ? 'confirmed' : 'incomplete', atomicV1Verified: verified && landed, error: verified && landed ? '' : 'The Pump coin or VALIDATE-v1 image could not be independently verified from the finalized launch transaction.', checkedAt: new Date().toISOString() }) });
    }

    if (!['size', 'launch'].includes(body.action)) return Response.json({ error: 'Invalid Atomic V1 action.' }, { status: 400 });
    const input = cleanInput(body);
    if (!requestPattern.test(input.requestId) || !input.name || Buffer.byteLength(input.name) > 32 || !input.symbol || Buffer.byteLength(input.symbol) > 10 || input.description.length > 280) return Response.json({ error: 'Check the launch request, name, ticker, and description.' }, { status: 400 });
    if (typeof body.imageBase64 !== 'string' || body.imageBase64.length > 10000) return Response.json({ error: 'A tiny image is required.' }, { status: 400 });
    const imageBytes = Buffer.from(body.imageBase64, 'base64');
    const imageMime = detectImageMime(imageBytes);
    if (!imageMime || !isCompleteImage(imageBytes, imageMime)) return Response.json({ error: 'Upload a complete PNG, JPEG, GIF, or WebP image.' }, { status: 400 });
    if (body.action === 'launch') {
      const [existing] = await base44.entities.AtomicV1Launch.filter({ requestId: input.requestId });
      if (existing?.transactionSignature) return Response.json({ launch: existing });
    }

    const walletBytes = parseWallet(secrets.get('MINT_WALLET_SECRET_KEY'));
    const wallet = Keypair.fromSecretKey(walletBytes);
    const mint = await launchMint(walletBytes, user.id, { ...input, inscribedMint: 'atomic-v1' });
    const coinMint = mint.publicKey.toBase58();
    const bondingCurve = bondingCurvePda(mint.publicKey).toBase58();
    const metadataUri = `${appUrl}/functions/atomicV1Metadata?mint=${coinMint}`;
    const onlineSdk = new OnlinePumpSdk(new Connection(rpcUrl, 'confirmed'));
    const global = await onlineSdk.fetchGlobal();
    let legacyInstructions;
    if (input.firstBuyAmount) {
      const quote = await onlineSdk.resolveQuoteMint(solMint);
      const quoteAmount = atomicAmount(input.firstBuyAmount, quote.decimals);
      const feeConfig = await onlineSdk.fetchFeeConfig();
      const quoteControl = await onlineSdk.fetchQuoteControl();
      const amount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: quoteAmount, quoteMint: quote.mint, quoteControl });
      legacyInstructions = await PUMP_SDK.createV2AndBuyV2Instructions({ global, mint: mint.publicKey, name: input.name, symbol: input.symbol, uri: metadataUri, creator: wallet.publicKey, user: wallet.publicKey, amount, quoteAmount, quoteMint: quote.mint, quoteTokenProgram: quote.quoteTokenProgram, mayhemMode: false, holderReward: false });
    } else {
      legacyInstructions = [await PUMP_SDK.createV2Instruction({ mint: mint.publicKey, name: input.name, symbol: input.symbol, uri: metadataUri, creator: wallet.publicKey, user: wallet.publicKey, mayhemMode: false, holderReward: false })];
    }
    const latest = (await rpcRequest(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
    const built = await buildAtomicV1Transaction({ legacyInstructions, payerBytes: walletBytes, mintBytes: mint.secretKey, latest, mint: coinMint, imageBytes });
    const size = { imageBytes: built.imageBytes, commitmentBytes: built.commitmentBytes, transactionBytesWithoutImage: built.transactionBytesWithoutImage, finalSerializedTransactionBytes: built.size, maximumBytes: atomicV1MaxBytes, remainingBytes: built.remainingBytes, requiredReductionBytes: built.requiredReductionBytes, coinMint, imageSha256: built.imageSha256 };
    if (body.action === 'size') return Response.json({ size });
    if (built.size > atomicV1MaxBytes) return Response.json({ error: `The signed V1 transaction is ${built.size} bytes. Remove exactly ${built.requiredReductionBytes} bytes from the image before launching.`, size }, { status: 422 });
    if (typeof body.imageUrl !== 'string' || !/^https:\/\//.test(body.imageUrl)) return Response.json({ error: 'The public Pump image upload is missing.' }, { status: 400 });

    const balance = (await rpcRequest(rpcUrl, 'getBalance', [wallet.publicKey.toBase58(), { commitment: 'confirmed' }])).value;
    const buyLamports = input.firstBuyAmount ? BigInt(atomicAmount(input.firstBuyAmount, 9).toString()) : 0n;
    if (BigInt(balance) < 30_000_000n + buyLamports) return Response.json({ error: 'The mint wallet needs the first-buy amount plus about 0.03 SOL for rent and fees.' }, { status: 422 });
    let [launch] = await base44.entities.AtomicV1Launch.filter({ requestId: input.requestId });
    const record = { requestId: input.requestId, coinMint, bondingCurve, name: input.name, symbol: input.symbol, description: input.description, imageUrl: body.imageUrl, imageMime, imageByteLength: imageBytes.length, imageSha256: built.imageSha256, metadataUri, socials: cleanSocials(body.socials), transactionVersion: 1, serializedTransactionBytes: built.size, commitment: 'VALIDATE-v1', atomicV1Verified: false, firstBuyAmount: input.firstBuyAmount, status: 'prepared', error: '', lastValidBlockHeight: latest.lastValidBlockHeight, checkedAt: new Date().toISOString() };
    launch = launch ? await base44.entities.AtomicV1Launch.update(launch.id, record) : await base44.entities.AtomicV1Launch.create(record);
    const simulation = (await rpcRequest(rpcUrl, 'simulateTransaction', [built.encoded, { encoding: 'base64', commitment: 'confirmed', sigVerify: true }])).value;
    if (simulation.err) return Response.json({ error: `Atomic V1 simulation failed, so nothing was sent: ${JSON.stringify(simulation.err)}`, logs: simulation.logs }, { status: 422 });
    const computeUnitLimit = Math.min(1_400_000, Math.max(200_000, Math.ceil((simulation.unitsConsumed || 600_000) * 1.2)));
    const finalBuilt = await buildAtomicV1Transaction({ legacyInstructions, payerBytes: walletBytes, mintBytes: mint.secretKey, latest, mint: coinMint, imageBytes, computeUnitLimit });
    const finalSimulation = (await rpcRequest(rpcUrl, 'simulateTransaction', [finalBuilt.encoded, { encoding: 'base64', commitment: 'confirmed', sigVerify: true }])).value;
    if (finalSimulation.err) return Response.json({ error: `Atomic V1 resource-adjusted simulation failed, so nothing was sent: ${JSON.stringify(finalSimulation.err)}`, logs: finalSimulation.logs }, { status: 422 });
    const signature = await rpcRequest(rpcUrl, 'sendTransaction', [finalBuilt.encoded, { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 2 }]);
    launch = await base44.entities.AtomicV1Launch.update(launch.id, { transactionSignature: signature, serializedTransactionBytes: finalBuilt.size, status: 'pending', checkedAt: new Date().toISOString() });
    return Response.json({ launch, size });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to complete the Atomic V1 launch.' }, { status: 500 });
  }
}