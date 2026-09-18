import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { solanaRpc, indexedAsset } from './solanaServices.ts';

export const libreplexProgramAddress = 'inscokhJarcjaEs59QbQ7hYjrKz25LEPRfCbP8EmdUp';
const systemProgram = '11111111111111111111111111111111';
const tokenPrograms = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];
const discriminator = name => createHash('sha256').update(`account:${name}`).digest().subarray(0, 8);
export const legacyDiscriminator = discriminator('Inscription');
export const v3Discriminator = discriminator('InscriptionV3');

function derive(seed, root) {
  return PublicKey.findProgramAddressSync([Buffer.from(seed), new PublicKey(root).toBuffer()], new PublicKey(libreplexProgramAddress))[0].toBase58();
}

export function deriveLibreplexAccounts(root) {
  return { legacy: derive('inscription', root), v3: derive('inscription_v3', root), data: derive('inscription_data', root) };
}

function readString(bytes, state) {
  if (state.offset + 4 > bytes.length) throw new Error('String length is missing.');
  const length = bytes.readUInt32LE(state.offset); state.offset += 4;
  if (length > 1024 || state.offset + length > bytes.length) throw new Error('String data is incomplete.');
  const value = bytes.subarray(state.offset, state.offset + length).toString('utf8'); state.offset += length;
  return value;
}

function readKey(bytes, state) {
  if (state.offset + 32 > bytes.length) throw new Error('Public key data is incomplete.');
  const value = new PublicKey(bytes.subarray(state.offset, state.offset + 32)).toBase58(); state.offset += 32;
  return value;
}

function parseCommon(bytes, version) {
  const state = { offset: 8 };
  const authority = readKey(bytes, state);
  const root = readKey(bytes, state);
  if (version === 'v3') {
    const inscriptionData = readKey(bytes, state);
    if (state.offset + 12 > bytes.length) throw new Error('LibrePlex counters are incomplete.');
    const order = Number(bytes.readBigUInt64LE(state.offset)); state.offset += 8;
    const size = bytes.readUInt32LE(state.offset); state.offset += 4;
    const contentType = readString(bytes, state);
    const encoding = readString(bytes, state);
    return { authority, root, inscriptionData, order, size, contentType, encoding, version };
  }
  if (state.offset >= bytes.length) throw new Error('LibrePlex media type is missing.');
  const mediaKind = bytes[state.offset++];
  const mediaNames = ['', 'audio', 'application', 'image', 'video', 'text', 'custom', 'application'];
  let subtype = '';
  if (mediaKind >= 1 && mediaKind <= 6) subtype = readString(bytes, state);
  const contentType = mediaKind === 6 ? subtype : mediaKind === 7 ? 'application/erc721' : mediaNames[mediaKind] && subtype ? `${mediaNames[mediaKind]}/${subtype}` : '';
  if (state.offset >= bytes.length) throw new Error('LibrePlex encoding is missing.');
  const encoding = bytes[state.offset++] === 1 ? 'base64' : '';
  const inscriptionData = readKey(bytes, state);
  if (state.offset + 12 > bytes.length) throw new Error('LibrePlex counters are incomplete.');
  const order = Number(bytes.readBigUInt64LE(state.offset)); state.offset += 8;
  const size = bytes.readUInt32LE(state.offset);
  return { authority, root, inscriptionData, order, size, contentType, encoding, version };
}

export function decodeLibreplexAccount(account) {
  if (!account || account.executable || account.owner !== libreplexProgramAddress) return null;
  const bytes = Buffer.from(account.data[0], 'base64');
  try {
    if (bytes.subarray(0, 8).equals(v3Discriminator)) return parseCommon(bytes, 'v3');
    if (bytes.subarray(0, 8).equals(legacyDiscriminator)) return parseCommon(bytes, 'legacy');
  } catch { return null; }
  return null;
}

function imageSlice(bytes) {
  for (let offset = 0; offset < bytes.length; offset++) {
    const hex = bytes.subarray(offset, offset + 12).toString('hex');
    if (hex.startsWith('89504e470d0a1a0a')) {
      let end = offset + 8;
      while (end + 12 <= bytes.length) {
        const size = bytes.readUInt32BE(end); const type = bytes.subarray(end + 4, end + 8).toString();
        end += 12 + size;
        if (end > bytes.length) break;
        if (type === 'IEND') return { mime: 'image/png', bytes: bytes.subarray(offset, end), partial: false };
      }
      return { mime: 'image/png', bytes: bytes.subarray(offset), partial: true };
    }
    if (hex.startsWith('ffd8ff')) { const end = bytes.indexOf(Buffer.from([0xff, 0xd9]), offset + 3); return { mime: 'image/jpeg', bytes: end === -1 ? bytes.subarray(offset) : bytes.subarray(offset, end + 2), partial: end === -1 }; }
    if (/^474946383[79]61/.test(hex)) { const end = bytes.lastIndexOf(0x3b); return { mime: 'image/gif', bytes: end > offset ? bytes.subarray(offset, end + 1) : bytes.subarray(offset), partial: end <= offset }; }
    if (bytes.subarray(offset, offset + 4).toString() === 'RIFF' && bytes.subarray(offset + 8, offset + 12).toString() === 'WEBP') {
      const size = bytes.readUInt32LE(offset + 4) + 8; return { mime: 'image/webp', bytes: offset + size <= bytes.length ? bytes.subarray(offset, offset + size) : bytes.subarray(offset), partial: offset + size > bytes.length };
    }
  }
  return null;
}

