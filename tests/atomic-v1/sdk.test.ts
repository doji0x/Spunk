// Real SDK/Kit integration. No RPC, secrets, wallet extension or broadcasts.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { Keypair } from 'npm:@solana/web3.js@1.98.4';
import nacl from 'npm:tweetnacl@1.0.3';
import { atomicV1Codec } from '../../base44/shared/atomicV1Kit.ts';
import { buildUnsignedAtomicV1 } from '../../base44/shared/atomicV1NativeBuilder.ts';
import { fromBase64, inspectMessage, metadataUriFor, sha256, verifyWire } from '../../base44/shared/atomicV1Protocol.js';
import { validateIntent } from '../../base44/shared/atomicV1Intent.js';
import { readFileSync } from 'node:fs';
// Load the package's published require entrypoint to avoid Deno's named-export
// inference failure on Anchor's CommonJS BN re-export. No SDK code is replaced.
const require = createRequire(import.meta.url);
const { PUMP_SDK } = require('@pump-fun/pump-sdk');

function png16() {
  const chunk = (type, bytes) => {
    const data = Buffer.concat([Buffer.from(type), bytes]);
    let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const length = Buffer.alloc(4), tail = Buffer.alloc(4); length.writeUInt32BE(bytes.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, data, tail]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(16, 0); ihdr.writeUInt32BE(16, 4); ihdr[8] = 8; ihdr[9] = 2;
  const pixels = Buffer.from(crypto.getRandomValues(new Uint8Array(16 * 49)));
  for (let row = 0; row < 16; row++) pixels[row * 49] = 0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
Deno.test('actual Pump create_v2 -> Kit V1 -> intent -> two signatures -> canonical decode', async () => {
  const payer = Keypair.generate(), mint = Keypair.generate();
  const walletAddress = payer.publicKey.toBase58(), coinMint = mint.publicKey.toBase58();
  const imageBytes = png16();
  const input = { name: 'V1 SDK test', symbol: 'V1TEST', firstBuyAmount: '', walletAddress, coinMint,
    imageSha256: await sha256(imageBytes), imageByteLength: imageBytes.length };
  const create = await PUMP_SDK.createV2Instruction({ mint: mint.publicKey, user: payer.publicKey, creator: payer.publicKey,
    name: input.name, symbol: input.symbol, uri: metadataUriFor(coinMint), mayhemMode: false, holderReward: false });
  const latest = { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 200 };
  const prepared = await buildUnsignedAtomicV1({ legacyInstructions: [create], payerAddress: walletAddress, latest, mint: coinMint, imageBytes });
  const message = fromBase64(prepared.messageBase64), derived = await atomicV1Codec.derive(walletAddress, coinMint);
  await validateIntent(inspectMessage(message), input, derived);
  const partial = atomicV1Codec.encode(message, { [coinMint]: nacl.sign.detached(message, mint.secretKey) });
  assert.equal(atomicV1Codec.decode(partial).signers.length, 2);
  const signed = atomicV1Codec.encode(message, { [coinMint]: nacl.sign.detached(message, mint.secretKey), [walletAddress]: nacl.sign.detached(message, payer.secretKey) });
  assert.ok(signed.length > 1232 && signed.length <= 4096);
  assert.equal(signed.length, prepared.size.finalSerializedTransactionBytes);
  await verifyWire(signed); assert.deepEqual(atomicV1Codec.decode(signed).message, message);
});
Deno.test('schema explicitly declares the native private state and keeps admin-only RLS', () => {
  const schema = JSON.parse(readFileSync(new URL('../../base44/entities/AtomicV1Launch.jsonc', import.meta.url), 'utf8'));
  for (const name of ['walletAddress','messageBase64','messageHash','signerAddresses','submitTokenHash','stateVersion','signedTransactionBase64','blockhash','nativeProtocol','size']) assert.ok(schema.properties[name], name);
  for (const operation of ['read','create','update','delete']) assert.equal(schema.rls[operation].user_condition.role, 'admin');
});
