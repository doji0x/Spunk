import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { Buffer } from 'node:buffer';
import bs58 from 'npm:bs58@6.0.0';
import { createUmi } from 'npm:@metaplex-foundation/umi-bundle-defaults@0.9.2';
import { createSignerFromKeypair, generateSigner, percentAmount, publicKey, signerIdentity, TransactionBuilder } from 'npm:@metaplex-foundation/umi@0.9.2';
import { createV1, findMasterEditionPda, mintV1, mplTokenMetadata, printV1, TokenStandard } from 'npm:@metaplex-foundation/mpl-token-metadata@3.4.0';
import { findAssociatedInscriptionPda, findInscriptionMetadataPda, findMintInscriptionPda, initializeAssociatedInscription, initializeFromMint, mplInscription, writeData } from 'npm:@metaplex-foundation/mpl-inscription@0.8.1';

const maxImageBytes = 1024 * 1024;
const writeChunkBytes = 800;
const batchBytes = writeChunkBytes * 8;
const mintPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function parseWallet(value) {
  const bytes = value.trim().startsWith('[') ? Uint8Array.from(JSON.parse(value)) : bs58.decode(value.trim());
  if (bytes.length !== 64) throw new Error('The mint wallet secret must contain 64 bytes.');
  return bytes;
}

function isSupportedImage(bytes, mimeType) {
  if (mimeType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mimeType === 'image/gif') return bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString());
  if (mimeType === 'image/webp') return bytes.length >= 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  return false;
}

async function assertMainnet(rpcUrl) {
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getGenesisHash' }) });
  const payload = await response.json();
  if (payload.result !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d') throw new Error('Minting is locked to Solana mainnet.');
}

async function rpcRequest(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || 'Solana RPC request failed.');
  return payload.result;
}