async function accounts(keys, sliced = false) {
  if (!keys.length) return [];
  const result = [];
  for (let i = 0; i < keys.length; i += 100) {
    const response = await solanaRpc('getMultipleAccounts', [keys.slice(i, i + 100), { encoding: 'base64', commitment: 'finalized', ...(sliced ? { dataSlice: { offset: 0, length: 166 } } : {}) }]);
    result.push(...response.value);
  }
  return result;
}

function isMint(account) {
  if (!account || account.executable || !tokenPrograms.includes(account.owner)) return false;
  const bytes = Buffer.from(account.data[0], 'base64');
  return bytes.length >= 82 && bytes[45] === 1 && (account.space === 82 || (bytes.length > 165 && bytes[165] === 1));
}

export async function verifyLibreplexMint(mint) {
  const derived = deriveLibreplexAccounts(mint);
  const [legacyAccount, v3Account] = await accounts([derived.legacy, derived.v3]);
  const decoded = decodeLibreplexAccount(v3Account) || decodeLibreplexAccount(legacyAccount);
  const inscriptionAccount = decodeLibreplexAccount(v3Account) ? derived.v3 : derived.legacy;
  if (!decoded) return { status: 'invalid', reason: 'No token-linked image inscription was found under the LibrePlex standard.' };
  if (decoded.root !== mint || decoded.inscriptionData !== derived.data) return { status: 'invalid', reason: 'The LibrePlex inscription does not link back to this mint.' };
  if (!decoded.contentType.toLowerCase().startsWith('image/')) return { status: 'invalid', reason: 'A LibrePlex inscription exists, but it is not declared as an image.' };
  if (decoded.size > 5 * 1024 * 1024) return { status: 'unknown', message: 'A LibrePlex image exists, but it exceeds this viewer’s 5 MB limit.' };
  const [dataAccount] = await accounts([decoded.inscriptionData]);
  if (!dataAccount || dataAccount.owner !== libreplexProgramAddress || dataAccount.executable) return { status: 'invalid', reason: 'The linked LibrePlex image data account no longer exists.' };
  const storedBytes = Buffer.from(dataAccount.data[0], 'base64');
  let match = imageSlice(storedBytes);
  if (!match && decoded.encoding.toLowerCase() === 'base64') {
    try { match = imageSlice(Buffer.from(storedBytes.toString('utf8').replace(/\0/g, '').trim(), 'base64')); } catch { return { status: 'unknown', message: 'The LibrePlex image uses invalid base64 encoding.' }; }
  }
  if (!match) return { status: 'unknown', message: 'A LibrePlex image inscription exists, but its bytes are not a complete PNG, JPEG, GIF, or WebP image.' };
  const hash = createHash('sha256').update(match.bytes).digest('hex');
  const indexer = await indexedAsset(mint);
  return { status: 'valid', standard: 'LibrePlex Inscription', mint, inscriptionAccount, imageAccount: decoded.inscriptionData, image: `data:${match.mime};base64,${match.bytes.toString('base64')}`, mime: match.mime, bytes: match.bytes.length, partial: match.partial, hash, immutable: decoded.authority === systemProgram, checkedAt: new Date().toISOString(), indexer };
}

export async function verifyLibreplex(input) {
  try {
    let mints = [input];
    if (input.length > 44) {
      const transaction = await solanaRpc('getTransaction', [input, { encoding: 'jsonParsed', commitment: 'finalized', maxSupportedTransactionVersion: 1 }]);
      if (!transaction) return { status: 'unknown', message: 'Transaction not found on Solana mainnet.' };
      if (transaction.meta?.err) return { status: 'invalid', reason: 'This transaction failed and did not commit an inscription.' };
      const keys = [...new Set(transaction.transaction.message.accountKeys.map(key => typeof key === 'string' ? key : key.pubkey))];
      const heads = await accounts(keys, true);
      mints = keys.filter((key, index) => isMint(heads[index]));
      if (mints.length > 20) return { status: 'unknown', message: 'Several tokens are involved. Paste the specific mint address to verify it.' };
    } else { new PublicKey(input); }
    const results = await Promise.all(mints.map(verifyLibreplexMint));
    const valid = results.filter(result => result.status === 'valid');
    if (valid.length > 1) return { status: 'unknown', message: 'This transaction includes more than one LibrePlex-inscribed token. Paste a specific mint address.' };
    return valid[0] || results.find(result => result.status === 'unknown') || { status: 'invalid', reason: mints.length ? 'No LibrePlex image inscription was linked to this token.' : 'No token mint was found in this transaction.' };
  } catch (error) { return { status: 'unknown', message: error.message || 'Unable to check LibrePlex inscriptions right now.' }; }
}