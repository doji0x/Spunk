/** V1 policy inspection shared by the browser and backend. Production wire
 * encoding/decoding also round-trips through Solana Kit (see the adapters).
 * This module never requests a signature, reads a secret, or performs I/O.
 */
export const MAX_V1_BYTES = 4096;
export const MAINNET = 'solana:mainnet';
export const NOOP = 'noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV';
export const PUMP = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const SYSTEM = '11111111111111111111111111111111';
export const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const ATA = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const WSOL = 'So11111111111111111111111111111111111111112';
export const COMMITMENT_BYTES = 73;
export const metadataUriFor = mint => `https://solvalidate.base44.app/functions/atomicV1Metadata?mint=${mint}`;
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const utf8 = text => new TextEncoder().encode(text);
export function invariant(ok, message) { if (!ok) throw Object.assign(new Error(message), { status: 400 }); }
export function equalBytes(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
export function base58Encode(bytes) {
  let number = 0n, leading = 0, result = '';
  for (const byte of bytes) number = (number << 8n) | BigInt(byte);
  while (leading < bytes.length && bytes[leading] === 0) leading++;
  while (number) { result = alphabet[Number(number % 58n)] + result; number /= 58n; }
  return '1'.repeat(leading) + result;
}
export function base58Decode(value, length = 32) {
  invariant(typeof value === 'string' && value.length > 0 && value.length <= 90, 'Invalid base58 value.');
  let number = 0n;
  for (const c of value) {
    const digit = alphabet.indexOf(c);
    invariant(digit >= 0, 'Invalid base58 character.');
    number = number * 58n + BigInt(digit);
  }
  const tail = [];
  while (number) { tail.unshift(Number(number & 255n)); number >>= 8n; }
  const result = Uint8Array.from([...new Array(value.match(/^1*/)[0].length).fill(0), ...tail]);
  invariant(result.length === length, `Expected ${length} decoded bytes.`);
  return result;
}
export function toBase64(bytes) { return btoa(String.fromCharCode(...bytes)); }
export function fromBase64(value, maxBytes = MAX_V1_BYTES) {
  invariant(typeof value === 'string' && value.length > 0 && value.length <= Math.ceil(maxBytes / 3) * 4 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value), 'Invalid or oversized base64 input.');
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  invariant(bytes.length <= maxBytes && toBase64(bytes) === value, 'Noncanonical base64 input.');
  return bytes;
}
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function solLamports(value) {
  if (!value) return 0n;
  invariant(typeof value === 'string' && /^\d+(\.\d{1,9})?$/.test(value) && value.length <= 30, 'Use a SOL amount with at most 9 decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 1000000000n + BigInt(fraction.padEnd(9, '0'));
  invariant(amount <= 18446744073709551615n, 'SOL amount is too large.');
  return amount;
}
export async function verifySignature(signature, message, address) {
  if (!(signature instanceof Uint8Array) || signature.length !== 64) return false;
  const key = await crypto.subtle.importKey('raw', base58Decode(address), 'Ed25519', false, ['verify']);
  // Owned ArrayBuffers satisfy WebCrypto's BufferSource contract (not SharedArrayBuffer).
  return crypto.subtle.verify('Ed25519', key, new Uint8Array(signature), new Uint8Array(message));
}
export function inspectMessage(input, enforceSize = true) {
  invariant(input instanceof Uint8Array && input.length >= 42 && input[0] === 0x81, 'Expected a Solana V1 message.');
  const message = new Uint8Array(input);
  const count = message[1], readonlySigned = message[2], readonlyUnsigned = message[3];
  const instructionCount = message[40], addressCount = message[41];
  invariant(count > 0 && count <= 12 && readonlySigned < count && addressCount <= 64 &&
    addressCount >= count + readonlyUnsigned && instructionCount <= 64, 'Invalid V1 header.');
  const view = new DataView(message.buffer);
  const mask = view.getUint32(4, true);
  invariant((mask & ~31) === 0 && ((mask & 3) === 0 || (mask & 3) === 3), 'Unsupported V1 configuration mask.');
  let cursor = 42 + addressCount * 32;
  invariant(cursor <= message.length, 'Truncated V1 addresses.');
  const addresses = Array.from({ length: addressCount }, (_, i) => base58Encode(message.slice(42 + 32 * i, 74 + 32 * i)));
  invariant(new Set(addresses).size === addresses.length, 'Duplicate V1 addresses.');
  const takeU32 = () => { invariant(cursor + 4 <= message.length, 'Truncated V1 config.'); const n = view.getUint32(cursor, true); cursor += 4; return n; };
  let priorityFeeLamports = 0n;
  if (mask & 3) { const low = takeU32(), high = takeU32(); priorityFeeLamports = BigInt(low) | (BigInt(high) << 32n); }
  const computeUnitLimit = mask & 4 ? takeU32() : 0;
  const loadedAccountsDataSizeLimit = mask & 8 ? takeU32() : 0;
  const heapSize = mask & 16 ? takeU32() : 32768;
  invariant(heapSize >= 32768 && heapSize <= 262144 && heapSize % 1024 === 0, 'Invalid heap size.');
  const headers = [];
  for (let i = 0; i < instructionCount; i++) {
    invariant(cursor + 4 <= message.length, 'Truncated instruction header.');
    headers.push([message[cursor], message[cursor + 1], view.getUint16(cursor + 2, true)]); cursor += 4;
  }
  const instructions = headers.map(([programIndex, n, size]) => {
    invariant(programIndex < addressCount && cursor + n + size <= message.length, 'Invalid instruction boundary.');
    const indexes = [...message.slice(cursor, cursor + n)]; cursor += n;
    invariant(indexes.every(i => i < addressCount), 'Invalid instruction account index.');
    const data = message.slice(cursor, cursor + size); cursor += size;
    return { programAddress: addresses[programIndex], accounts: indexes.map(i => addresses[i]), indexes, data };
  });
  invariant(cursor === message.length, 'Trailing data in V1 message.');
  const wireSize = message.length + count * 64;
  invariant(!enforceSize || wireSize <= MAX_V1_BYTES, 'V1 transaction exceeds 4096 bytes.');
  return { message, addresses, signers: addresses.slice(0, count), readonlySigned, instructions, wireSize,
    blockhash: base58Encode(message.slice(8, 40)), config: { computeUnitLimit, loadedAccountsDataSizeLimit, priorityFeeLamports, heapSize } };
}
export function inspectWire(wire) {
  invariant(wire instanceof Uint8Array && wire.length >= 42 && wire.length <= MAX_V1_BYTES && wire[0] === 0x81, 'Invalid V1 transaction envelope.');
  const messageLength = wire.length - wire[1] * 64;
  invariant(messageLength >= 42, 'Truncated V1 signatures.');
  const parsed = inspectMessage(wire.slice(0, messageLength));
  const signatures = Object.fromEntries(parsed.signers.map((key, i) => [key, wire.slice(messageLength + i * 64, messageLength + (i + 1) * 64)]));
  return { ...parsed, signatures };
}
export async function verifyWire(wire) {
  const parsed = inspectWire(wire);
  for (const address of parsed.signers) invariant(await verifySignature(parsed.signatures[address], parsed.message, address), `Invalid transaction signature for ${address}.`);
  return { ...parsed, transactionSignature: base58Encode(parsed.signatures[parsed.signers[0]]) };
}
export function extractCommitment(parsed, mint) {
  const matches = parsed.instructions.filter(ix => ix.programAddress === NOOP && equalBytes(ix.data.slice(0, 9), Uint8Array.from([...utf8('VALIDATE'), 1])));
  invariant(matches.length === 1, 'Expected exactly one VALIDATE-v1 Noop instruction.');
  const ix = matches[0];
  invariant(ix.accounts.length === 0 && ix.data.length > COMMITMENT_BYTES &&
    equalBytes(ix.data.slice(9, 41), base58Decode(mint)), 'Image commitment is not bound to this mint.');
  return { image: ix.data.slice(COMMITMENT_BYTES), hash: [...ix.data.slice(41, 73)].map(b => b.toString(16).padStart(2, '0')).join('') };
}
export async function commitmentPayload(mint, image) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', image));
  return Uint8Array.from([...utf8('VALIDATE'), 1, ...base58Decode(mint), ...hash, ...image]);
}