async function accountExists(rpcUrl, address) {
  const result = await rpcRequest(rpcUrl, 'getAccountInfo', [address, { commitment: 'confirmed', encoding: 'base64' }]);
  return Boolean(result?.value);
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
      return await builder.sendAndConfirm(umi, { send: { maxRetries: 0 }, confirm: { commitment: 'confirmed' } });
    } catch (error) {
      if (isApplied) {
        try {
          if (await isApplied()) return;
        } catch {
          // Preserve the transaction error when the state check is temporarily unavailable.
        }
      }
      const message = error instanceof Error ? error.message : String(error);
      const expired = /block height exceeded|signature .* expired/i.test(message);
      if (!expired || attempt === 2) throw error;
    }
  }
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const input = await req.json();
    const rpcUrl = secrets.get('SOLANA_RPC_URL');
    await assertMainnet(rpcUrl);
    const umi = createUmi(rpcUrl).use(mplTokenMetadata()).use(mplInscription());
    const walletBytes = parseWallet(secrets.get('MINT_WALLET_SECRET_KEY'));
    const wallet = umi.eddsa.createKeypairFromSecretKey(walletBytes);
    umi.use(signerIdentity(createSignerFromKeypair(umi, wallet)));

    if (input.action === 'start') {
      const name = String(input.name || '').trim();
      const symbol = String(input.symbol || '').trim().toUpperCase();
      const description = String(input.details || '').trim();
      const totalSize = Number(input.totalSize);
      if (!name || name.length > 32 || !symbol || symbol.length > 10 || !description || description.length > 1000) return Response.json({ error: 'Use a name up to 32 characters, ticker up to 10, and details up to 1,000.' }, { status: 400 });
      if (!Number.isInteger(totalSize) || totalSize < 1 || totalSize > maxImageBytes) return Response.json({ error: 'The image must be 1 MB or smaller.' }, { status: 400 });
      if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(input.mimeType)) return Response.json({ error: 'Use a PNG, JPEG, GIF, or WebP image.' }, { status: 400 });
      let mintSigner = null;
      let mintKey;
      if (input.mint) {
        const existingMint = String(input.mint).trim();
        if (!mintPattern.test(existingMint) || !await accountExists(rpcUrl, existingMint)) return Response.json({ error: 'The existing mint account was not found.' }, { status: 400 });
        mintKey = publicKey(existingMint);
      } else {
        mintSigner = generateSigner(umi);
        mintKey = mintSigner.publicKey;
      }
      const mintAddress = mintKey.toString();
      const inscriptionAccount = await findMintInscriptionPda(umi, { mint: mintKey });
      const inscriptionMetadataAccount = await findInscriptionMetadataPda(umi, { inscriptionAccount: inscriptionAccount[0] });
      const associatedInscriptionAccount = findAssociatedInscriptionPda(umi, { associated_tag: 'image', inscriptionMetadataAccount });
      const uri = `https://igw.metaplex.com/mainnet/${inscriptionAccount[0]}`;
      if (mintSigner) {
        await sendWithFreshBlockhash(createV1(umi, { mint: mintSigner, name, symbol, uri, sellerFeeBasisPoints: percentAmount(0), tokenStandard: TokenStandard.NonFungible, printSupply: { __kind: 'Limited', fields: [1n] } }), umi, () => accountExists(rpcUrl, mintAddress));
      }
      if (!await tokenHasSupply(rpcUrl, mintAddress)) {
        await sendWithFreshBlockhash(mintV1(umi, { mint: mintKey, authority: umi.identity, amount: 1, tokenOwner: umi.identity.publicKey, tokenStandard: TokenStandard.NonFungible }), umi, () => tokenHasSupply(rpcUrl, mintAddress));
      }
      if (!await accountExists(rpcUrl, inscriptionAccount[0].toString())) {
        await sendWithFreshBlockhash(initializeFromMint(umi, { mintAccount: mintKey }), umi, () => accountExists(rpcUrl, inscriptionAccount[0].toString()));
      }
      if (!await accountExists(rpcUrl, associatedInscriptionAccount[0].toString())) {
        const metadata = Buffer.from(JSON.stringify({ name, symbol, description }));
        const builder = new TransactionBuilder()
          .add(writeData(umi, { inscriptionAccount, inscriptionMetadataAccount, value: metadata, associatedTag: null, offset: 0 }))
          .add(initializeAssociatedInscription(umi, { inscriptionMetadataAccount, associatedInscriptionAccount, associationTag: 'image' }));
        await sendWithFreshBlockhash(builder, umi, () => accountExists(rpcUrl, associatedInscriptionAccount[0].toString()));
      }
      const masterEditionAccount = findMasterEditionPda(umi, { mint: mintKey });
      const editionState = await masterEditionState(rpcUrl, masterEditionAccount[0].toString());
      return Response.json({ mint: mintAddress, owner: umi.identity.publicKey.toString(), batchBytes, gatewayUrl: uri, prepared: true, maxSupply: editionState?.maxSupply?.toString() ?? null, supply: editionState?.supply?.toString() ?? null });
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
        await sendWithFreshBlockhash(printV1(umi, { masterEditionMint: mintKey, masterTokenAccountOwner: umi.identity.publicKey, editionMint: editionSigner, editionTokenAccountOwner: umi.identity.publicKey, editionNumber: 1n, tokenStandard: TokenStandard.NonFungible }), umi, async () => (await masterEditionState(rpcUrl, masterEditionAccount[0].toString()))?.supply === 1n);
        editionState = await masterEditionState(rpcUrl, masterEditionAccount[0].toString());
      }
      if (editionState.supply !== 1n) throw new Error('Master Edition print supply did not finalize at 1. Resume this mint; do not create another.');
      return Response.json({ editionMint: editionSigner.publicKey.toString(), maxSupply: '1', supply: '1' });
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
      const associatedInscriptionAccount = findAssociatedInscriptionPda(umi, { associated_tag: 'image', inscriptionMetadataAccount });
      for (let index = 0; index < bytes.length; index += writeChunkBytes) {
        await sendWithFreshBlockhash(writeData(umi, { inscriptionAccount: associatedInscriptionAccount, inscriptionMetadataAccount, value: bytes.subarray(index, index + writeChunkBytes), associatedTag: 'image', offset: offset + index }), umi);
      }
      return Response.json({ nextOffset: offset + bytes.length, complete: offset + bytes.length === totalSize });
    }
    return Response.json({ error: 'Invalid mint action.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || 'Minting failed.' }, { status: 500 });
  }
}