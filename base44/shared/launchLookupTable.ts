import { Buffer } from 'node:buffer';
import { AddressLookupTableAccount, AddressLookupTableProgram, PublicKey, Transaction } from 'npm:@solana/web3.js@1.98.4';
import { rpcRequest } from './mintWallet.ts';

const label = 'pump-launch-v1';
// Public launches keep their own table: it holds only user- and mint-independent
// accounts and is owned by the admin mint wallet, so it is created once and never
// extended (or paid for) per launch.
export const publicLaunchTableLabel = 'pump-launch-public-v1';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Program ids must stay in the static key list, and signers can never be looked up,
// so both are excluded. Everything else shared by two different coin mints is
// mint-independent, which makes it safe to keep in a long-lived table.
export function stableLaunchKeys(instructionSets, excluded = []) {
  const programs = new Set(instructionSets.flat().map(ix => ix.programId.toBase58()));
  const skip = new Set([...programs, ...excluded.map(key => key.toBase58())]);
  const keySets = instructionSets.map(ixs => new Set(ixs.flatMap(ix => ix.keys.map(item => item.pubkey.toBase58()))));
  return [...keySets[0]].filter(key => !skip.has(key) && keySets.every(set => set.has(key)));
}

export function withoutLaunchLookupAddresses(table, excluded = []) {
  const skip = new Set(excluded.map(key => key.toBase58()));
  if (!skip.size || !table.state.addresses.some(key => skip.has(key.toBase58()))) return table;
  return new AddressLookupTableAccount({
    key: table.key,
    state: { ...table.state, addresses: table.state.addresses.filter(key => !skip.has(key.toBase58())) },
  });
}

async function sendAndConfirm(rpcUrl, wallet, instructions) {
  const latest = (await rpcRequest(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
  const transaction = new Transaction({ feePayer: wallet.publicKey, ...latest }).add(...instructions);
  transaction.sign(wallet);
  const signature = await rpcRequest(rpcUrl, 'sendTransaction', [transaction.serialize().toString('base64'), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 }]);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await wait(1000);
    const state = (await rpcRequest(rpcUrl, 'getSignatureStatuses', [[signature], { searchTransactionHistory: true }])).value[0];
    if (state?.err) throw new Error(`Lookup table update failed on-chain: ${JSON.stringify(state.err)}`);
    if (['confirmed', 'finalized'].includes(state?.confirmationStatus)) return signature;
  }
  throw new Error('The lookup table update did not confirm in time. Try the launch again.');
}

async function readTable(rpcUrl, address) {
  const account = (await rpcRequest(rpcUrl, 'getAccountInfo', [address, { encoding: 'base64', commitment: 'confirmed' }])).value;
  if (!account?.data?.[0]) return null;
  const state = AddressLookupTableAccount.deserialize(Buffer.from(account.data[0], 'base64'));
  return new AddressLookupTableAccount({ key: new PublicKey(address), state });
}

// A table extended in slot N only resolves from slot N+1, so wait it out before use.
async function waitUntilUsable(rpcUrl, table) {
  const extendedAt = Number(table.state.lastExtendedSlot || 0);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await rpcRequest(rpcUrl, 'getSlot', [{ commitment: 'confirmed' }]) > extendedAt) return;
    await wait(1000);
  }
  throw new Error('The lookup table is not active yet. Retry the launch in a moment.');
}

// Reads the shared table without creating one. A standalone dev buy fits without a
// lookup table, so recovery can proceed even before the table exists.
export async function readLaunchLookupTable(base44, rpcUrl) {
  const [record] = await base44.asServiceRole.entities.LaunchLookupTable.filter({ label });
  return record?.address ? await readTable(rpcUrl, record.address) : null;
}

// Returns the shared lookup table, creating it and extending it with any missing
// stable accounts. Runs at most once per new account set, not once per launch.
export async function ensureLaunchLookupTable(base44, rpcUrl, wallet, addresses, tableLabel = label) {
  const required = [...new Set(addresses)];
  let [record] = await base44.asServiceRole.entities.LaunchLookupTable.filter({ label: tableLabel });
  let table = record?.address ? await readTable(rpcUrl, record.address) : null;
  if (!table) {
    const recentSlot = await rpcRequest(rpcUrl, 'getSlot', [{ commitment: 'finalized' }]);
    const [instruction, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({ authority: wallet.publicKey, payer: wallet.publicKey, recentSlot });
    await sendAndConfirm(rpcUrl, wallet, [instruction]);
    const address = lookupTableAddress.toBase58();
    const data = { label: tableLabel, address, authority: wallet.publicKey.toBase58(), addresses: [] };
    record = record ? await base44.asServiceRole.entities.LaunchLookupTable.update(record.id, data) : await base44.asServiceRole.entities.LaunchLookupTable.create(data);
    table = await readTable(rpcUrl, address);
    if (!table) throw new Error('The new lookup table could not be read back. Retry the launch.');
  }
  const stored = new Set(table.state.addresses.map(key => key.toBase58()));
  const missing = required.filter(key => !stored.has(key));
  for (let index = 0; index < missing.length; index += 20) {
    const batch = missing.slice(index, index + 20).map(key => new PublicKey(key));
    await sendAndConfirm(rpcUrl, wallet, [AddressLookupTableProgram.extendLookupTable({ payer: wallet.publicKey, authority: wallet.publicKey, lookupTable: table.key, addresses: batch })]);
  }
  if (missing.length) {
    table = await readTable(rpcUrl, table.key.toBase58());
    await base44.asServiceRole.entities.LaunchLookupTable.update(record.id, { addresses: table.state.addresses.map(key => key.toBase58()) });
  }
  await waitUntilUsable(rpcUrl, table);
  return table;
}