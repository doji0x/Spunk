import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { createUmi } from 'npm:@metaplex-foundation/umi-bundle-defaults@0.9.2';
import { createSignerFromKeypair, generateSigner, publicKey, signerIdentity } from 'npm:@metaplex-foundation/umi@0.9.2';
import { findMasterEditionPda, mplTokenMetadata, printV1, TokenStandard, transferV1 } from 'npm:@metaplex-foundation/mpl-token-metadata@3.4.0';
import { findAssociatedTokenPda } from 'npm:@metaplex-foundation/mpl-toolbox@0.9.4';
import { mplInscription } from 'npm:@metaplex-foundation/mpl-inscription@0.8.1';
import { accountExists, deterministicSigner, masterEditionState, mintPattern, sendWithFreshBlockhash, tokenBalance } from '../../shared/mintWallet.ts';
import { resolveNetwork } from '../../shared/solanaNetwork.ts';
import { appendImageChunk, parseChunk, prepareInscription, writeChunkBytes } from '../../shared/inscriptionWriter.ts';

const maxImageBytes = 1024 * 1024;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const input = await req.json();
    const { rpcUrl, walletBytes } = await resolveNetwork();
    const umi = createUmi(rpcUrl).use(mplTokenMetadata()).use(mplInscription());
    umi.use(signerIdentity(createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSecretKey(walletBytes))));

    if (input.action === 'start') {
      const name = String(input.name || '').trim();
      const symbol = String(input.symbol || '').trim().toUpperCase();
      const description = String(input.details || '').trim();
      const totalSize = Number(input.totalSize);
      if (!name || name.length > 32 || !symbol || symbol.length > 10 || !description || description.length > 1000) return Response.json({ error: 'Use a name up to 32 characters, ticker up to 10, and details up to 1,000.' }, { status: 400 });
      if (!Number.isInteger(totalSize) || totalSize < 1 || totalSize > maxImageBytes) return Response.json({ error: 'The image must be 1 MB or smaller.' }, { status: 400 });
      if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(input.mimeType)) return Response.json({ error: 'Use a PNG, JPEG, GIF, or WebP image.' }, { status: 400 });
      const boundToken = String(input.tokenMint || '').trim();
      if (boundToken && (!mintPattern.test(boundToken) || !await accountExists(rpcUrl, boundToken))) return Response.json({ error: 'That token contract address was not found on this network.' }, { status: 400 });
      let mintSigner = null;
      let mintKey = null;
      if (input.mint) {
        const existingMint = String(input.mint).trim();
        if (!mintPattern.test(existingMint) || !await accountExists(rpcUrl, existingMint)) return Response.json({ error: 'The existing mint account was not found.' }, { status: 400 });
        mintKey = publicKey(existingMint);
      } else {
        mintSigner = generateSigner(umi);
      }
      const result = await prepareInscription(umi, rpcUrl, { mintSigner, mintKey, name, symbol, metadata: boundToken ? { name, symbol, description, token_mint: boundToken } : { name, symbol, description } });
      const editionState = await masterEditionState(rpcUrl, findMasterEditionPda(umi, { mint: publicKey(result.mint) })[0].toString());
      return Response.json({ mint: result.mint, owner: umi.identity.publicKey.toString(), batchBytes: writeChunkBytes, writtenBytes: result.writtenBytes, gatewayUrl: result.uri, prepared: true, maxSupply: editionState?.maxSupply?.toString() ?? null, supply: editionState?.supply?.toString() ?? null });
    }

    if (input.action === 'finalize') {
      const mint = String(input.mint || '').trim();
      if (!mintPattern.test(mint) || !await accountExists(rpcUrl, mint)) return Response.json({ error: 'The mint account was not found.' }, { status: 400 });
      const mintKey = publicKey(mint);
      const masterEditionAccount = findMasterEditionPda(umi, { mint: mintKey });
      let editionState = await masterEditionState(rpcUrl, masterEditionAccount[0].toString());
      if (!editionState || editionState.maxSupply !== 1n) return Response.json({ error: 'The image is embedded, but this existing mint cannot be changed to Master Edition maxSupply 1.' }, { status: 409 });
      const editionSigner = await deterministicSigner(umi, `master-edition-1:${mint}`, walletBytes);
      if (editionState.supply === 0n) {
        await sendWithFreshBlockhash(printV1(umi, { masterEditionMint: mintKey, masterTokenAccountOwner: umi.identity.publicKey, editionMint: editionSigner, editionTokenAccountOwner: umi.identity.publicKey, editionNumber: 1n, tokenStandard: TokenStandard.NonFungible }), umi, async () => (await masterEditionState(rpcUrl, masterEditionAccount[0].toString()))?.supply === 1n);
        editionState = await masterEditionState(rpcUrl, masterEditionAccount[0].toString());
      }
      if (editionState.supply !== 1n) throw new Error('Master Edition print supply did not finalize at 1. Resume this mint; do not create another.');
      return Response.json({ editionMint: editionSigner.publicKey.toString(), maxSupply: '1', supply: '1' });
    }

    if (input.action === 'transfer') {
      const mint = String(input.mint || '').trim();
      const destination = String(input.destination || '').trim();
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
      if (!mintPattern.test(mint)) return Response.json({ error: 'Invalid inscription progress.' }, { status: 400 });
      const chunk = parseChunk(input, maxImageBytes);
      if (chunk.error) return Response.json({ error: chunk.error }, { status: 400 });
      const writtenEnd = await appendImageChunk(umi, rpcUrl, { mintKey: publicKey(mint), offset: chunk.offset, bytes: chunk.bytes });
      return Response.json({ nextOffset: writtenEnd, complete: writtenEnd === chunk.totalSize });
    }
    return Response.json({ error: 'Invalid mint action.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || 'Minting failed.' }, { status: 500 });
  }
}