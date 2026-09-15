import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { Buffer } from 'node:buffer';
import { Connection, Keypair, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { createUmi } from 'npm:@metaplex-foundation/umi-bundle-defaults@0.9.2';
import { createSignerFromKeypair, publicKey, signerIdentity } from 'npm:@metaplex-foundation/umi@0.9.2';
import { mplTokenMetadata } from 'npm:@metaplex-foundation/mpl-token-metadata@3.4.0';
import { mplInscription } from 'npm:@metaplex-foundation/mpl-inscription@0.8.1';
import { accountData, assertMainnet, deterministicSigner, parseWallet } from '../../shared/mintWallet.ts';
import { appendImageChunk, inscriptionAddresses, parseChunk, prepareInscription, writeChunkBytes } from '../../shared/inscriptionWriter.ts';
import { estimateTokenMintBytes, launchKeypairs, runLaunchSteps, withdrawVault } from '../../shared/token2022Launch.ts';

const maxImageBytes = 1024 * 1024;
const mimeTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const lamportsPerByteYear = 3480;
const rent = bytes => (bytes + 128) * lamportsPerByteYear * 2;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const input = await req.json();
    const launches = base44.asServiceRole.entities.Launch;

    if (input.action === 'estimate') {
      const totalSize = Number(input.totalSize) || 0;
      const chunks = Math.ceil(totalSize / writeChunkBytes);
      const metadataBytes = Buffer.byteLength(JSON.stringify({ name: input.name || '', symbol: input.symbol || '', description: input.description || '', token_mint: 'x'.repeat(44) }));
      const nftRent = rent(82) + rent(679) + rent(165) + rent(282);
      const inscriptionRent = rent(metadataBytes) + rent(300) + rent(totalSize);
      const tokenRent = rent(estimateTokenMintBytes({ name: input.name || '', symbol: input.symbol || '' })) + rent(170);
      const setupTransactions = 10;
      const fees = (chunks + setupTransactions) * 5000;
      return Response.json({ chunks, setupTransactions, nftRent, inscriptionRent, tokenRent, fees, total: nftRent + inscriptionRent + tokenRent + fees });
    }

    const rpcUrl = secrets.get('SOLANA_RPC_URL');
    await assertMainnet(rpcUrl);
    const walletBytes = parseWallet(secrets.get('MINT_WALLET_SECRET_KEY'));
    const umi = createUmi(rpcUrl).use(mplTokenMetadata()).use(mplInscription());
    umi.use(signerIdentity(createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSecretKey(walletBytes))));
    const connection = new Connection(rpcUrl, 'confirmed');
    const wallet = Keypair.fromSecretKey(walletBytes);

    if (input.action === 'create') {
      const name = String(input.name || '').trim();
      const symbol = String(input.symbol || '').trim().toUpperCase();
      const description = String(input.description || '').trim();
      const supply = Number(input.supply);
      const priceLamports = Number(input.priceLamports);
      const totalSize = Number(input.totalSize);
      if (!name || name.length > 32 || !symbol || symbol.length > 10 || !description || description.length > 1000) return Response.json({ error: 'Use a name up to 32 characters, ticker up to 10, and description up to 1,000.' }, { status: 400 });
      if (!Number.isInteger(supply) || supply < 1 || supply > 1e12) return Response.json({ error: 'Supply must be a whole number of tokens up to 1 trillion.' }, { status: 400 });
      if (!Number.isInteger(priceLamports) || priceLamports < 1) return Response.json({ error: 'Set a price of at least 1 lamport per token.' }, { status: 400 });
      if (!Number.isInteger(totalSize) || totalSize < 1 || totalSize > maxImageBytes || !mimeTypes.includes(input.mimeType) || !/^[0-9a-f]{64}$/.test(String(input.imageHash || ''))) return Response.json({ error: 'Upload a PNG, JPEG, GIF, or WebP image of 1 MB or smaller.' }, { status: 400 });
      const created = await launches.create({ name, symbol, description, decimals: 6, supply, priceLamports, imageMime: input.mimeType, imageSize: totalSize, imageHash: input.imageHash, status: 'preparing' });
      const keys = await launchKeypairs(walletBytes, created.id);
      const nftMint = publicKey(keys.inscriptionNft.publicKey.toBase58());
      const umiAddresses = inscriptionAddresses(umi, nftMint);
      const launch = await launches.update(created.id, { tokenMint: keys.tokenMint.publicKey.toBase58(), nftMint: nftMint.toString(), inscriptionAccount: umiAddresses.inscriptionAccount[0].toString(), imageAccount: umiAddresses.associatedInscriptionAccount[0].toString(), vaultAddress: keys.vault.publicKey.toBase58() });
      return Response.json(launch);
    }

    const launch = await launches.get(String(input.launchId || '')).catch(() => null);
    if (!launch) return Response.json({ error: 'Launch not found.' }, { status: 404 });
    const keys = await launchKeypairs(walletBytes, launch.id);
    if (keys.tokenMint.publicKey.toBase58() !== launch.tokenMint) return Response.json({ error: 'This launch was created with a different server wallet.' }, { status: 409 });

    if (input.action === 'status') {
      const image = await accountData(rpcUrl, launch.imageAccount);
      const vaultLamports = await connection.getBalance(new PublicKey(launch.vaultAddress), 'confirmed');
      return Response.json({ launch, writtenBytes: image ? image.length : 0, vaultLamports });
    }

    if (input.action === 'prepare') {
      const mintSigner = await deterministicSigner(umi, `inscription:${launch.tokenMint}`, walletBytes);
      const result = await prepareInscription(umi, rpcUrl, { mintSigner, name: launch.name, symbol: launch.symbol, metadata: { name: launch.name, symbol: launch.symbol, description: launch.description, token_mint: launch.tokenMint } });
      return Response.json({ ...result, batchBytes: writeChunkBytes });
    }

    if (input.action === 'append') {
      const chunk = parseChunk(input, maxImageBytes);
      if (chunk.error) return Response.json({ error: chunk.error }, { status: 400 });
      if (chunk.totalSize !== launch.imageSize) return Response.json({ error: 'This image does not match the size recorded for the launch.' }, { status: 400 });
      const writtenEnd = await appendImageChunk(umi, rpcUrl, { mintKey: publicKey(launch.nftMint), offset: chunk.offset, bytes: chunk.bytes });
      return Response.json({ nextOffset: writtenEnd, complete: writtenEnd === launch.imageSize });
    }

    if (input.action === 'verify') {
      const bytes = await accountData(rpcUrl, launch.imageAccount);
      if (!bytes || bytes.length !== launch.imageSize) return Response.json({ error: `Only ${bytes ? bytes.length : 0} of ${launch.imageSize} bytes are on-chain. Resume the inscription.` }, { status: 409 });
      const hash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
      if (hash !== launch.imageHash) return Response.json({ error: 'The on-chain bytes do not hash to the uploaded image. Do not create another launch; resume this one.' }, { status: 409 });
      const updated = launch.status === 'preparing' ? await launches.update(launch.id, { status: 'inscribed' }) : launch;
      return Response.json({ hash, launch: updated });
    }

    if (input.action === 'launch') {
      if (launch.status === 'preparing') return Response.json({ error: 'Verify the inscription before launching the token.' }, { status: 409 });
      const state = await runLaunchSteps(connection, wallet, keys.tokenMint, launch);
      const updated = launch.status === 'inscribed' ? await launches.update(launch.id, { status: 'launched', launchStep: 'complete' }) : launch;
      return Response.json({ state: { ...state, supply: state.supply.toString() }, launch: updated });
    }

    if (input.action === 'openSale' || input.action === 'closeSale') {
      if (launch.status === 'preparing' || launch.status === 'inscribed') return Response.json({ error: 'Launch the token before managing its sale.' }, { status: 409 });
      return Response.json(await launches.update(launch.id, { status: input.action === 'openSale' ? 'on_sale' : 'closed' }));
    }

    if (input.action === 'withdraw') {
      const amount = await withdrawVault(connection, keys.vault, wallet.publicKey);
      const updated = await launches.update(launch.id, { withdrawnLamports: (launch.withdrawnLamports || 0) + amount });
      return Response.json({ amount, launch: updated });
    }
    return Response.json({ error: 'Invalid launch action.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || 'Launch failed.' }, { status: 500 });
  }
}