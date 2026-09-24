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
    request: async request => {
      calls++;
      assert.equal(request.method, 'signTransaction');
      assert.deepEqual(Object.keys(request.params), ['message']);
      assert.equal(request.params.message, base58Encode(f.message));
      return { publicKey: f.payer.address, signature: base58Encode(f.payer.sign(f.message)) };
    } };
  const wallet = { name: 'Phantom', transport: PHANTOM_REQUEST, provider };
  const args = { provider, message: f.message, mintAddress: f.mint.address, mintSignature: f.mint.sign(f.message),
    payerAddress: f.payer.address, codec: f.codec, isCurrent: () => true };
  return { f, provider, wallet, args, calls: () => calls };
}
test('missing Wallet Standard V1 flags do not block native Phantom request', async () => {
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
test('Phantom error code and message survive without alternate requests', async () => {
  const { provider, args } = await setup(); let calls = 0;
  provider.request = async () => { calls++; throw Object.assign(new Error('Transaction version not supported'), { code: -32603 }); };
  await assert.rejects(() => requestPhantomV1(args), error => error.message === 'Transaction version not supported' && error.code === -32603 && error.source === 'phantom');
  assert.equal(calls, 1);
});
test('Phantom user rejection is not retried or reported as success', async () => {
  const { provider, args } = await setup(); provider.request = async () => { throw { code: 4001, message: 'User rejected the request.' }; };
  await assert.rejects(() => requestPhantomV1(args), error => error.code === 4001 && error.message === 'User rejected the request.');
});
test('byte-array payer signatures are accepted and verified', async () => {
  const { f, provider, args } = await setup(); provider.request = async () => ({ signature: [...f.payer.sign(f.message)] });
  await verifyWire(await requestPhantomV1(args));
});
test('signed transaction object without mint co-signature is safely completed locally', async () => {
  const { f, provider, args } = await setup();
  provider.request = async () => ({ serialize: () => f.codec.encode(f.message, { [f.payer.address]: f.payer.sign(f.message) }) });
  await verifyWire(await requestPhantomV1(args));
});
test('modified message returned by native Phantom is rejected before submission', async () => {
  const { f, provider, args } = await setup(); const changed = new Uint8Array(f.message); changed[8] ^= 1;
  provider.request = async () => ({ signedTransaction: f.codec.encode(changed, { [f.payer.address]: f.payer.sign(changed) }) });
  await assert.rejects(() => requestPhantomV1(args), /changed the prepared message/);
});
test('wrong-account and invalid signatures cannot authorize the prepared message', async () => {
  const { f, provider, args } = await setup();
  provider.request = async () => ({ publicKey: key().address, signature: base58Encode(f.payer.sign(f.message)) });
  await assert.rejects(() => requestPhantomV1(args), /different account/);
  provider.request = async () => ({ signature: new Uint8Array(64).fill(3) });
  await assert.rejects(() => requestPhantomV1(args), /valid payer signature/);
});
test('account changes stop sign-only assembly and preserve no fake success', async () => {
  const { f, provider, args } = await setup();
  provider.request = async () => { provider.publicKey = key().address; return { signature: f.payer.sign(f.message) }; };
  await assert.rejects(() => requestPhantomV1(args), /account changed/);
});
test('injected detection does not mistake another wallet for Phantom', async () => {
  const { provider } = await setup();
  assert.equal(getInjectedPhantom({ phantom: { solana: provider } }), provider);
  assert.equal(getInjectedPhantom({ phantom: { solana: {} }, solana: provider }), provider);
  assert.equal(getInjectedPhantom({ solana: { request() {} } }), null);
});
test('mint authorization binds metadata before Phantom preview without spending authority', async () => {
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
