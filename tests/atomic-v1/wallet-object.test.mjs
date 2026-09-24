import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.mjs';
import { requestPhantomV1 } from '../../src/lib/atomicV1PhantomRequest.js';

test('a detached response cannot conceal in-place mutation of the wallet message', async () => {
  const f = await fixture();
  const provider = { isPhantom: true, publicKey: f.payer.address, signTransaction: async tx => {
    tx.message.transactionConfig.computeUnitLimit++;
    return { signature: f.payer.sign(f.message) };
  } };
  await assert.rejects(() => requestPhantomV1({ provider, message: f.message, mintAddress: f.mint.address,
    mintSignature: f.mint.sign(f.message), payerAddress: f.payer.address, codec: f.codec, isCurrent: () => true }), /changed the prepared message/);
});
test('transaction adaptation changes only instance serializers, never class prototypes', async () => {
  const f = await fixture(), a = f.codec.toWalletTransaction(f.wire).transaction;
  const prototype = Object.getPrototypeOf(a), keys = Object.getOwnPropertyNames(prototype);
  const b = a.constructor.deserialize(f.wire);
  assert.deepEqual(Object.getOwnPropertyNames(prototype), keys);
  assert.equal(Object.hasOwn(b, 'serialize'), false);
  assert.throws(() => b.message.serialize(), /Serialization of version 1/);
  assert.deepEqual(a.serialize(), f.wire);
});
