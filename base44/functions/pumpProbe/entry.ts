import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { Buffer } from 'node:buffer';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { accountData } from '../../shared/mintWallet.ts';
import { resolveNetwork, solanaNetwork } from '../../shared/solanaNetwork.ts';
import { bindingUri, buyPumpCoin, createPumpCoin, curveState, migratePumpCoin, pumpGlobal } from '../../shared/pumpLaunch.ts';

const maxAirdropSol = 2;
const maxBuySol = 5;

function logStep(launch, step, sent, lamports = 0) {
  return [...(launch.probeLog || []), { step, signature: sent.signature, lamports, fee: sent.fee, computeUnits: sent.computeUnits, at: new Date().toISOString() }];
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const input = await req.json();
    const launches = base44.asServiceRole.entities.Launch;

    // Reports the configured cluster without requiring the devnet secrets to be present.
    if (input.action === 'env') {
      const network = solanaNetwork();
      if (network !== 'devnet') return Response.json({ network, isDevnet: false, message: 'Set the SOLANA_NETWORK secret to devnet to enable the probe.' });
      const { rpcUrl, walletBytes } = await resolveNetwork();
      const connection = new Connection(rpcUrl, 'confirmed');
      const wallet = Keypair.fromSecretKey(walletBytes);
      const balance = await connection.getBalance(wallet.publicKey, 'confirmed');
      const holderRewardsEnabled = await pumpGlobal(connection).then(() => true).catch(() => false);
      return Response.json({ network, isDevnet: true, wallet: wallet.publicKey.toBase58(), balance, holderRewardsEnabled });
    }

    const { network, rpcUrl, walletBytes, isDevnet } = await resolveNetwork();
    if (!isDevnet) return Response.json({ error: 'The probe only runs while SOLANA_NETWORK is devnet.' }, { status: 409 });
    const connection = new Connection(rpcUrl, 'confirmed');
    const wallet = Keypair.fromSecretKey(walletBytes);

    if (input.action === 'airdrop') {
      const sol = Math.min(Number(input.sol) || 1, maxAirdropSol);
      const signature = await connection.requestAirdrop(wallet.publicKey, Math.round(sol * LAMPORTS_PER_SOL));
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
      return Response.json({ signature, balance: await connection.getBalance(wallet.publicKey, 'confirmed') });
    }

    const launch = await launches.get(String(input.launchId || '')).catch(() => null);
    if (!launch) return Response.json({ error: 'Launch not found.' }, { status: 404 });

    if (input.action === 'create') {
      if (launch.pumpMint) return Response.json({ error: 'This launch already has a pump.fun coin. Continue the probe instead of creating another.' }, { status: 409 });
      if (!launch.nftMint || !launch.imageAccount) return Response.json({ error: 'Inscribe the companion image NFT before creating the pump.fun coin.' }, { status: 409 });
      const initialBuyLamports = Math.round(Math.min(Number(input.initialBuySol) || 0, maxBuySol) * LAMPORTS_PER_SOL);
      const uri = bindingUri(launch);
      const mintKeypair = Keypair.generate();
      const sent = await createPumpCoin(connection, wallet, mintKeypair, { name: launch.name, symbol: launch.symbol, uri, initialBuyLamports });
      const updated = await launches.update(launch.id, { network, pumpMint: sent.mint, pumpBondingCurve: sent.bondingCurve, pumpUri: uri, status: 'on_curve', probeLog: logStep(launch, 'create_v2', sent, initialBuyLamports) });
      return Response.json({ ...sent, launch: updated, curve: await curveState(connection, sent.mint) });
    }

    if (!launch.pumpMint) return Response.json({ error: 'Create the pump.fun coin for this launch first.' }, { status: 409 });

    if (input.action === 'buy') {
      const lamports = Math.round(Math.min(Number(input.sol) || 0.5, maxBuySol) * LAMPORTS_PER_SOL);
      if (lamports < 1) return Response.json({ error: 'Enter a buy amount above zero.' }, { status: 400 });
      const sent = await buyPumpCoin(connection, wallet, launch.pumpMint, lamports);
      const curve = await curveState(connection, launch.pumpMint);
      const updated = await launches.update(launch.id, { probeLog: logStep(launch, 'buy_v2', sent, lamports) });
      return Response.json({ ...sent, curve, launch: updated });
    }

    if (input.action === 'graduate') {
      const curve = await curveState(connection, launch.pumpMint);
      if (!curve?.complete) return Response.json({ error: 'The bonding curve has not completed yet. Keep buying until it does.' }, { status: 409 });
      const sent = await migratePumpCoin(connection, wallet, launch.pumpMint);
      const pool = await pumpGlobal(connection).then(({ sdk }) => sdk.fetchPool?.(new PublicKey(launch.pumpMint))).catch(() => null);
      const updated = await launches.update(launch.id, { status: 'graduated', pumpPoolAddress: pool?.address?.toString() || pool?.publicKey?.toString() || null, probeLog: logStep(launch, 'migrate', sent) });
      return Response.json({ ...sent, launch: updated });
    }

    if (input.action === 'report') {
      const curve = await curveState(connection, launch.pumpMint);
      const bytes = await accountData(rpcUrl, launch.imageAccount);
      const hash = bytes ? Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex') : null;
      const signatures = await connection.getSignaturesForAddress(wallet.publicKey, { limit: 10 }, 'confirmed');
      const spent = (launch.probeLog || []).reduce((total, entry) => total + (entry.lamports || 0) + (entry.fee || 0), 0);
      return Response.json({
        network,
        launch,
        curve,
        bindingVerified: Boolean(hash) && hash === launch.imageHash,
        onChainBytes: bytes ? bytes.length : 0,
        expectedBytes: launch.imageSize,
        walletBalance: await connection.getBalance(wallet.publicKey, 'confirmed'),
        totalSpentLamports: spent,
        totalComputeUnits: (launch.probeLog || []).reduce((total, entry) => total + (entry.computeUnits || 0), 0),
        recentSignatures: signatures.map(item => ({ signature: item.signature, slot: item.slot, err: item.err ? 'failed' : null }))
      });
    }
    return Response.json({ error: 'Invalid probe action.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || 'The devnet probe failed.' }, { status: 500 });
  }
}