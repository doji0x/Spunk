import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { Connection, Keypair } from 'npm:@solana/web3.js@1.98.4';
import { assertMainnet, mintPattern, parseWallet, signaturePattern } from '../../shared/mintWallet.ts';
import { launchKeypairs, transferLaunchTokens } from '../../shared/token2022Launch.ts';

const publicView = launch => ({ id: launch.id, name: launch.name, symbol: launch.symbol, description: launch.description, status: launch.status, priceLamports: launch.priceLamports, supply: launch.supply, soldTokens: launch.soldTokens || 0, remaining: launch.supply - (launch.soldTokens || 0), vaultAddress: launch.vaultAddress, tokenMint: launch.tokenMint, nftMint: launch.nftMint });

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const input = await req.json();
    const launches = base44.asServiceRole.entities.Launch;
    const purchases = base44.asServiceRole.entities.Purchase;
    const launch = await launches.get(String(input.launchId || '')).catch(() => null);
    if (!launch || !launch.tokenMint) return Response.json({ error: 'Launch not found.' }, { status: 404 });

    if (input.action === 'quote') return Response.json(publicView(launch));

    if (input.action === 'claim') {
      const buyer = String(input.buyer || '').trim();
      const signature = String(input.signature || '').trim();
      if (!mintPattern.test(buyer) || !signaturePattern.test(signature)) return Response.json({ error: 'Enter a valid wallet address and transaction signature.' }, { status: 400 });
      if (launch.status !== 'on_sale') return Response.json({ error: 'This sale is not open.' }, { status: 409 });
      const [existing] = await purchases.filter({ signature });
      if (existing?.status === 'delivered') return Response.json({ error: 'This payment was already redeemed.' }, { status: 409 });
      const rpcUrl = secrets.get('SOLANA_RPC_URL');
      await assertMainnet(rpcUrl);
      const connection = new Connection(rpcUrl, 'confirmed');
      const tx = await connection.getParsedTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      if (!tx) return Response.json({ error: 'Payment transaction not found yet. Wait for confirmation and try again.' }, { status: 404 });
      if (tx.meta?.err) return Response.json({ error: 'The payment transaction failed on-chain.' }, { status: 400 });
      const keysList = tx.transaction.message.accountKeys;
      if (!keysList.some(key => key.signer && key.pubkey.toBase58() === buyer)) return Response.json({ error: 'The payment was not signed by that wallet.' }, { status: 400 });
      const vaultIndex = keysList.findIndex(key => key.pubkey.toBase58() === launch.vaultAddress);
      const lamports = vaultIndex === -1 ? 0 : tx.meta.postBalances[vaultIndex] - tx.meta.preBalances[vaultIndex];
      if (lamports < launch.priceLamports) return Response.json({ error: 'The payment did not send enough SOL to the sale vault for one token.' }, { status: 400 });
      const remaining = launch.supply - (launch.soldTokens || 0);
      if (remaining <= 0) { await launches.update(launch.id, { status: 'closed' }); return Response.json({ error: 'The sale is sold out.' }, { status: 409 }); }
      const tokens = Math.min(Math.floor(lamports / launch.priceLamports), remaining);
      const purchase = existing || await purchases.create({ launchId: launch.id, signature, buyer, lamports, tokens, status: 'pending' });
      const walletBytes = parseWallet(secrets.get('MINT_WALLET_SECRET_KEY'));
      const wallet = Keypair.fromSecretKey(walletBytes);
      const keys = await launchKeypairs(walletBytes, launch.id);
      if (keys.tokenMint.publicKey.toBase58() !== launch.tokenMint) throw new Error('Launch wallet mismatch.');
      let transferSignature;
      try {
        transferSignature = await transferLaunchTokens(connection, wallet, launch.tokenMint, buyer, purchase.tokens);
      } catch (error) {
        await purchases.update(purchase.id, { status: 'failed' });
        throw error;
      }
      await purchases.update(purchase.id, { status: 'delivered', transferSignature: transferSignature || '' });
      const soldTokens = (launch.soldTokens || 0) + purchase.tokens;
      await launches.update(launch.id, { soldTokens, proceedsLamports: (launch.proceedsLamports || 0) + purchase.lamports, status: soldTokens >= launch.supply ? 'closed' : launch.status });
      return Response.json({ tokens: purchase.tokens, transferSignature: transferSignature || '' });
    }
    return Response.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || 'Purchase failed.' }, { status: 500 });
  }
}