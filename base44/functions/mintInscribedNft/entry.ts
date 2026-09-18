import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { Buffer } from 'node:buffer';
import { parseWallet, assertMainnet, rpcRequest, getLatestBlockhash } from '../../shared/mintWallet.ts';
import { recoverableMintSigner, chunkMatches } from './recovery.ts';
import { mintInscriptionFormat, storedInscriptionTag } from './inscriptionFormat.ts';
import { preparePublicMintPayment, verifyPublicMintPayment } from './publicPayment.ts';
import { createUmi } from 'npm:@metaplex-foundation/umi-bundle-defaults@0.9.2';
import { createSignerFromKeypair, generateSigner, percentAmount, publicKey, signerIdentity, TransactionBuilder } from 'npm:@metaplex-foundation/umi@0.9.2';
import 'npm:@metaplex-foundation/umi@0.9.2/serializers';
import { createV1, findMasterEditionPda, mintV1, mplTokenMetadata, printV1, TokenStandard, transferV1 } from 'npm:@metaplex-foundation/mpl-token-metadata@3.4.0';
import { findAssociatedTokenPda } from 'npm:@metaplex-foundation/mpl-toolbox@0.9.4';
import { findAssociatedInscriptionPda, findInscriptionMetadataPda, findMintInscriptionPda, initializeAssociatedInscription, initializeFromMint, mplInscription, writeData } from 'npm:@metaplex-foundation/mpl-inscription@0.8.1';

const maxImageBytes = 1024 * 1024;
const writeChunkBytes = 800;
const batchBytes = writeChunkBytes;
const mintPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isSupportedImage(bytes, mimeType) {
  if (mimeType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mimeType === 'image/gif') return bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString());
  if (mimeType === 'image/webp') return bytes.length >= 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  return false;
}

async function accountExists(rpcUrl, address) {
  const result = await rpcRequest(rpcUrl, 'getAccountInfo', [address, { commitment: 'confirmed', encoding: 'base64' }]);
  return Boolean(result?.value);
}

async function accountData(rpcUrl, address) {
  const result = await rpcRequest(rpcUrl, 'getAccountInfo', [address, { commitment: 'confirmed', encoding: 'base64' }]);
  return result?.value?.data?.[0] ? Buffer.from(result.value.data[0], 'base64') : null;
}

async function accountDataLength(rpcUrl, address) {
  return (await accountData(rpcUrl, address))?.length || 0;
}

async function tokenBalance(rpcUrl, tokenAccount) {
  const result = await rpcRequest(rpcUrl, 'getAccountInfo', [tokenAccount, { commitment: 'confirmed', encoding: 'jsonParsed' }]);
  return result?.value?.data?.parsed?.info?.tokenAmount?.amount === '1';
}

async function tokenHasSupply(rpcUrl, mint) {
  const result = await rpcRequest(rpcUrl, 'getTokenSupply', [mint, { commitment: 'confirmed' }]);
  return result?.value?.amount === '1';
}

async function masterEditionState(rpcUrl, address) {
  const result = await rpcRequest(rpcUrl, 'getAccountInfo', [address, { commitment: 'confirmed', encoding: 'base64' }]);
  if (!result?.value?.data?.[0]) return null;
  const data = Buffer.from(result.value.data[0], 'base64');
  return { supply: data.readBigUInt64LE(1), maxSupply: data[9] === 1 ? data.readBigUInt64LE(10) : null };
}

async function deterministicEditionSigner(umi, mintAddress, walletBytes) {
  const material = Buffer.concat([Buffer.from('master-edition-1:'), Buffer.from(mintAddress), Buffer.from(walletBytes)]);
  const seed = new Uint8Array(await crypto.subtle.digest('SHA-256', material));
  return createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSeed(seed));
}

