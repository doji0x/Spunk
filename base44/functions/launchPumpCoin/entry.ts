import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { Buffer } from 'node:buffer';
import { Keypair, Transaction, ComputeBudgetProgram } from 'npm:@solana/web3.js@1.98.4';
import { PumpSdk, bondingCurvePda } from 'npm:@pump-fun/pump-sdk@2.0.0';
import { parseWallet, assertMainnet, rpcRequest } from '../../shared/mintWallet.ts';
import { verifyInscription } from '../../shared/verifyInscription.ts';
import { launchMint, isLaunched, settleAttempt, metadataUri, imageUri } from '../../shared/pumpLaunch.ts';
import { checkMetadataProxy } from './metadataProxy.ts';
import { walletOwnsInscription } from './ownership.ts';

// Mint + bonding curve + token account rent plus fees comfortably fit in 0.03 SOL.
const minLamports = 30_000_000;

export default async function(req: Request): Promise<Response> {
  let safeToEdit = true;
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.', safeToEdit }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized', safeToEdit }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required.', safeToEdit }, { status: 403 });
    const body = await req.json();
    const input = {
      inscribedMint: typeof body.inscribedMint === 'string' ? body.inscribedMint.trim() : '',
      name: typeof body.name === 'string' ? body.name.trim() : '',
      symbol: typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : '',
      requestId: body.requestId,
    };
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input.inscribedMint)) return Response.json({ error: 'Enter the source inscribed NFT mint address.', safeToEdit, inputError: true }, { status: 400 });
    if (!input.name || Buffer.byteLength(input.name, 'utf8') > 32 || !input.symbol || Buffer.byteLength(input.symbol, 'utf8') > 10) return Response.json({ error: 'Use a coin name up to 32 UTF-8 bytes and a ticker up to 10 UTF-8 bytes.', safeToEdit, inputError: true }, { status: 400 });
    if (typeof input.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.requestId)) return Response.json({ error: 'A valid launch request ID is required.', safeToEdit, inputError: true }, { status: 400 });
    const rpcUrl = secrets.get('SOLANA_RPC_URL');
    await assertMainnet(rpcUrl);
    const walletBytes = parseWallet(secrets.get('MINT_WALLET_SECRET_KEY'));
    const wallet = Keypair.fromSecretKey(walletBytes);
    const mint = await launchMint(walletBytes, user.id, input);
    const coinMint = mint.publicKey.toBase58();
    const bondingCurve = bondingCurvePda(mint.publicKey).toBase58();
    const uri = metadataUri(input.inscribedMint);

    let [attempt] = await base44.entities.LaunchAttempt.filter({ requestId: input.requestId });
    const save = async patch => {
      const data = { ...patch, checkedAt: new Date().toISOString() };
      attempt = attempt ? await base44.entities.LaunchAttempt.update(attempt.id, data) : await base44.entities.LaunchAttempt.create({ requestId: input.requestId, inscribedMint: input.inscribedMint, coinMint, bondingCurve, name: input.name, symbol: input.symbol, metadataUri: uri, signature: '', ...data });
      return attempt;
    };
    if (attempt?.status === 'confirmed') return Response.json({ attempt, safeToEdit: false });
    if (attempt?.status === 'pending') {
      await save(await settleAttempt(rpcUrl, attempt));
      if (attempt.status !== 'expired') return Response.json({ attempt, safeToEdit: false });
    }
    if (await isLaunched(rpcUrl, coinMint, bondingCurve)) return Response.json({ attempt: await save({ status: 'confirmed', error: '' }), safeToEdit: false });
    if (attempt?.status === 'failed') return Response.json({ attempt, error: attempt.error, safeToEdit: false }, { status: 409 });

    const proof = await verifyInscription(input.inscribedMint);
    if (proof.status !== 'valid') return Response.json({ error: proof.reason || proof.message || 'No valid on-chain image inscription was found.', safeToEdit }, { status: 422 });
    if (!await walletOwnsInscription(rpcUrl, wallet.publicKey.toBase58(), input.inscribedMint, proof)) return Response.json({ error: `The admin mint wallet (${wallet.publicKey.toBase58()}) is neither an update authority of this inscription nor the current holder of the NFT. Only inscriptions owned by this wallet can be launched.`, safeToEdit }, { status: 422 });
    const proxy = await checkMetadataProxy(uri, imageUri(input.inscribedMint));
    if (!proxy.ready) return Response.json({ error: proxy.message, safeToEdit }, { status: 422 });
    const lamports = (await rpcRequest(rpcUrl, 'getBalance', [wallet.publicKey.toBase58(), { commitment: 'confirmed' }])).value;
    if (lamports < minLamports) return Response.json({ error: `The mint wallet holds ${(lamports / 1e9).toFixed(4)} SOL; at least ${minLamports / 1e9} SOL is needed for rent and fees. Fund ${wallet.publicKey.toBase58()} and resume. No SOL was spent.`, safeToEdit }, { status: 422 });

    // createInstruction is deprecated and builds legacy create, NOT create_v2. Cashback is retired; holderReward defaults off.
    const create = await new PumpSdk().createV2Instruction({ mint: mint.publicKey, name: input.name, symbol: input.symbol, uri, creator: wallet.publicKey, user: wallet.publicKey, mayhemMode: false });
    const latest = (await rpcRequest(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
    const build = units => {
      const tx = new Transaction({ feePayer: wallet.publicKey, ...latest }).add(ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }), create);
      tx.sign(wallet, mint);
      return tx.serialize().toString('base64');
    };
    const simulation = (await rpcRequest(rpcUrl, 'simulateTransaction', [build(400000), { encoding: 'base64', commitment: 'confirmed', sigVerify: true }])).value;
    if (simulation.err) return Response.json({ error: `The launch transaction failed simulation, so nothing was sent: ${JSON.stringify(simulation.err)}`, logs: simulation.logs, safeToEdit }, { status: 422 });
    const units = Math.min(1_400_000, Math.ceil((simulation.unitsConsumed || 300000) * 1.2));
    if (body.simulate === true) return Response.json({ simulated: true, coinMint, bondingCurve, metadataUri: uri, units, unitsConsumed: simulation.unitsConsumed, logs: simulation.logs, safeToEdit });

    safeToEdit = false;
    await save({ status: 'pending', signature: '', error: '', lastValidBlockHeight: latest.lastValidBlockHeight });
    let signature;
    try {
      signature = await rpcRequest(rpcUrl, 'sendTransaction', [build(units), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 2 }]);
    } catch (error) {
      if (await isLaunched(rpcUrl, coinMint, bondingCurve)) return Response.json({ attempt: await save({ status: 'confirmed', error: '' }), safeToEdit });
      await save({ status: 'expired', error: `Sending failed before the transaction landed: ${error.message}. Resume to resend with the same coin mint.` });
      return Response.json({ attempt, error: attempt.error, safeToEdit }, { status: 502 });
    }
    await save({ status: 'pending', signature });
    return Response.json({ attempt, safeToEdit });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to complete the launch. Resume the same launch to check its status.', safeToEdit }, { status: 500 });
  }
}