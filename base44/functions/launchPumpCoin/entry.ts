import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { Buffer } from 'node:buffer';
import { Keypair, Transaction, ComputeBudgetProgram } from 'npm:@solana/web3.js@1.98.4';
import { PumpSdk, bondingCurvePda, PUMP_PROGRAM_ID } from 'npm:@pump-fun/pump-sdk@2.0.0';
import { parseWallet, assertMainnet, rpcRequest } from '../../shared/mintWallet.ts';
import { verifyInscription } from '../../shared/verifyInscription.ts';
import { derive } from '../../shared/inscriptionMetadata.ts';
import { checkMetadataGateway } from './metadataGateway.ts';

// A random request ID produces a fresh mint, but retries reproduce that same keypair.
// HMAC prevents the public request ID from revealing the mint's private key.
async function launchMint(walletBytes, userId, input) {
  const key = await crypto.subtle.importKey('raw', walletBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const message = JSON.stringify(['pump-launch-v1', userId, input.requestId, input.inscribedMint, input.name, input.symbol]);
  const seed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Keypair.fromSeed(new Uint8Array(seed));
}

async function isLaunched(rpcUrl, coinMint, bondingCurve) {
  const response = await rpcRequest(rpcUrl, 'getMultipleAccounts', [[coinMint, bondingCurve], { encoding: 'base64', commitment: 'confirmed', dataSlice: { offset: 0, length: 0 } }]);
  const [mint, curve] = response.value;
  return mint?.owner === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' && curve?.owner === PUMP_PROGRAM_ID.toBase58();
}

async function sendLaunch(rpcUrl, instructions, wallet, mint, result, simulate) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await isLaunched(rpcUrl, result.coinMint, result.bondingCurve)) return { ...result, confirmed: true };
    const latest = (await rpcRequest(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
    const tx = new Transaction({ feePayer: wallet.publicKey, ...latest }).add(...instructions);
    tx.sign(wallet, mint);
    const encoded = tx.serialize().toString('base64');
    if (simulate) {
      const simulation = await rpcRequest(rpcUrl, 'simulateTransaction', [encoded, { encoding: 'base64', commitment: 'confirmed', sigVerify: true }]);
      return { ...result, simulated: true, confirmed: false, simulationError: simulation.value.err, unitsConsumed: simulation.value.unitsConsumed, logs: simulation.value.logs };
    }
    let signature;
    try {
      signature = await rpcRequest(rpcUrl, 'sendTransaction', [encoded, { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 2 }]);
    } catch (error) {
      if (await isLaunched(rpcUrl, result.coinMint, result.bondingCurve)) return { ...result, confirmed: true };
      if (/blockhash not found|block height exceeded|blockhash.*expired/i.test(error.message) && attempt < 2) continue;
      throw error;
    }
    // HTTP polling avoids a WebSocket dependency in the serverless runtime.
    for (let poll = 0; poll < 20; poll += 1) {
      const state = (await rpcRequest(rpcUrl, 'getSignatureStatuses', [[signature], { searchTransactionHistory: true }])).value[0];
      if (state?.err) throw new Error(`Launch transaction failed: ${JSON.stringify(state.err)}`);
      if (['confirmed', 'finalized'].includes(state?.confirmationStatus)) return { ...result, signature, confirmed: true };
      const height = await rpcRequest(rpcUrl, 'getBlockHeight', [{ commitment: 'confirmed' }]);
      if (height > latest.lastValidBlockHeight) break;
      if (poll === 19) return { ...result, signature, confirmed: false, pending: true };
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  if (await isLaunched(rpcUrl, result.coinMint, result.bondingCurve)) return { ...result, confirmed: true };
  return { ...result, confirmed: false, pending: true };
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
    const input = {
      inscribedMint: typeof body.inscribedMint === 'string' ? body.inscribedMint.trim() : '',
      name: typeof body.name === 'string' ? body.name.trim() : '',
      symbol: typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : '',
      requestId: body.requestId,
    };
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input.inscribedMint)) return Response.json({ error: 'Enter the source inscribed NFT mint address.', safeToEdit }, { status: 400 });
    if (!input.name || Buffer.byteLength(input.name, 'utf8') > 32 || !input.symbol || Buffer.byteLength(input.symbol, 'utf8') > 10) return Response.json({ error: 'Use a coin name up to 32 UTF-8 bytes and a ticker up to 10 UTF-8 bytes.', safeToEdit }, { status: 400 });
    if (typeof input.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.requestId)) return Response.json({ error: 'A valid launch request ID is required.', safeToEdit }, { status: 400 });
    const rpcUrl = secrets.get('SOLANA_RPC_URL');
    await assertMainnet(rpcUrl);
    const walletBytes = parseWallet(secrets.get('MINT_WALLET_SECRET_KEY'));
    const wallet = Keypair.fromSecretKey(walletBytes);
    const mint = await launchMint(walletBytes, user.id, input);
    const result = {
      coinMint: mint.publicKey.toBase58(),
      bondingCurve: bondingCurvePda(mint.publicKey).toBase58(),
      inscriptionGatewayUrl: `https://igw.metaplex.com/mainnet/${derive(input.inscribedMint)}`,
      explorer: `https://solscan.io/token/${mint.publicKey.toBase58()}`,
    };
    if (await isLaunched(rpcUrl, result.coinMint, result.bondingCurve)) return Response.json({ ...result, confirmed: true });
    const proof = await verifyInscription(input.inscribedMint);
    if (proof.status !== 'valid') return Response.json({ error: proof.reason || proof.message || 'No valid on-chain image inscription was found.', safeToEdit }, { status: 422 });
    result.inscriptionGatewayUrl = `https://igw.metaplex.com/mainnet/${proof.root}`;
    result.inscriptionImmutable = proof.immutable;
    const gateway = await checkMetadataGateway(result.inscriptionGatewayUrl, proof);
    if (!gateway.ready && body.simulate !== true) return Response.json({ error: gateway.message, safeToEdit }, { status: 422 });
    if (body.simulate === true) { result.gatewayReady = gateway.ready; result.gatewayWarning = gateway.message || null; }
    const sdk = new PumpSdk();
    // createInstruction is deprecated and builds legacy create, NOT create_v2.
    const create = await sdk.createV2Instruction({ mint: mint.publicKey, name: input.name, symbol: input.symbol, uri: result.inscriptionGatewayUrl, creator: wallet.publicKey, user: wallet.publicKey, mayhemMode: false, cashback: false, holderReward: false });
    const instructions = [ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }), create];
    safeToEdit = false;
    return Response.json(await sendLaunch(rpcUrl, instructions, wallet, mint, result, body.simulate === true));
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to complete the launch. Resume the same launch to check its status.', safeToEdit }, { status: 500 });
  }
}