async function sendWithFreshBlockhash(builder, umi, isApplied = null) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (isApplied && await isApplied()) return;
      // setBlockhash returns a new builder; sendAndConfirm rebuilds and signs it.
      const freshBuilder = builder.setBlockhash(await getLatestBlockhash(umi));
      const response = await freshBuilder.sendAndConfirm(umi, { send: { skipPreflight: true, maxRetries: 0 }, confirm: { commitment: 'confirmed' } });
      if (response.result?.value?.err) throw new Error(`Transaction failed: ${JSON.stringify(response.result.value.err)}`);
      return response;
    } catch (error) {
      if (isApplied) {
        try {
          if (await isApplied()) return;
        } catch {
          // Preserve the transaction error when the state check is temporarily unavailable.
        }
      }
      const message = error instanceof Error ? error.message : String(error);
      const expired = /block\s*height exceeded|blockhash not found|blockhash.*expired|signature .* expired|TransactionExpiredBlockheightExceededError/i.test(message);
      if (!expired || attempt === 2) throw error;
    }
  }
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const input = await req.json();
    const rpcUrl = secrets.get('SOLANA_RPC_URL');
    await assertMainnet(rpcUrl);
    const umi = createUmi(rpcUrl).use(mplTokenMetadata()).use(mplInscription());
    const walletBytes = parseWallet(secrets.get('MINT_WALLET_SECRET_KEY'));
    const wallet = umi.eddsa.createKeypairFromSecretKey(walletBytes);
    umi.use(signerIdentity(createSignerFromKeypair(umi, wallet)));
    if (input.action === 'publicQuote') {
      const quote = await preparePublicMintPayment(rpcUrl, String(input.walletAddress || ''), umi.identity.publicKey.toString(), String(input.requestId || ''), String(input.sessionHash || ''), Number(input.totalSize));
      return Response.json(quote);
    }
    const user = await base44.auth.me().catch(() => null);
    const isAdmin = user?.role === 'admin';
    const publicActions = ['start', 'append', 'finalize', 'transfer'];
    let publicWallet = '';
    if (!isAdmin) {
      if (!publicActions.includes(input.action)) return Response.json({ error: user ? 'Forbidden' : 'Unauthorized' }, { status: user ? 403 : 401 });
      const authorization = await verifyPublicMintPayment(rpcUrl, umi.identity.publicKey.toString(), input);
      publicWallet = authorization.walletAddress;
      if (input.action === 'start' && input.mint) return Response.json({ error: 'Public recovery is limited to the saved inscription attempt.' }, { status: 400 });
    }

    if (input.action === 'start' || input.action === 'startBackground') {
      const background = input.action === 'startBackground';
      const name = String(input.name || '').trim();
      const symbol = String(input.symbol || '').trim().toUpperCase();
      const description = String(input.details || '').trim();
      const totalSize = Number(input.totalSize);
      const imageUri = background ? String(input.imageUri || '').trim() : '';
      if (background && (!imageUri || imageUri.length > 1000)) return Response.json({ error: 'A private source image is required for background minting.' }, { status: 400 });
      if (!name || name.length > 32 || !symbol || symbol.length > 10 || !description || description.length > 1000) return Response.json({ error: 'Use a name up to 32 characters, ticker up to 10, and details up to 1,000.' }, { status: 400 });
      if (!Number.isInteger(totalSize) || totalSize < 1 || totalSize > maxImageBytes) return Response.json({ error: 'The image must be 1 MB or smaller.' }, { status: 400 });
      if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(input.mimeType)) return Response.json({ error: 'Use a PNG, JPEG, GIF, or WebP image.' }, { status: 400 });
      if (input.requestId !== undefined && (typeof input.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.requestId))) return Response.json({ error: 'Invalid mint recovery identifier.' }, { status: 400 });
      let mintSigner = null;
      let mintKey;
      if (input.mint) {
        const existingMint = String(input.mint).trim();
        if (!mintPattern.test(existingMint) || !await accountExists(rpcUrl, existingMint)) return Response.json({ error: 'The existing mint account was not found.' }, { status: 400 });
        mintKey = publicKey(existingMint);
      } else {
        mintSigner = await recoverableMintSigner(umi, walletBytes, input.requestId);
        mintKey = mintSigner.publicKey;
      }
      const mintAddress = mintKey.toString();
      const inscriptionAccount = await findMintInscriptionPda(umi, { mint: mintKey });
      const inscriptionMetadataAccount = await findInscriptionMetadataPda(umi, { inscriptionAccount: inscriptionAccount[0] });
      const mintExists = await accountExists(rpcUrl, mintAddress);
      const { tag, uri } = await mintInscriptionFormat(umi, rpcUrl, mintKey, mintExists);
      const associatedInscriptionAccount = findAssociatedInscriptionPda(umi, { associated_tag: tag, inscriptionMetadataAccount });
      if (mintSigner && !mintExists) {
        await sendWithFreshBlockhash(createV1(umi, { mint: mintSigner, name, symbol, uri, sellerFeeBasisPoints: percentAmount(0), tokenStandard: TokenStandard.NonFungible, printSupply: { __kind: 'Limited', fields: [1n] } }), umi, () => accountExists(rpcUrl, mintAddress));
      }
      if (!await tokenHasSupply(rpcUrl, mintAddress)) {
        await sendWithFreshBlockhash(mintV1(umi, { mint: mintKey, authority: umi.identity, amount: 1, tokenOwner: umi.identity.publicKey, tokenStandard: TokenStandard.NonFungible }), umi, () => tokenHasSupply(rpcUrl, mintAddress));
      }
      if (!await accountExists(rpcUrl, inscriptionAccount[0].toString())) {
        await sendWithFreshBlockhash(initializeFromMint(umi, { mintAccount: mintKey }), umi, () => accountExists(rpcUrl, inscriptionAccount[0].toString()));
      }
      const metadata = Buffer.from(JSON.stringify({ name, symbol, description, imageSize: totalSize, imageMime: input.mimeType }));
      if (!await accountExists(rpcUrl, associatedInscriptionAccount[0].toString())) {
        const builder = new TransactionBuilder()
          .add(writeData(umi, { inscriptionAccount, inscriptionMetadataAccount, value: metadata, associatedTag: null, offset: 0 }))
          .add(initializeAssociatedInscription(umi, { inscriptionAccount, inscriptionMetadataAccount, associatedInscriptionAccount, associationTag: tag }));
        await sendWithFreshBlockhash(builder, umi, () => accountExists(rpcUrl, associatedInscriptionAccount[0].toString()));
      }
      const currentMetadata = await accountData(rpcUrl, inscriptionAccount[0].toString());
      if (currentMetadata) {
        const value = metadata.length < currentMetadata.length ? Buffer.concat([metadata, Buffer.alloc(currentMetadata.length - metadata.length, 32)]) : metadata;
        if (!currentMetadata.equals(value)) for (let offset = 0; offset < value.length; offset += writeChunkBytes) {
          const chunk = new Uint8Array(value.subarray(offset, offset + writeChunkBytes));
          const applied = () => chunkMatches(rpcUrl, inscriptionAccount[0].toString(), offset, chunk);
          if (!await applied()) await sendWithFreshBlockhash(writeData(umi, { inscriptionAccount, inscriptionMetadataAccount, value: chunk, associatedTag: null, offset }), umi, applied);
        }
      }
      const masterEditionAccount = findMasterEditionPda(umi, { mint: mintKey });
      const editionState = await masterEditionState(rpcUrl, masterEditionAccount[0].toString());
      const writtenBytes = await accountDataLength(rpcUrl, associatedInscriptionAccount[0].toString());
      const prepared = { mint: mintAddress, owner: umi.identity.publicKey.toString(), batchBytes, writtenBytes, gatewayUrl: uri, prepared: true, maxSupply: editionState?.maxSupply?.toString() ?? null, supply: editionState?.supply?.toString() ?? null };
      if (!background) return Response.json(prepared);
      const recordData = { mint: mintAddress, requestId: input.requestId, name, symbol, description, owner: prepared.owner, status: 'in_progress', errorMessage: '', imageUri, totalSize, imageMime: input.mimeType, batchBytes, offset: 0, confirmedOffsets: [], ...(prepared.maxSupply === null ? {} : { maxSupply: prepared.maxSupply }) };
      const matches = await base44.asServiceRole.entities.MintRecord.filter({ requestId: input.requestId });
      const job = matches[0] ? await base44.asServiceRole.entities.MintRecord.update(matches[0].id, recordData) : await base44.asServiceRole.entities.MintRecord.create(recordData);
      return Response.json({ ...prepared, job });
    }

    if (input.action === 'updateMetadata') {
      const mint = String(input.mint || '').trim();
      const name = String(input.name || '').trim();
      const symbol = String(input.symbol || '').trim().toUpperCase();
      const description = String(input.description || '').trim();
      if (!mintPattern.test(mint) || !await accountExists(rpcUrl, mint)) return Response.json({ error: 'The mint account was not found.' }, { status: 400 });
      if (!name || name.length > 32 || !symbol || symbol.length > 10 || !description || description.length > 1000) return Response.json({ error: 'Use a name up to 32 characters, ticker up to 10, and details up to 1,000.' }, { status: 400 });
      const mintKey = publicKey(mint);
      if (!await storedInscriptionTag(rpcUrl, mintKey)) return Response.json({ error: 'No supported image inscription is linked to this mint.' }, { status: 409 });
      const inscriptionAccount = await findMintInscriptionPda(umi, { mint: mintKey });
      const inscriptionMetadataAccount = await findInscriptionMetadataPda(umi, { inscriptionAccount: inscriptionAccount[0] });
      const address = inscriptionAccount[0].toString();
      const current = await accountData(rpcUrl, address);
      if (!current) return Response.json({ error: 'The on-chain metadata inscription was not found.' }, { status: 409 });
      let progressFields = {};
      try {
        const stored = JSON.parse(current.toString().trim());
        if (Number.isInteger(stored.imageSize) && stored.imageSize > 0) progressFields = { imageSize: stored.imageSize, imageMime: stored.imageMime };
      } catch { /* Older metadata may not include inscription progress fields. */ }
      const encoded = Buffer.from(JSON.stringify({ name, symbol, description, ...progressFields }));
      const value = encoded.length < current.length ? Buffer.concat([encoded, Buffer.alloc(current.length - encoded.length, 32)]) : encoded;
      for (let offset = 0; offset < value.length; offset += writeChunkBytes) {
        const chunk = new Uint8Array(value.subarray(offset, offset + writeChunkBytes));
        const applied = () => chunkMatches(rpcUrl, address, offset, chunk);
        if (!await applied()) await sendWithFreshBlockhash(writeData(umi, { inscriptionAccount, inscriptionMetadataAccount, value: chunk, associatedTag: null, offset }), umi, applied);
      }
      const saved = await accountData(rpcUrl, address);
      if (!saved || !saved.equals(value)) throw new Error('The metadata write did not fully confirm. Try re-uploading it again.');
      return Response.json({ mint, name, symbol, description, updated: true });
    }

    if (input.action === 'finalize') {
      const mint = String(input.mint || '').trim();
      if (!mintPattern.test(mint) || !await accountExists(rpcUrl, mint)) return Response.json({ error: 'The mint account was not found.' }, { status: 400 });
      const mintKey = publicKey(mint);
      const masterEditionAccount = findMasterEditionPda(umi, { mint: mintKey });
      let editionState = await masterEditionState(rpcUrl, masterEditionAccount[0].toString());
      if (!editionState || editionState.maxSupply !== 1n) return Response.json({ error: 'The image is embedded, but this existing mint cannot be changed to Master Edition maxSupply 1.' }, { status: 409 });
      const editionSigner = await deterministicEditionSigner(umi, mint, walletBytes);
      if (editionState.supply === 0n) {
        const masterTokenAccount = findAssociatedTokenPda(umi, { mint: mintKey, owner: umi.identity.publicKey });
        if (!await tokenBalance(rpcUrl, masterTokenAccount[0].toString())) {
          return Response.json({ error: `The image remains inscribed, but the mint wallet no longer holds the original NFT, so it cannot print the final edition. The NFT must be returned to ${umi.identity.publicKey} before resuming. If the recipient cannot authorize a return, this mint cannot be finalized by this wallet.` }, { status: 409 });
        }
        const builder = printV1(umi, { masterEditionMint: mintKey, masterTokenAccountOwner: umi.identity, editionMint: editionSigner, editionTokenAccountOwner: umi.identity.publicKey, editionNumber: 1n, tokenStandard: TokenStandard.NonFungible });
        if (input.simulate === true) {
          const transaction = await builder.setBlockhash(await getLatestBlockhash(umi)).buildAndSign(umi);
          const encoded = Buffer.from(umi.transactions.serialize(transaction)).toString('base64');
          const simulation = await rpcRequest(rpcUrl, 'simulateTransaction', [encoded, { encoding: 'base64', commitment: 'confirmed', replaceRecentBlockhash: true, sigVerify: false }]);
          return Response.json({ simulated: true, error: simulation.value.err, logs: simulation.value.logs });
        }
        await sendWithFreshBlockhash(builder, umi, async () => (await masterEditionState(rpcUrl, masterEditionAccount[0].toString()))?.supply === 1n);
        editionState = await masterEditionState(rpcUrl, masterEditionAccount[0].toString());
      }
      if (editionState.supply !== 1n) throw new Error('Master Edition print supply did not finalize at 1. Resume this mint; do not create another.');
      return Response.json({ editionMint: editionSigner.publicKey.toString(), maxSupply: '1', supply: '1' });
    }

    if (input.action === 'transfer') {
      const mint = String(input.mint || '').trim();
      const destination = (publicWallet || String(input.destination || '')).trim();
      if (!mintPattern.test(mint) || !mintPattern.test(destination)) return Response.json({ error: 'Invalid mint or destination address.' }, { status: 400 });
      const mintKey = publicKey(mint);
      const destinationKey = publicKey(destination);
      const destinationToken = findAssociatedTokenPda(umi, { mint: mintKey, owner: destinationKey });
      const delivered = () => tokenBalance(rpcUrl, destinationToken[0].toString());
      if (!await delivered()) {
        await sendWithFreshBlockhash(transferV1(umi, { mint: mintKey, authority: umi.identity, tokenOwner: umi.identity.publicKey, destinationOwner: destinationKey, tokenStandard: TokenStandard.NonFungible }), umi, delivered);
      }
      if (!await delivered()) throw new Error('The transfer did not confirm.');
      return Response.json({ mint, destination, destinationToken: destinationToken[0].toString() });
    }

    if (input.action === 'append') {
      const mint = String(input.mint || '');
      const offset = Number(input.offset);
      const totalSize = Number(input.totalSize);
      if (!mintPattern.test(mint) || !Number.isInteger(offset) || offset < 0 || offset % writeChunkBytes !== 0) return Response.json({ error: 'Invalid inscription progress.' }, { status: 400 });
      if (!Number.isInteger(totalSize) || totalSize < 1 || totalSize > maxImageBytes || typeof input.data !== 'string' || input.data.length > 9000) return Response.json({ error: 'Invalid image batch.' }, { status: 400 });
      const bytes = Buffer.from(input.data, 'base64');
      if (!bytes.length || bytes.length > batchBytes || offset + bytes.length > totalSize) return Response.json({ error: 'Invalid image batch.' }, { status: 400 });
      if (offset === 0 && !isSupportedImage(bytes, input.mimeType)) return Response.json({ error: 'The image contents do not match its file type.' }, { status: 400 });
      const mintKey = publicKey(mint);
      const inscriptionAccount = await findMintInscriptionPda(umi, { mint: mintKey });
      const inscriptionMetadataAccount = await findInscriptionMetadataPda(umi, { inscriptionAccount: inscriptionAccount[0] });
      const tag = await storedInscriptionTag(rpcUrl, mintKey);
      if (!tag) return Response.json({ error: 'No supported inscription is initialized. Resume preparation before writing bytes.' }, { status: 409 });
      const associatedInscriptionAccount = findAssociatedInscriptionPda(umi, { associated_tag: tag, inscriptionMetadataAccount });
      const imageAddress = associatedInscriptionAccount[0].toString();
      const value = new Uint8Array(bytes.subarray(0, writeChunkBytes));
      const writtenEnd = offset + value.length;
      // A later concurrent write can extend the account past an unwritten hole.
      // Length alone is not proof that this particular chunk was applied.
      const applied = () => chunkMatches(rpcUrl, imageAddress, offset, value);
      if (!await applied()) {
        await sendWithFreshBlockhash(writeData(umi, { inscriptionAccount: associatedInscriptionAccount, inscriptionMetadataAccount, value, associatedTag: tag, offset }), umi, applied);
      }
      if (!await applied()) throw new Error('The image chunk has not confirmed yet. Retry this offset.');
      return Response.json({ nextOffset: writtenEnd, complete: writtenEnd === totalSize });
    }
    return Response.json({ error: 'Invalid mint action.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || 'Minting failed.' }, { status: 500 });
  }
}