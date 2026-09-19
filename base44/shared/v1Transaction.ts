import { Buffer } from 'node:buffer';
import bs58 from 'npm:bs58@6.0.0';
import { solanaRpc, recentAddressSignatures } from './solanaServices.ts';

const commitmentPrefix = Buffer.concat([Buffer.from('VALIDATE', 'ascii'), Buffer.from([1])]);
const commitmentHeaderBytes = commitmentPrefix.length + 32 + 32;

function parseV1Message(wire) {
  if (wire.length < 42 || wire[0] !== 0x81) throw new Error('The transaction is not encoded as Solana v1.');
  const requiredSignatures = wire[1];
  const configMask = wire.readUInt32LE(4);
  const instructionCount = wire[40];
  const addressCount = wire[41];
  const addresses = [];
  for (let i = 0; i < addressCount; i++) addresses.push(wire.subarray(42 + i * 32, 42 + (i + 1) * 32));
  let offset = 42 + addressCount * 32;
  let configFields = 0;
  for (let mask = configMask; mask; mask >>>= 1) configFields += mask & 1;
  offset += configFields * 4;
  const headers = [];
  for (let i = 0; i < instructionCount; i++) {
    if (offset + 4 > wire.length) throw new Error('The v1 instruction headers are incomplete.');
    headers.push({ accountCount: wire[offset + 1], dataLength: wire.readUInt16LE(offset + 2) });
    offset += 4;
  }
  const instructions = [];
  for (const header of headers) {
    offset += header.accountCount;
    if (offset + header.dataLength > wire.length) throw new Error('The v1 instruction payload is incomplete.');
    instructions.push(wire.subarray(offset, offset + header.dataLength));
    offset += header.dataLength;
  }
  const signatureBytes = requiredSignatures * 64;
  if (offset + signatureBytes !== wire.length) throw new Error('The v1 transaction has an invalid signature section.');
  return { message: wire.subarray(0, offset), instructions, signerAddresses: addresses.slice(0, requiredSignatures) };
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
    if (/^474946383[79]61/.test(hex)) { const end = bytes.indexOf(0x3b, offset + 6); return { mime: 'image/gif', bytes: end === -1 ? bytes.subarray(offset) : bytes.subarray(offset, end + 1), partial: end === -1 }; }
    if (bytes.subarray(offset, offset + 4).toString() === 'RIFF' && bytes.subarray(offset + 8, offset + 12).toString() === 'WEBP') {
      const size = bytes.readUInt32LE(offset + 4) + 8; return { mime: 'image/webp', bytes: offset + size <= bytes.length ? bytes.subarray(offset, offset + size) : bytes.subarray(offset), partial: offset + size > bytes.length };
    }
  }
  return null;
}

async function formatMatch(match, confidence, signature) {
  const digest = await crypto.subtle.digest('SHA-256', match.bytes);
  return {
    status: 'valid', standard: 'Solana V1 Transaction Inscription', confidence,
    image: `data:${match.mime};base64,${match.bytes.toString('base64')}`,
    mime: match.mime, bytes: match.bytes.length, partial: match.partial, hash: Buffer.from(digest).toString('hex'),
    signature, checkedAt: new Date().toISOString()
  };
}

function signerAddressesFromWire(wire) {
  const requiredSignatures = wire[1];
  return Array.from({ length: requiredSignatures }, (_, index) => wire.subarray(42 + index * 32, 74 + index * 32));
}

// Scans the raw wire bytes for the VALIDATE v1 commitment so verification never
// depends on how the v1 header encodes optional transaction config fields.
async function committedImage(wire, mint) {
  const mintBytes = Buffer.from(bs58.decode(mint));
  if (mintBytes.length !== 32) return null;
  if (!signerAddressesFromWire(wire).some(address => address.equals(mintBytes))) return null;
  let start = wire.indexOf(commitmentPrefix);
  while (start !== -1) {
    const body = wire.subarray(start);
    if (body.length > commitmentHeaderBytes && body.subarray(commitmentPrefix.length, commitmentPrefix.length + 32).equals(mintBytes)) {
      const expectedHash = body.subarray(commitmentPrefix.length + 32, commitmentHeaderBytes);
      const match = imageSlice(body.subarray(commitmentHeaderBytes));
      if (match) {
        const digest = Buffer.from(await crypto.subtle.digest('SHA-256', match.bytes));
        if (digest.equals(expectedHash)) return match;
      }
    }
    start = wire.indexOf(commitmentPrefix, start + 1);
  }
  return null;
}

export async function inspectV1Transaction(signature, expectedMint = null) {
  const response = await solanaRpc('getTransaction', [signature, { encoding: 'base64', commitment: 'finalized', maxSupportedTransactionVersion: 1 }]);
  if (!response) return { status: 'invalid', reason: 'Transaction not found on Solana mainnet.' };
  if (response.meta?.err) return { status: 'invalid', reason: 'The transaction failed and did not commit data.' };
  if (response.version !== 1) return { status: 'invalid', reason: 'No image was found in a Solana v1 transaction.' };
  const wire = Buffer.from(response.transaction[0], 'base64');
  if (expectedMint) {
    const match = await committedImage(wire, expectedMint);
    if (!match) return { status: 'invalid', reason: 'No authorized V1 VALIDATE v1 commitment was found for this mint.' };
    const result = await formatMatch(match, 'high', signature);
    return { ...result, mint: expectedMint, commitment: 'VALIDATE-v1', mintAuthorized: true };
  }
  let parsed = null;
  try { parsed = parseV1Message(wire); } catch { parsed = null; }
  for (const instruction of parsed?.instructions || []) {
    const match = imageSlice(instruction);
    if (match) return formatMatch(match, 'high', signature);
  }
  const commitmentStart = wire.indexOf(commitmentPrefix);
  if (commitmentStart !== -1) {
    const match = imageSlice(wire.subarray(commitmentStart + commitmentHeaderBytes));
    if (match) return { ...(await formatMatch(match, 'high', signature)), commitment: 'VALIDATE-v1' };
  }
  const match = imageSlice(parsed?.message || wire);
  return match ? formatMatch(match, 'low', signature) : { status: 'invalid', reason: 'No complete PNG, JPEG, GIF, or WebP bytes were found in this v1 transaction.' };
}

export async function findV1Inscription(input) {
  try {
    if (input.length > 44) return await inspectV1Transaction(input);
    const signatures = await recentAddressSignatures(input, 20);
    let checked = 0;
    for (let i = 0; i < signatures.length; i += 4) {
      const results = await Promise.all(signatures.slice(i, i + 4).map(async signature => {
        try { return await inspectV1Transaction(signature, input); } catch { return null; }
      }));
      checked += results.filter(Boolean).length;
      const found = results.find(result => result?.status === 'valid');
      if (found) return found;
    }
    if (!checked && signatures.length) return { status: 'unknown', message: 'Recent mint transactions could not be read with v1 support.' };
    return { status: 'invalid', reason: signatures.length ? `No authorized V1 VALIDATE v1 image commitment was found in the ${signatures.length} most recent mint transactions.` : 'No recent transactions were available for this mint.' };
  } catch (error) {
    return { status: 'unknown', message: error.message || 'Unable to check v1 transaction inscriptions right now.' };
  }
}