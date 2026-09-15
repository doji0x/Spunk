import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from 'npm:@solana/web3.js@1.98.4';
import { TOKEN_2022_PROGRAM_ID, ExtensionType, getMintLen, createInitializeMetadataPointerInstruction, createInitializeMintInstruction, getMint, getTokenMetadata, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, createMintToInstruction, createSetAuthorityInstruction, createTransferCheckedInstruction, AuthorityType, TYPE_SIZE, LENGTH_SIZE } from 'npm:@solana/spl-token@0.4.13';
import { createInitializeInstruction, createUpdateFieldInstruction, createUpdateAuthorityInstruction, pack } from 'npm:@solana/spl-token-metadata@0.1.6';
import { deterministicSeed } from './mintWallet.ts';

export const launchDecimals = 6;
const baseUnits = whole => BigInt(whole) * 10n ** BigInt(launchDecimals);

export async function deriveKeypair(label, walletBytes) {
  return Keypair.fromSeed(await deterministicSeed(label, walletBytes));
}

// token mint ← launch id; inscription NFT mint and sale vault ← token mint. Same launch, same addresses, always.
export async function launchKeypairs(walletBytes, launchId) {
  const tokenMint = await deriveKeypair(`launch-token-mint:${launchId}`, walletBytes);
  const address = tokenMint.publicKey.toBase58();
  const inscriptionNft = await deriveKeypair(`inscription:${address}`, walletBytes);
  const vault = await deriveKeypair(`launch-vault:${address}`, walletBytes);
  return { tokenMint, inscriptionNft, vault };
}

export function bindingFields(launch) {
  return [['inscription_nft_mint', launch.nftMint], ['inscription_account', launch.inscriptionAccount], ['image_account', launch.imageAccount], ['image_sha256', launch.imageHash], ['image_mime', launch.imageMime]];
}

export async function sendWeb3(connection, tx, signers, isApplied = null) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = signers[0].publicKey;
      return await sendAndConfirmTransaction(connection, tx, signers, { commitment: 'confirmed', maxRetries: 0 });
    } catch (error) {
      if (isApplied) {
        try { if (await isApplied()) return; } catch { /* keep the transaction error */ }
      }
      const message = error instanceof Error ? error.message : String(error);
      if (!/block height exceeded|expired/i.test(message) || attempt === 2) throw error;
    }
  }
}

const authority = key => key && !key.equals(PublicKey.default) ? key.toBase58() : null;

