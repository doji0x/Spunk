import { Buffer } from 'node:buffer';
import { ComputeBudgetProgram, PublicKey, Transaction } from 'npm:@solana/web3.js@1.98.4';
import { PumpSdk } from 'npm:@pump-fun/pump-sdk@2.0.0';

export const pumpProgramId = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
export const createComputeUnits = 500_000;
export const tradeComputeUnits = 300_000;

export function bondingCurveAddress(mint) {
  return PublicKey.findProgramAddressSync([Buffer.from('bonding-curve'), new PublicKey(mint).toBuffer()], pumpProgramId)[0];
}

// The SDK renames methods between releases; resolve by capability so one code path survives upgrades.
function sdkMethod(sdk, names) {
  for (const name of names) {
    if (typeof sdk?.[name] === 'function') return name;
    if (typeof PumpSdk?.[name] === 'function') return name;
  }
  throw new Error(`The installed pump.fun SDK exposes none of: ${names.join(', ')}.`);
}

async function callSdk(sdk, names, args) {
  const name = sdkMethod(sdk, names);
  const target = typeof sdk?.[name] === 'function' ? sdk : PumpSdk;
  return await target[name](args);
}

function asInstructions(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result.flatMap(asInstructions);
  if (Array.isArray(result.instructions)) return result.instructions;
  return [result];
}

async function sendInstructions(connection, payer, instructions, units, extraSigners = []) {
  const transaction = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units }), ...instructions);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = payer.publicKey;
  transaction.sign(payer, ...extraSigners);
  const signature = await connection.sendRawTransaction(transaction.serialize(), { maxRetries: 3, preflightCommitment: 'confirmed' });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  const detail = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  return { signature, fee: detail?.meta?.fee ?? 0, computeUnits: detail?.meta?.computeUnitsConsumed ?? 0 };
}

// pump.fun can switch holder-rewards coins off globally; surface that before spending anything.
export async function pumpGlobal(connection) {
  const sdk = new PumpSdk(connection);
  const global = await callSdk(sdk, ['fetchGlobal', 'getGlobal'], {});
  return { global, sdk };
}

export async function curveState(connection, mint) {
  const sdk = new PumpSdk(connection);
  const curve = await callSdk(sdk, ['fetchBondingCurve', 'getBondingCurve'], new PublicKey(mint)).catch(() => null);
  if (!curve) return null;
  const number = value => (value === undefined || value === null ? null : Number(value.toString()));
  return {
    complete: Boolean(curve.complete),
    isHolderReward: Boolean(curve.isHolderReward ?? curve.is_holder_reward),
    creator: (curve.creator ?? curve.creatorPubkey)?.toString() ?? null,
    virtualSolReserves: number(curve.virtualSolReserves ?? curve.virtual_sol_reserves),
    realSolReserves: number(curve.realSolReserves ?? curve.real_sol_reserves),
    realTokenReserves: number(curve.realTokenReserves ?? curve.real_token_reserves),
    tokenTotalSupply: number(curve.tokenTotalSupply ?? curve.token_total_supply)
  };
}

// Creates a holder-rewards coin and optionally lands the first buy in the same transaction.
export async function createPumpCoin(connection, payer, mintKeypair, { name, symbol, uri, initialBuyLamports }) {
  const { sdk } = await pumpGlobal(connection);
  const args = { mint: mintKeypair.publicKey, name, symbol, uri, creator: payer.publicKey, user: payer.publicKey, mayhemMode: false, holderReward: true };
  const result = initialBuyLamports > 0
    ? await callSdk(sdk, ['createV2AndBuyV2Instructions', 'createV2AndBuyInstructions'], { ...args, quoteAmount: initialBuyLamports, solAmount: initialBuyLamports })
    : await callSdk(sdk, ['createV2Instruction', 'createV2Instructions'], args);
  const sent = await sendInstructions(connection, payer, asInstructions(result), createComputeUnits, [mintKeypair]);
  return { ...sent, mint: mintKeypair.publicKey.toBase58(), bondingCurve: bondingCurveAddress(mintKeypair.publicKey).toBase58() };
}

export async function buyPumpCoin(connection, payer, mint, lamports) {
  const { sdk } = await pumpGlobal(connection);
  const result = await callSdk(sdk, ['buyV2Instructions', 'buyInstructions'], { mint: new PublicKey(mint), user: payer.publicKey, quoteAmount: lamports, solAmount: lamports, slippage: 50 });
  return await sendInstructions(connection, payer, asInstructions(result), tradeComputeUnits);
}

// Permissionless and idempotent once the curve is complete.
export async function migratePumpCoin(connection, payer, mint) {
  const { sdk } = await pumpGlobal(connection);
  const result = await callSdk(sdk, ['migrateInstruction', 'migrateInstructions'], { mint: new PublicKey(mint), user: payer.publicKey });
  return await sendInstructions(connection, payer, asInstructions(result), tradeComputeUnits);
}

// pump.fun writes an immutable Metaplex URI, so the inscription binding travels inside that JSON.
export function bindingUri(launch) {
  const payload = {
    name: launch.name,
    symbol: launch.symbol,
    description: launch.description,
    inscription_nft_mint: launch.nftMint,
    inscription_image_account: launch.imageAccount,
    image_sha256: launch.imageHash,
    image_mime: launch.imageMime,
    image_size: launch.imageSize
  };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
}