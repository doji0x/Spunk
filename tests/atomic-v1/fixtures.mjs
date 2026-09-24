// Synthetic wire-format fixtures with real Ed25519 keys. Not a network or SDK test.
import { generateKeyPairSync, sign } from 'node:crypto';
import { ATA, MAINNET, NOOP, PUMP, SYSTEM, TOKEN_2022, base58Decode, base58Encode, commitmentPayload,
  inspectMessage, inspectWire, metadataUriFor, sha256, toBase64, utf8 } from '../../base44/shared/atomicV1Protocol.js';
import { CREATE } from '../../base44/shared/atomicV1Intent.js';
export const cat = (...parts) => Uint8Array.from(parts.flatMap(p => [...p]));
export function key() {
  // Independent boundary fixtures must have equal URI lengths. Both 43- and
  // 44-character public keys are valid; only test fixtures select a fixed width.
  for (let attempt = 0; attempt < 100; attempt++) {
    const pair = generateKeyPairSync('ed25519');
    const publicKey = new Uint8Array(pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
    const address = base58Encode(publicKey);
    if (address.length === 44) return { address, publicKey, sign: bytes => new Uint8Array(sign(null, bytes, pair.privateKey)) };
  }
  throw new Error('Could not create a fixed-width test address.');
}
const u32 = value => { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, true); return bytes; };
export const string = value => cat(u32(utf8(value).length), utf8(value));
export function encodeMessage({ payer, mint, instructions, blockhash }) {
  const addresses = [...new Set([payer, mint, ...instructions.flatMap(ix => [ix.programAddress, ...ix.accounts])])];
  const header = new Uint8Array(42); header.set([0x81, 2, 0, 0]);
  new DataView(header.buffer).setUint32(4, 15, true); header.set(base58Decode(blockhash), 8);
  header[40] = instructions.length; header[41] = addresses.length;
  const config = cat(u32(5000), u32(0), u32(700000), u32(67108864));
  const heads = instructions.map(ix => { const h = new Uint8Array(4); h[0] = addresses.indexOf(ix.programAddress); h[1] = ix.accounts.length;
    new DataView(h.buffer).setUint16(2, ix.data.length, true); return h; });
  const payloads = instructions.map(ix => cat(Uint8Array.from(ix.accounts.map(a => addresses.indexOf(a))), ix.data));
  return cat(header, ...addresses.map(a => base58Decode(a)), config, ...heads, ...payloads);
}
export async function fixture(imageSize = 1400) {
  const payer = key(), mint = key();
  const derived = Object.fromEntries(['bondingCurve', 'mintAuthority', 'global', 'eventAuthority', 'creatorVault', 'baseUserAta', 'baseCurveAta'].map(n => [n, key().address]));
  const image = new Uint8Array(imageSize).fill(9);
  const intent = { name: 'Test', symbol: 'T', firstBuyAmount: '', walletAddress: payer.address, coinMint: mint.address,
    imageSha256: await sha256(image), imageByteLength: image.length };
  const instructions = [{ programAddress: PUMP, accounts: [mint.address, derived.mintAuthority, derived.bondingCurve, derived.baseCurveAta,
    derived.global, payer.address, SYSTEM, TOKEN_2022, ATA, 'MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e',
    key().address, key().address, key().address, key().address, derived.eventAuthority, PUMP],
    data: cat(CREATE, string(intent.name), string(intent.symbol), string(metadataUriFor(mint.address)), base58Decode(payer.address), Uint8Array.of(0, 0)) },
    { programAddress: NOOP, accounts: [], data: await commitmentPayload(mint.address, image) }];
  const blockhash = key().address;
  const message = encodeMessage({ payer: payer.address, mint: mint.address, instructions, blockhash });
  const codec = {
    encode(bytes, signatures = {}) { const parsed = inspectMessage(bytes); return cat(bytes, ...parsed.signers.map(a => signatures[a] || new Uint8Array(64))); },
    decode: inspectWire, derive: async () => derived,
  };
  const prepared = { messageBase64: toBase64(message), messageHash: await sha256(message), coinMint: mint.address,
    signerAddresses: [payer.address, mint.address], lastValidBlockHeight: 200, blockhash, signingMethod: 'signTransaction' };
  const account = { address: payer.address, publicKey: payer.publicKey, chains: [MAINNET], features: ['solana:signTransaction', 'solana:signAndSendTransaction'] };
  const wallet = { name: 'Test Wallet', accounts: [account], chains: [MAINNET], features: {
    'standard:connect': { connect: async () => ({ accounts: [account] }) },
    'solana:signTransaction': { supportedTransactionVersions: [1], signTransaction: async ({ transaction }) => {
      const tx = inspectWire(transaction);
      return [{ signedTransaction: codec.encode(tx.message, { ...tx.signatures, [payer.address]: payer.sign(tx.message) }) }];
    } },
    'solana:signAndSendTransaction': { supportedTransactionVersions: [1], signAndSendTransaction: async ({ transaction }) => [{ signature: payer.sign(inspectWire(transaction).message) }] },
    'solana:signMessage': { signMessage: () => { throw new Error('Forbidden message signing fallback'); } },
  } };
  const wire = codec.encode(message, { [payer.address]: payer.sign(message), [mint.address]: mint.sign(message) });
  return { payer, mint, derived, image, intent, instructions, message, codec, prepared, account, wallet, wire };
}