export async function readTokenState(connection, mintAddress) {
  const mint = new PublicKey(mintAddress);
  if (!await connection.getAccountInfo(mint, 'confirmed')) return { exists: false, fields: {}, supply: 0n };
  const parsed = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
  const metadata = await getTokenMetadata(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
  return { exists: true, supply: parsed.supply, mintAuthority: authority(parsed.mintAuthority), freezeAuthority: authority(parsed.freezeAuthority), updateAuthority: authority(metadata?.updateAuthority), name: metadata?.name || '', symbol: metadata?.symbol || '', fields: Object.fromEntries(metadata?.additionalMetadata || []) };
}

export function estimateTokenMintBytes(launch) {
  const metadata = { mint: PublicKey.default, name: launch.name, symbol: launch.symbol, uri: '', additionalMetadata: bindingFields({ ...launch, nftMint: 'x'.repeat(44), inscriptionAccount: 'x'.repeat(44), imageAccount: 'x'.repeat(44), imageHash: 'x'.repeat(64), imageMime: 'image/jpeg' }) };
  return getMintLen([ExtensionType.MetadataPointer]) + TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
}

// Create mint → write binding fields → mint full supply → revoke mint authority → remove metadata update authority.
// Freeze authority is never set. Each step re-reads chain state first, so an interrupted launch resumes cleanly.
export async function runLaunchSteps(connection, wallet, tokenMint, launch) {
  const mint = tokenMint.publicKey;
  const address = mint.toBase58();
  const fields = bindingFields(launch);
  const owner = wallet.publicKey;
  let state = await readTokenState(connection, address);
  if (!state.exists) {
    const metadata = { mint, name: launch.name, symbol: launch.symbol, uri: '', additionalMetadata: fields };
    const mintLen = getMintLen([ExtensionType.MetadataPointer]);
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + TYPE_SIZE + LENGTH_SIZE + pack(metadata).length);
    const tx = new Transaction().add(
      SystemProgram.createAccount({ fromPubkey: owner, newAccountPubkey: mint, space: mintLen, lamports, programId: TOKEN_2022_PROGRAM_ID }),
      createInitializeMetadataPointerInstruction(mint, owner, mint, TOKEN_2022_PROGRAM_ID),
      createInitializeMintInstruction(mint, launchDecimals, owner, null, TOKEN_2022_PROGRAM_ID),
      createInitializeInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: mint, updateAuthority: owner, mint, mintAuthority: owner, name: launch.name, symbol: launch.symbol, uri: '' })
    );
    await sendWeb3(connection, tx, [wallet, tokenMint], async () => Boolean(await connection.getAccountInfo(mint, 'confirmed')));
    state = await readTokenState(connection, address);
  }
  const missing = fields.filter(([field, value]) => state.fields[field] !== value);
  if (missing.length) {
    if (!state.updateAuthority) throw new Error('The mint metadata is already immutable but its inscription fields are incomplete.');
    const tx = new Transaction();
    for (const [field, value] of missing) tx.add(createUpdateFieldInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: mint, updateAuthority: owner, field, value }));
    await sendWeb3(connection, tx, [wallet], async () => { const next = await readTokenState(connection, address); return fields.every(([field, value]) => next.fields[field] === value); });
    state = await readTokenState(connection, address);
  }
  const target = baseUnits(launch.supply);
  if (state.supply < target) {
    if (!state.mintAuthority) throw new Error('Mint authority is already revoked but the supply is short.');
    const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
    const tx = new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(owner, ata, owner, mint, TOKEN_2022_PROGRAM_ID), createMintToInstruction(mint, ata, owner, target - state.supply, [], TOKEN_2022_PROGRAM_ID));
    await sendWeb3(connection, tx, [wallet], async () => (await readTokenState(connection, address)).supply >= target);
    state = await readTokenState(connection, address);
  }
  if (state.mintAuthority) {
    await sendWeb3(connection, new Transaction().add(createSetAuthorityInstruction(mint, owner, AuthorityType.MintTokens, null, [], TOKEN_2022_PROGRAM_ID)), [wallet], async () => !(await readTokenState(connection, address)).mintAuthority);
    state = await readTokenState(connection, address);
  }
  if (state.updateAuthority) {
    await sendWeb3(connection, new Transaction().add(createUpdateAuthorityInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: mint, oldAuthority: owner, newAuthority: null })), [wallet], async () => !(await readTokenState(connection, address)).updateAuthority);
    state = await readTokenState(connection, address);
  }
  return state;
}

export async function heldBalance(connection, mintAddress, ownerAddress) {
  const ata = getAssociatedTokenAddressSync(new PublicKey(mintAddress), new PublicKey(ownerAddress), true, TOKEN_2022_PROGRAM_ID);
  const balance = await connection.getTokenAccountBalance(ata, 'confirmed').catch(() => null);
  return BigInt(balance?.value?.amount || 0);
}

export async function transferLaunchTokens(connection, wallet, mintAddress, buyerAddress, wholeTokens) {
  const mint = new PublicKey(mintAddress);
  const buyer = new PublicKey(buyerAddress);
  const source = getAssociatedTokenAddressSync(mint, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const destination = getAssociatedTokenAddressSync(mint, buyer, true, TOKEN_2022_PROGRAM_ID);
  const amount = baseUnits(wholeTokens);
  const before = await heldBalance(connection, mintAddress, buyerAddress);
  const tx = new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, destination, buyer, mint, TOKEN_2022_PROGRAM_ID), createTransferCheckedInstruction(source, mint, destination, wallet.publicKey, amount, launchDecimals, [], TOKEN_2022_PROGRAM_ID));
  return sendWeb3(connection, tx, [wallet], async () => await heldBalance(connection, mintAddress, buyerAddress) >= before + amount);
}

export async function withdrawVault(connection, vault, to) {
  const balance = await connection.getBalance(vault.publicKey, 'confirmed');
  const amount = balance - 5000;
  if (amount <= 0) return 0;
  await sendWeb3(connection, new Transaction().add(SystemProgram.transfer({ fromPubkey: vault.publicKey, toPubkey: to, lamports: amount })), [vault], async () => await connection.getBalance(vault.publicKey, 'confirmed') < balance);
  return amount;
}