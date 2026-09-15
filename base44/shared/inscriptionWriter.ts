import { Buffer } from 'node:buffer';
import { percentAmount, TransactionBuilder } from 'npm:@metaplex-foundation/umi@0.9.2';
import { createV1, mintV1, TokenStandard } from 'npm:@metaplex-foundation/mpl-token-metadata@3.4.0';
import { findAssociatedInscriptionPda, findInscriptionMetadataPda, findMintInscriptionPda, initializeAssociatedInscription, initializeFromMint, writeData } from 'npm:@metaplex-foundation/mpl-inscription@0.8.1';
import { accountDataLength, accountExists, isSupportedImage, sendWithFreshBlockhash, tokenHasSupply } from './mintWallet.ts';

export const writeChunkBytes = 800;

export function inscriptionAddresses(umi, mintKey) {
  const inscriptionAccount = findMintInscriptionPda(umi, { mint: mintKey });
  const inscriptionMetadataAccount = findInscriptionMetadataPda(umi, { inscriptionAccount: inscriptionAccount[0] });
  const associatedInscriptionAccount = findAssociatedInscriptionPda(umi, { associated_tag: 'image', inscriptionMetadataAccount });
  return { inscriptionAccount, inscriptionMetadataAccount, associatedInscriptionAccount, uri: `https://igw.metaplex.com/mainnet/${inscriptionAccount[0]}` };
}

// Creates the NFT, its mint-derived inscription, the JSON metadata slot and the empty `image` slot.
// Every step is skipped when the chain already reflects it, so it is safe to call again on resume.
export async function prepareInscription(umi, rpcUrl, { mintSigner = null, mintKey = null, name, symbol, metadata }) {
  const key = mintSigner ? mintSigner.publicKey : mintKey;
  const mintAddress = key.toString();
  const { inscriptionAccount, inscriptionMetadataAccount, associatedInscriptionAccount, uri } = inscriptionAddresses(umi, key);
  if (mintSigner && !await accountExists(rpcUrl, mintAddress)) {
    await sendWithFreshBlockhash(createV1(umi, { mint: mintSigner, name, symbol, uri, sellerFeeBasisPoints: percentAmount(0), tokenStandard: TokenStandard.NonFungible, printSupply: { __kind: 'Limited', fields: [1n] } }), umi, () => accountExists(rpcUrl, mintAddress));
  }
  if (!await tokenHasSupply(rpcUrl, mintAddress)) {
    await sendWithFreshBlockhash(mintV1(umi, { mint: key, authority: umi.identity, amount: 1, tokenOwner: umi.identity.publicKey, tokenStandard: TokenStandard.NonFungible }), umi, () => tokenHasSupply(rpcUrl, mintAddress));
  }
  if (!await accountExists(rpcUrl, inscriptionAccount[0].toString())) {
    await sendWithFreshBlockhash(initializeFromMint(umi, { mintAccount: key }), umi, () => accountExists(rpcUrl, inscriptionAccount[0].toString()));
  }
  if (!await accountExists(rpcUrl, associatedInscriptionAccount[0].toString())) {
    const builder = new TransactionBuilder()
      .add(writeData(umi, { inscriptionAccount, inscriptionMetadataAccount, value: Buffer.from(JSON.stringify(metadata)), associatedTag: null, offset: 0 }))
      .add(initializeAssociatedInscription(umi, { inscriptionAccount, inscriptionMetadataAccount, associatedInscriptionAccount, associationTag: 'image' }));
    await sendWithFreshBlockhash(builder, umi, () => accountExists(rpcUrl, associatedInscriptionAccount[0].toString()));
  }
  const writtenBytes = await accountDataLength(rpcUrl, associatedInscriptionAccount[0].toString());
  return { mint: mintAddress, inscriptionAccount: inscriptionAccount[0].toString(), inscriptionMetadataAccount: inscriptionMetadataAccount[0].toString(), imageAccount: associatedInscriptionAccount[0].toString(), uri, writtenBytes };
}

export function parseChunk(input, maxImageBytes) {
  const offset = Number(input.offset);
  const totalSize = Number(input.totalSize);
  if (!Number.isInteger(offset) || offset < 0 || offset % writeChunkBytes !== 0) return { error: 'Invalid inscription progress.' };
  if (!Number.isInteger(totalSize) || totalSize < 1 || totalSize > maxImageBytes || typeof input.data !== 'string' || input.data.length > 9000) return { error: 'Invalid image batch.' };
  const bytes = Buffer.from(input.data, 'base64');
  if (!bytes.length || bytes.length > writeChunkBytes || offset + bytes.length > totalSize) return { error: 'Invalid image batch.' };
  if (offset === 0 && !isSupportedImage(bytes, input.mimeType)) return { error: 'The image contents do not match its file type.' };
  return { bytes, offset, totalSize };
}

// Writes one 800-byte chunk in its own transaction; skipped when the account already covers that range.
export async function appendImageChunk(umi, rpcUrl, { mintKey, offset, bytes }) {
  const { inscriptionMetadataAccount, associatedInscriptionAccount } = inscriptionAddresses(umi, mintKey);
  const imageAddress = associatedInscriptionAccount[0].toString();
  const value = new Uint8Array(bytes.subarray(0, writeChunkBytes));
  const writtenEnd = offset + value.length;
  if (await accountDataLength(rpcUrl, imageAddress) < writtenEnd) {
    await sendWithFreshBlockhash(writeData(umi, { inscriptionAccount: associatedInscriptionAccount, inscriptionMetadataAccount, value, associatedTag: 'image', offset }), umi, async () => await accountDataLength(rpcUrl, imageAddress) >= writtenEnd);
  }
  return writtenEnd;
}