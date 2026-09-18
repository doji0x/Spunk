import { Buffer } from 'node:buffer';
import BN from 'npm:bn.js@5.2.2';
import { Connection, PublicKey, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from 'npm:@solana/web3.js@1.98.4';
import { OnlinePumpSdk, PUMP_SDK, bondingCurvePda } from 'npm:@pump-fun/pump-sdk@2.0.0';
import { secrets } from 'base44:runtime';
import { parseWallet, assertMainnet, rpcRequest } from '../../shared/mintWallet.ts';
import { verifyInscription } from '../../shared/verifyInscription.ts';
import { launchMint, isLaunched, metadataUri, imageUri } from '../../shared/pumpLaunch.ts';
import { checkMetadataProxy, walletOwnsInscription } from '../../shared/pumpLaunchValidation.ts';

const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const signaturePattern = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const solMint = new PublicKey('So11111111111111111111111111111111111111112');

export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const body = await req.json();
    if (body.network !== 'mainnet-beta') return Response.json({ error: 'pump.fun launches are available on mainnet only. Switch the network to Mainnet.' }, { status: 400 });
    const rpcUrl = secrets.get('SOLANA_RPC_URL');
    await assertMainnet(rpcUrl);
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
    const input = { inscribedMint: String(body.inscribedMint || '').trim(), name: String(body.name || '').trim(), symbol: String(body.symbol || '').trim().toUpperCase(), requestId: String(body.requestId || '') };
    const walletAddress = String(body.walletAddress || '').trim();
    if (!addressPattern.test(walletAddress) || !addressPattern.test(input.inscribedMint) || !input.name || Buffer.byteLength(input.name) > 32 || !input.symbol || Buffer.byteLength(input.symbol) > 10 || !/^[0-9a-f-]{36}$/i.test(input.requestId)) return Response.json({ error: 'Check your wallet, inscription, coin name, and ticker.' }, { status: 400 });
    const proof = await verifyInscription(input.inscribedMint);
    if (proof.status !== 'valid' || !await walletOwnsInscription(rpcUrl, walletAddress, input.inscribedMint, proof)) return Response.json({ error: proof.reason || proof.message || 'The connected wallet must control this valid inscription.' }, { status: 422 });
    const uri = metadataUri(input.inscribedMint);
    const proxy = await checkMetadataProxy(uri, imageUri(input.inscribedMint));
    if (!proxy.ready) return Response.json({ error: proxy.message }, { status: 422 });
    const balance = (await rpcRequest(rpcUrl, 'getBalance', [walletAddress, { commitment: 'confirmed' }])).value;
    if (balance < 30_000_000) return Response.json({ error: 'This wallet needs at least 0.03 SOL for launch rent and network fees.' }, { status: 422 });
    const wallet = new PublicKey(walletAddress);
    const walletBytes = parseWallet(secrets.get('MINT_WALLET_SECRET_KEY'));
    const mint = await launchMint(walletBytes, walletAddress, input);
    const onlineSdk = new OnlinePumpSdk(new Connection(rpcUrl, 'confirmed'));
    const quote = await onlineSdk.resolveQuoteMint(solMint);
    const instruction = await PUMP_SDK.createV2Instruction({ mint: mint.publicKey, name: input.name, symbol: input.symbol, uri, creator: wallet, user: wallet, quoteMint: quote.mint, quoteTokenProgram: quote.quoteTokenProgram, creatorFeeBps: new BN(0), holderReward: false, mayhemMode: false });
    const latest = (await rpcRequest(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
    const message = new TransactionMessage({ payerKey: wallet, recentBlockhash: latest.blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }), instruction] }).compileToV0Message();
    const transaction = new VersionedTransaction(message);
    transaction.sign([mint]);
    const encoded = Buffer.from(transaction.serialize()).toString('base64');
    const simulation = (await rpcRequest(rpcUrl, 'simulateTransaction', [encoded, { encoding: 'base64', commitment: 'confirmed', sigVerify: false }])).value;
    if (simulation.err) return Response.json({ error: `Launch simulation failed: ${JSON.stringify(simulation.err)}` }, { status: 422 });
    return Response.json({ transaction: encoded, coinMint: mint.publicKey.toBase58(), bondingCurve: bondingCurvePda(mint.publicKey).toBase58(), lastValidBlockHeight: latest.lastValidBlockHeight });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to prepare the public launch.' }, { status: 500 });
  }
}