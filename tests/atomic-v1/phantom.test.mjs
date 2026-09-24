import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, key } from './fixtures.mjs';
import { base58Encode, fromBase64, equalBytes, verifyWire } from '../../base44/shared/atomicV1Protocol.js';
import { PHANTOM_REQUEST, getInjectedPhantom, requestPhantomV1 } from '../../src/lib/atomicV1PhantomRequest.js';
import { enabledMethods } from '../../src/lib/atomicV1WalletRegistry.js';
import { signAtomicV1 } from '../../src/lib/atomicV1UserSign.js';
import { preparationAuthorizationBytes, verifyPreparationAuthorization } from '../../base44/shared/atomicV1Authorization.js';
import { assertEnabled } from '../../base44/shared/atomicV1NativeState.js';

async function setup() {
  const f = await fixture(); let calls = 0;
  const provider = { isPhantom: true, publicKey: { toBase58: () => f.payer.address },
    request: async () => { throw new Error('The legacy raw-message request must not be used'); },
    signTransaction: async transaction => {
      calls++;
      assert.equal(transaction.version, 1);
      assert.deepEqual(transaction.message.serialize(), f.message);
      const decoded = f.codec.decode(transaction.serialize());
      assert.equal(decoded.wireSize, f.message.length + 128);
      assert.deepEqual(decoded.signatures[f.mint.address], f.mint.sign(f.message));
      transaction.signatures[0] = f.payer.sign(f.message);
      return transaction;
    } };
  const wallet = { name: 'Phantom', transport: PHANTOM_REQUEST, provider };
  const args = { provider, message: f.message, mintAddress: f.mint.address, mintSignature: f.mint.sign(f.message),
    payerAddress: f.payer.address, codec: f.codec, isCurrent: () => true };
  return { f, provider, wallet, args, calls: () => calls };
}
test('absent Wallet Standard V1 flags do not block the native object signing request', async () => {
  const { f, wallet, calls } = await setup(); let saved;
  assert.deepEqual(enabledMethods(wallet, f.account, { enabled: false, walletMethods: {} }), ['signTransaction']);
  assert.doesNotThrow(() => assertEnabled({ enabled: false, firstBuyEnabled: true }, 'Phantom', 'signTransaction', '', PHANTOM_REQUEST));
  const output = await signAtomicV1({ ...f, wallet, isCurrent: () => true, assertFresh: async () => {}, persistSigned: async value => { saved = value; } });
  assert.equal(calls(), 1); assert.deepEqual(output, saved);
  const signed = await verifyWire(fromBase64(output.signedTransactionBase64));
  assert.ok(equalBytes(signed.message, f.message)); assert.ok(equalBytes(signed.signatures[f.mint.address], f.mint.sign(f.message)));
});
test('explicit native emergency disable is distinct from version advertising', async () => {
  const { f, wallet } = await setup();
  assert.deepEqual(enabledMethods(wallet, f.account, { phantomRequestEnabled: false }), []);
  assert.throws(() => assertEnabled({ phantomRequestEnabled: false }, 'Phantom', 'signTransaction', '', PHANTOM_REQUEST), /disabled/);
});
test('Phantom buffer error is retained with safe request sizes and no alternate request', async () => {
  const { f, provider, args } = await setup(); let calls = 0;
  provider.signTransaction = async () => { calls++; throw Object.assign(new Error('Reached end of buffer unexpectedly'), { code: -32603 }); };
  await assert.rejects(() => requestPhantomV1(args), error => {
    assert.equal(error.message, 'Reached end of buffer unexpectedly'); assert.equal(error.code, -32603); assert.equal(error.source, 'phantom');
    assert.deepEqual(error.requestInfo, { method: 'signTransaction', transport: 'versioned-transaction-object', version: 1,
      messageBytes: f.message.length, transactionBytes: f.message.length + 128, signatureSlots: 2 });
    return true;
  });
  assert.equal(calls, 1);
});
test('user rejection is not retried or reported as success', async () => {
  const { provider, args } = await setup(); provider.signTransaction = async () => { throw { code: 4001, message: 'User rejected the request.' }; };
  await assert.rejects(() => requestPhantomV1(args), error => error.code === 4001 && error.message === 'User rejected the request.');
});
test('detached payer signatures are still checked over the exact message', async () => {
  const { f, provider, args } = await setup(); provider.signTransaction = async () => ({ signature: [...f.payer.sign(f.message)] });
  await verifyWire(await requestPhantomV1(args));
});
test('a zero mint slot in returned wire is safely completed from the retained signature', async () => {
  const { f, provider, args } = await setup();
  provider.signTransaction = async () => ({ signedTransaction: f.codec.encode(f.message, { [f.payer.address]: f.payer.sign(f.message) }) });
  await verifyWire(await requestPhantomV1(args));
});
test('modified serialized message is rejected before submission', async () => {
  const { f, provider, args } = await setup(); const changed = new Uint8Array(f.message); changed[8] ^= 1;
  provider.signTransaction = async () => ({ signedTransaction: f.codec.encode(changed, { [f.payer.address]: f.payer.sign(changed) }) });
  await assert.rejects(() => requestPhantomV1(args), /changed the prepared message/);
});
test('wrong-account and invalid signatures cannot authorize the prepared message', async () => {
  const { f, provider, args } = await setup();
  provider.signTransaction = async () => ({ publicKey: key().address, signature: base58Encode(f.payer.sign(f.message)) });
  await assert.rejects(() => requestPhantomV1(args), /different account/);
  provider.signTransaction = async () => ({ signature: new Uint8Array(64).fill(3) });
  await assert.rejects(() => requestPhantomV1(args), /valid payer signature/);
});
test('account changes stop sign-only assembly', async () => {
  const { f, provider, args } = await setup();
  provider.signTransaction = async () => { provider.publicKey = key().address; return { signature: f.payer.sign(f.message) }; };
  await assert.rejects(() => requestPhantomV1(args), /account changed/);
});
test('injected detection does not mistake another wallet for Phantom', async () => {
  const { provider } = await setup();
  assert.equal(getInjectedPhantom({ phantom: { solana: provider } }), provider);
  assert.equal(getInjectedPhantom({ phantom: { solana: {} }, solana: provider }), provider);
  assert.equal(getInjectedPhantom({ solana: { request() {} } }), null);
});
test('mint authorization binds metadata before wallet preview without spending authority', async () => {
  const { f } = await setup();
  const input = { ...f.intent, requestId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', description: 'Exact preview',
    imageUrl: 'https://example.com/test.png', socials: { website: 'https://example.com' } };
  const signature = f.mint.sign(preparationAuthorizationBytes(input));
  await verifyPreparationAuthorization(input, signature);
  for (const patch of [{ name: 'Changed' }, { imageUrl: 'https://example.com/other.png' }, { walletAddress: key().address },
    { imageSha256: '0'.repeat(64) }, { description: 'Changed' }, { firstBuyAmount: '1' }, { socials: { website: 'https://other.example' } }]) {
    await assert.rejects(() => verifyPreparationAuthorization({ ...input, ...patch }, signature));
  }
  await assert.rejects(() => verifyPreparationAuthorization(input, f.payer.sign(preparationAuthorizationBytes(input))));
});
test('signed identity is saved before a post-approval freshness read fails', async () => {
  const { f, wallet } = await setup(); let reads = 0, saved;
  await assert.rejects(() => signAtomicV1({ ...f, wallet, isCurrent: () => true,
    assertFresh: async () => { if (++reads === 2) throw new Error('RPC unavailable'); },
    persistSigned: async value => { saved = value; } }), /RPC unavailable/);
  assert.ok(saved.transactionSignature); await verifyWire(fromBase64(saved.signedTransactionBase64));
});
test('changing decoded instructions, keys, blockhash or resource limits is rejected', async () => {
  for (const modify of [tx => { tx.message.recentBlockhash = key().address; },
    tx => { tx.message.compiledInstructions[0].data[0] ^= 1; },
    tx => { tx.message.staticAccountKeys[0] = { toBase58: () => key().address }; },
    tx => { tx.message.transactionConfig.priorityFee++; }]) {
    const { f, provider, args } = await setup();
    provider.signTransaction = async tx => { tx.signatures[0] = f.payer.sign(f.message); modify(tx); return tx; };
    await assert.rejects(() => requestPhantomV1(args), /changed the prepared message/);
  }
});
test('native method is mandatory; missing support never triggers raw/message-signing fallback', async () => {
  const { provider, args } = await setup(); delete provider.signTransaction;
  await assert.rejects(() => requestPhantomV1(args), /does not expose native signTransaction/);
});
test('conflicting mint signature is rejected', async () => {
  const { f, provider, args } = await setup();
  provider.signTransaction = async tx => { tx.signatures[0] = f.payer.sign(f.message); tx.signatures[1] = new Uint8Array(64).fill(8); return tx; };
  await assert.rejects(() => requestPhantomV1(args), /conflicting mint signature/);
});
test('wrong signature count and malformed signature slots are rejected', async () => {
  const { f, provider, args } = await setup();
  provider.signTransaction = async tx => { tx.signatures = [f.payer.sign(f.message)]; return tx; };
  await assert.rejects(() => requestPhantomV1(args), /signature-slot count/);
  provider.signTransaction = async tx => { tx.signatures[0] = new Uint8Array(63); return tx; };
  await assert.rejects(() => requestPhantomV1(args), /Invalid wallet signature slot/);
});
test('serialization returns owned copies and keeps all 4096 transaction bytes', async () => {
  const small = await fixture(1), f = await fixture(4096 - small.wire.length + 1);
  const { transaction } = f.codec.toWalletTransaction(f.wire);
  assert.equal(transaction.serialize().length, 4096);
  const wireCopy = transaction.serialize(); wireCopy[10] ^= 1;
  const messageCopy = transaction.message.serialize(); messageCopy[10] ^= 1;
  assert.deepEqual(transaction.serialize(), f.wire); assert.deepEqual(transaction.message.serialize(), f.message);
});
