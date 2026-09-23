import { ATA, NOOP, PUMP, SYSTEM, TOKEN, TOKEN_2022, WSOL, base58Decode, base58Encode,
  equalBytes, extractCommitment, invariant, metadataUriFor, sha256, solLamports } from './atomicV1Protocol.js';

// Pump public IDL: create_v2, buy_v2 and buy_exact_quote_in_v2. Unknown
// instructions/arguments fail closed; update policy and SDK fixtures together.
export const CREATE = Uint8Array.from([214, 144, 76, 236, 95, 139, 49, 180]);
export const BUY = Uint8Array.from([184, 23, 238, 97, 103, 197, 211, 61]);
export const EXACT_BUY = Uint8Array.from([194, 171, 28, 70, 104, 77, 91, 47]);
const FEE_PROGRAM = 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ';
export function readCreate(data) {
  invariant(equalBytes(data.slice(0, 8), CREATE), 'Expected Pump create_v2.');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 8;
  const string = maximum => {
    invariant(offset + 4 <= data.length, 'Truncated Pump string.');
    const length = view.getUint32(offset, true); offset += 4;
    invariant(length <= maximum && offset + length <= data.length, 'Invalid Pump string length.');
    const result = new TextDecoder('utf-8', { fatal: true }).decode(data.slice(offset, offset + length)); offset += length;
    return result;
  };
  const name = string(32), symbol = string(10), uri = string(200);
  invariant(offset + 33 <= data.length, 'Missing Pump creator or flags.');
  const creator = base58Encode(data.slice(offset, offset + 32)); offset += 32;
  const flags = data.slice(offset);
  invariant([1, 2, 10, 11].includes(flags.length) && flags.every(b => b === 0), 'Mayhem, cashback, custom creator fees, or holder rewards are not enabled for this launch.');
  return { name, symbol, uri, creator };
}
function accountsMatch(ix, expected) {
  for (const [index, address] of Object.entries(expected)) invariant(ix.accounts[Number(index)] === address, `Unexpected account ${index} in ${ix.programAddress}.`);
}
/** derived must come from local PDA derivation, never the prepare response. */
export async function validateIntent(parsed, intent, derived) {
  invariant(derived && parsed.signers.length === 2 && parsed.readonlySigned === 0 &&
    parsed.signers[0] === intent.walletAddress && parsed.signers[1] === intent.coinMint &&
    intent.walletAddress !== intent.coinMint, 'The transaction must require only the connected payer and the mint.');
  base58Decode(intent.walletAddress); base58Decode(intent.coinMint);
  const { computeUnitLimit, loadedAccountsDataSizeLimit, priorityFeeLamports } = parsed.config;
  invariant(computeUnitLimit > 0 && computeUnitLimit <= 1400000 && loadedAccountsDataSizeLimit > 0 &&
    loadedAccountsDataSizeLimit <= 67108864 && priorityFeeLamports <= 5000n, 'Unexpected transaction resource settings or priority fee.');
  const instructions = parsed.instructions;
  invariant(instructions.length >= 2 && instructions[0].programAddress === PUMP &&
    instructions.at(-1).programAddress === NOOP, 'Creation must precede the final image instruction.');
  const create = instructions[0];
  invariant(create.accounts.length === 16, 'Unsupported create_v2 account layout or quote mint.');
  accountsMatch(create, { 0: intent.coinMint, 1: derived.mintAuthority, 2: derived.bondingCurve,
    3: derived.baseCurveAta, 4: derived.global, 5: intent.walletAddress, 6: SYSTEM, 7: TOKEN_2022,
    8: ATA, 9: 'MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e', 14: derived.eventAuthority, 15: PUMP });
  const identity = readCreate(create.data);
  invariant(identity.name === intent.name && identity.symbol === intent.symbol &&
    identity.creator === intent.walletAddress && identity.uri === metadataUriFor(intent.coinMint), 'The prepared coin identity differs from your launch.');
  const committed = extractCommitment(parsed, intent.coinMint);
  const imageHash = await sha256(committed.image);
  invariant(imageHash === committed.hash && imageHash === intent.imageSha256 &&
    committed.image.length === intent.imageByteLength, 'The transaction image differs from the selected image.');
  const budget = solLamports(intent.firstBuyAmount || '');
  let buys = 0, atas = 0;
  for (const ix of instructions.slice(1, -1)) {
    if (ix.programAddress === ATA) {
      invariant(++atas <= 1 && budget > 0n && [6, 7].includes(ix.accounts.length) &&
        (ix.data.length === 0 || (ix.data.length === 1 && [0, 1].includes(ix.data[0]))), 'Unexpected associated-token instruction.');
      accountsMatch(ix, { 0: intent.walletAddress, 1: derived.baseUserAta, 2: intent.walletAddress,
        3: intent.coinMint, 4: SYSTEM, 5: TOKEN_2022 });
      if (ix.accounts.length === 7) accountsMatch(ix, { 6: 'SysvarRent111111111111111111111111111111111' });
      invariant(buys === 0, 'Token account creation must precede the first buy.');
    } else {
      const exact = equalBytes(ix.data.slice(0, 8), EXACT_BUY);
      invariant(ix.programAddress === PUMP && ++buys === 1 && budget > 0n && ix.data.length === 24 &&
        (exact || equalBytes(ix.data.slice(0, 8), BUY)) && ix.accounts.length === 27, 'Unexpected instruction in the atomic SOL launch.');
      accountsMatch(ix, { 0: derived.global, 1: intent.coinMint, 3: TOKEN_2022, 4: TOKEN, 5: ATA,
        10: derived.bondingCurve, 11: derived.baseCurveAta, 13: intent.walletAddress, 14: derived.baseUserAta,
        16: derived.creatorVault, 23: FEE_PROGRAM, 24: SYSTEM, 25: derived.eventAuthority, 26: PUMP });
      invariant([SYSTEM, WSOL].includes(ix.accounts[2]), 'Only SOL first buys are supported.');
      const view = new DataView(ix.data.buffer, ix.data.byteOffset, ix.data.byteLength);
      const maximum = view.getBigUint64(exact ? 8 : 16, true), minimum = view.getBigUint64(exact ? 16 : 8, true);
      invariant(maximum > 0n && maximum <= budget && minimum > 0n, 'The first buy exceeds your SOL limit or has no minimum output.');
    }
  }
  invariant(buys === (budget > 0n ? 1 : 0), 'The requested first buy is missing or unexpected.');
  return true;
}
