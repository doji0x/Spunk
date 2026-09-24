import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, key } from './fixtures.mjs';
import { base58Encode, fromBase64, sha256, toBase64, utf8, verifyWire } from '../../base44/shared/atomicV1Protocol.js';
import { EXACT_MESSAGE_MODE, requestPhantomExactMessage } from '../../src/lib/atomicV1ExactMessage.js';
import { signAtomicV1 } from '../../src/lib/atomicV1UserSign.js';

async function setup(imageBytes = 1941) {
  const f = await fixture(imageBytes), trace = [];
  const provider = { isPhantom: true, isConnected: true, publicKey: f.payer.address,
    signMessage: async (bytes, display) => {
      trace.push('signMessage'); assert.equal(display, 'hex'); assert.deepEqual(bytes, f.message);
      assert.notEqual(bytes, f.message);
      return { signature: f.payer.sign(bytes), publicKey: f.payer.address };
    },
    request() { throw new Error('No raw-request fallback'); },
    signTransaction() { throw new Error('No transaction-signing fallback'); },
    signAndSendTransaction() { throw new Error('No broadcast fallback'); },
  };
  const args = { provider, message: f.message, mintAddress: f.mint.address, mintSignature: f.mint.sign(f.message),
    payerAddress: f.payer.address, intent: f.intent, codec: f.codec, isCurrent: () => true, prepared: f.prepared,
    assertFresh: async () => { trace.push('fresh'); },
    authorize: async review => { trace.push('review'); assert.equal(review.mode, EXACT_MESSAGE_MODE);
      assert.equal(review.imageSha256, f.intent.imageSha256); assert.equal(review.name, f.intent.name);
      assert.equal(review.transactionBytes, f.wire.length); assert.equal(review.messageBytes, f.message.length);
      assert.equal(review.mintAddress, f.mint.address); return review.messageHash; },
  };
  return { f, provider, args, trace };
}
test('experimental signing reviews the exact message, refresh-checks then signs once', async () => {
  const h = await setup(); const wire = await requestPhantomExactMessage(h.args);
  assert.deepEqual(h.trace, ['review', 'fresh', 'signMessage']);
  assert.deepEqual(wire, h.f.wire); await verifyWire(wire);
});
test('review cancellation makes no wallet request', async () => {
  const h = await setup(); h.args.authorize = async () => null;
  await assert.rejects(() => requestPhantomExactMessage(h.args), /cancelled/); assert.deepEqual(h.trace, []);
});
test('missing or wrong-digest authorization never calls signMessage', async () => {
  const h = await setup();
  await assert.rejects(() => requestPhantomExactMessage({ ...h.args, authorize: null }), /review/);
  await assert.rejects(() => requestPhantomExactMessage({ ...h.args, authorize: async () => 'other-message' }), /cancelled/);
  assert.ok(!h.trace.includes('signMessage'));
});
test('Phantom transaction-input rejection retains its code/message without fallback', async () => {
  const h = await setup(); h.provider.signMessage = async () => { h.trace.push('signMessage');
    throw { code: -32603, message: 'You cannot sign solana transactions using sign message.' }; };
  await assert.rejects(() => requestPhantomExactMessage(h.args), e => e.source === 'phantom' && e.stage === 'wallet-message-signing' &&
    e.code === -32603 && e.message === 'You cannot sign solana transactions using sign message.');
  assert.deepEqual(h.trace, ['review', 'fresh', 'signMessage']);
});
test('signatures over a hash, prefixed bytes or encoded text are rejected', async () => {
  for (const transform of [async m => utf8(await sha256(m)), async m => Uint8Array.from([...utf8('prefix'), ...m]),
    async m => utf8(toBase64(m)), async m => utf8(base58Encode(m))]) {
    const h = await setup(); h.provider.signMessage = async bytes => ({ signature: h.f.payer.sign(await transform(bytes)) });
    await assert.rejects(() => requestPhantomExactMessage(h.args), /exact prepared V1 message/);
  }
});
test('wrong returned account, signedMessage or signature length is rejected', async () => {
  const h = await setup();
  h.provider.signMessage = async bytes => ({ signature: h.f.payer.sign(bytes), publicKey: key().address });
  await assert.rejects(() => requestPhantomExactMessage(h.args), /another account/);
  h.provider.signMessage = async bytes => ({ signature: h.f.payer.sign(bytes), signedMessage: utf8('different') });
  await assert.rejects(() => requestPhantomExactMessage(h.args), /different or prefixed/);
  h.provider.signMessage = async () => ({ signature: new Uint8Array(63) });
  await assert.rejects(() => requestPhantomExactMessage(h.args), /exact prepared/);
});
test('provider mutation cannot alter the immutable message', async () => {
  const h = await setup(), before = new Uint8Array(h.f.message);
  h.provider.signMessage = async bytes => { bytes[20] ^= 1; return { signature: h.f.payer.sign(bytes) }; };
  await assert.rejects(() => requestPhantomExactMessage(h.args), /bytes changed/); assert.deepEqual(h.f.message, before);
});
test('expiry or account change during review prevents wallet signing', async () => {
  const h = await setup();
  await assert.rejects(() => requestPhantomExactMessage({ ...h.args, assertFresh: async () => { throw new Error('expired'); } }), /expired/);
  await assert.rejects(() => requestPhantomExactMessage({ ...h.args, authorize: async review => {
    h.provider.publicKey = key().address; return review.messageHash;
  } }), /account changed/);
  assert.ok(!h.trace.includes('signMessage'));
});
test('invalid mint signature, message digest and user intent are rejected before review', async () => {
  const h = await setup();
  await assert.rejects(() => requestPhantomExactMessage({ ...h.args, mintSignature: new Uint8Array(64) }), /mint signature/);
  await assert.rejects(() => requestPhantomExactMessage({ ...h.args, prepared: { ...h.f.prepared, messageHash: 'bad' } }), /immutable prepared/);
  await assert.rejects(() => requestPhantomExactMessage({ ...h.args, intent: { ...h.f.intent, name: 'Different' } }), /coin identity/);
  assert.deepEqual(h.trace, []);
});
test('Base58/array message signatures produce the same valid complete transaction', async () => {
  const h = await setup();
  for (const encode of [base58Encode, bytes => [...bytes], bytes => new Uint8Array(bytes).buffer]) {
    h.provider.signMessage = async bytes => ({ signature: encode(h.f.payer.sign(bytes)), signedMessage: bytes });
    assert.deepEqual(await requestPhantomExactMessage(h.args), h.f.wire);
  }
});
test('explicit mode in the real signer persists valid exact bytes; native remains the default', async () => {
  const h = await setup(); let persisted;
  const wallet = { name: 'Phantom', transport: 'phantom-request', provider: h.provider };
  const output = await signAtomicV1({ ...h.f, wallet, isCurrent: () => true, assertFresh: async () => {},
    signingMode: EXACT_MESSAGE_MODE, authorizeMessage: h.args.authorize, persistSigned: async v => { persisted = v; } });
  assert.deepEqual(output, persisted); await verifyWire(fromBase64(output.signedTransactionBase64));
  assert.deepEqual(fromBase64(output.signedTransactionBase64), h.f.wire);
});
test('the full 4096-byte transaction limit retains both signatures', async () => {
  const small = await fixture(1), h = await setup(4096 - small.wire.length + 1);
  const wire = await requestPhantomExactMessage(h.args); assert.equal(wire.length, 4096); await verifyWire(wire);
});
