// Actual pinned SDK/Kit encoding and signing integration. No RPC or broadcasts.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { Keypair, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import BN from 'npm:bn.js@5.2.2';
import nacl from 'npm:tweetnacl@1.0.3';
import { atomicV1Codec } from '../../base44/shared/atomicV1Kit.ts';
import { buildUnsignedAtomicV1 } from '../../base44/shared/atomicV1NativeBuilder.ts';
import { WSOL, base58Encode, equalBytes, fromBase64, inspectMessage, metadataUriFor, sha256, verifyWire } from '../../base44/shared/atomicV1Protocol.js';
import { BUY, validateIntent } from '../../base44/shared/atomicV1Intent.js';
import { requestPhantomV1 } from '../../src/lib/atomicV1PhantomRequest.js';
import { readFileSync } from 'node:fs';
// Published CommonJS export avoids Deno's Anchor BN named-export inference
// failure. This is the real SDK implementation, not a fixture replacement.
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
for (const firstBuy of [false, true]) Deno.test(`actual Pump ${firstBuy ? 'create+buy' : 'create'} + image -> Kit V1 -> native request adapter -> two signatures`, async () => {
  const payer = Keypair.generate(), mint = Keypair.generate();
  const walletAddress = payer.publicKey.toBase58(), coinMint = mint.publicKey.toBase58();
  const imageBytes = png16();
  const input = { name: 'V1 SDK test', symbol: 'V1TEST', firstBuyAmount: firstBuy ? '0.001' : '', walletAddress, coinMint,
    imageSha256: await sha256(imageBytes), imageByteLength: imageBytes.length };
  const shared = { mint: mint.publicKey, user: payer.publicKey, creator: payer.publicKey,
    name: input.name, symbol: input.symbol, uri: metadataUriFor(coinMint), mayhemMode: false, holderReward: false };
  // Synthetic account DATA for the SDK's offline construction only. This does
  // not simulate program execution, fees, liquidity, or a valid on-chain quote.
  const instructions = firstBuy ? await PUMP_SDK.createV2AndBuyV2Instructions({ ...shared,
    global: { feeRecipient: Keypair.generate().publicKey, feeRecipients: [] },
    amount: new BN(1000), quoteAmount: new BN(1000000), quoteMint: new PublicKey(WSOL) }) :
    [await PUMP_SDK.createV2Instruction(shared)];
  if (firstBuy) {
    const buy = instructions.find(ix => equalBytes(new Uint8Array(ix.data.subarray(0, 8)), BUY));
    assert.ok(buy, 'SDK must provide the supported buy_v2 instruction');
    assert.equal(buy.data.length, 24);
    // Exercise the production max-spend clamp against the actual SDK encoding.
    new DataView(buy.data.buffer, buy.data.byteOffset, buy.data.byteLength).setBigUint64(16, 1000000n, true);
  }
  const latest = { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 200 };
  const prepared = await buildUnsignedAtomicV1({ legacyInstructions: instructions, payerAddress: walletAddress, latest, mint: coinMint, imageBytes });
  const message = fromBase64(prepared.messageBase64), derived = await atomicV1Codec.derive(walletAddress, coinMint);
  const parsed = inspectMessage(message);
  await validateIntent(parsed, input, derived);
  const mintSignature = nacl.sign.detached(message, mint.secretKey);
  let calls = 0;
  const provider = { isPhantom: true, publicKey: payer.publicKey, request: async request => {
    calls++; assert.equal(request.method, 'signTransaction');
    assert.deepEqual(Object.keys(request.params), ['message']);
    assert.equal(request.params.message, base58Encode(message));
    return { publicKey: walletAddress, signature: base58Encode(nacl.sign.detached(message, payer.secretKey)) };
  } };
  const signed = await requestPhantomV1({ provider, message, mintAddress: coinMint, mintSignature, payerAddress: walletAddress,
    codec: atomicV1Codec, isCurrent: () => true });
  assert.equal(calls, 1);
  assert.ok(signed.length > 1232 && signed.length <= 4096);
  assert.equal(signed.length, prepared.size.finalSerializedTransactionBytes);
  await verifyWire(signed);
  const decoded = atomicV1Codec.decode(signed);
  assert.deepEqual(decoded.message, message);
  assert.deepEqual(decoded.signatures[coinMint], new Uint8Array(mintSignature));
  console.log(JSON.stringify({ firstBuy, bytes: signed.length, instructionCount: parsed.instructions.length, nativeRequestCalls: calls }));
});
Deno.test('schema explicitly declares native private state and keeps admin-only RLS', () => {
  const schema = JSON.parse(readFileSync(new URL('../../base44/entities/AtomicV1Launch.jsonc', import.meta.url), 'utf8'));
  for (const name of ['walletAddress','messageBase64','messageHash','signerAddresses','submitTokenHash','stateVersion','signedTransactionBase64','blockhash','nativeProtocol','size','signingTransport','metadataAuthorized']) assert.ok(schema.properties[name], name);
  for (const operation of ['read','create','update','delete']) assert.equal(schema.rls[operation].user_condition.role, 'admin');
});
