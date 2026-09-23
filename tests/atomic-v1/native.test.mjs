import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, cat, key, encodeMessage } from './fixtures.mjs';
import { MAINNET, NOOP, PUMP, SYSTEM, TOKEN, TOKEN_2022, ATA, base58Encode, commitmentPayload, equalBytes, extractCommitment,
  fromBase64, inspectMessage, inspectWire, sha256, solLamports, toBase64, verifyWire } from '../../base44/shared/atomicV1Protocol.js';
import { BUY, validateIntent } from '../../base44/shared/atomicV1Intent.js';
import { signAtomicV1 } from '../../src/lib/atomicV1UserSign.js';
import { createWalletRegistry, enabledMethods, supportedMethods } from '../../src/lib/atomicV1WalletRegistry.js';
import { createNativeState, compareAndSet, publicLaunch, tokenHash } from '../../base44/shared/atomicV1NativeState.js';
import { newRecovery, readRecovery, writeRecovery } from '../../src/lib/atomicV1Recovery.js';
const config = { enabled: true, walletMethods: { 'Test Wallet': ['signTransaction', 'signAndSendTransaction'] }, firstBuyEnabled: true };
async function signing(overrides = {}) {
  const f = await fixture(); let persisted = null;
  const args = { ...f, isCurrent: () => true, assertFresh: async () => {}, persistSigned: async output => { persisted = output; }, ...overrides };
  return { f, args, saved: () => persisted };
}
async function stateHarness() {
  const f = await fixture(), token = 'a'.repeat(64), trace = [];
  let record = { ...f.intent, ...f.prepared, id: 'test-record', requestId: 'test-request', walletName: 'Test Wallet', stateVersion: 0,
    nativeProtocol: 2, status: 'prepared', atomicV1Verified: false, transactionSignature: '', signedTransactionBase64: '' };
  record.submitTokenHash = await tokenHash(record, token);
  const entity = { filter: async query => query.id === record.id ? [{ ...record }] : [],
    updateMany: async (query, data) => {
      const matches = Object.entries(query).every(([k, v]) => record[k] === v);
      if (!matches) return { success: true, updated: 0, has_more: false };
      record = { ...record, ...data.$set }; trace.push('persist:' + record.status);
      return { success: true, updated: 1, has_more: false };
    } };
  const responses = {
    getBlockHeight: () => 100, isBlockhashValid: () => ({ value: true }),
    simulateTransaction: () => ({ value: { err: null } }),
    sendTransaction: async ([encoded]) => { trace.push('send'); return (await verifyWire(fromBase64(encoded))).transactionSignature; },
    getTransaction: () => null, getSignatureStatuses: () => ({ value: [null] }), getSignaturesForAddress: () => [], getAccountInfo: () => ({ value: null }),
  };
  const rpc = async (name, args) => { assert.ok(responses[name], name); return responses[name](args); };
  const state = createNativeState({ entity, rpc, codec: f.codec, verifyFinalized: (r, p) => validateIntent(p, r, f.derived) });
  return { f, token, state, entity, responses, trace, get: () => ({ ...record }), set: patch => { record = { ...record, ...patch }; } };
}

test('V1 fixture above 1232 bytes carries exact image and two real signatures', async () => {
  const f = await fixture(); assert.ok(f.wire.length > 1232); assert.ok(f.wire.length < 4096);
  const p = await verifyWire(f.wire); assert.equal(p.signers.length, 2);
  assert.deepEqual(extractCommitment(p, f.mint.address).image, f.image);
  await validateIntent(p, f.intent, f.derived);
});
test('4096-byte boundary accepted; one additional byte rejected', async () => {
  const f = await fixture(1); const n = 4096 - f.wire.length + 1;
  const fitting = await fixture(n); assert.equal(fitting.wire.length, 4096); await verifyWire(fitting.wire);
  await assert.rejects(() => fixture(n + 1), /4096/);
});
test('canonical base64 rejects malformed or oversized transport', () => {
  assert.throws(() => fromBase64('AA'), /Noncanonical/); assert.throws(() => fromBase64('!bad!'));
  assert.throws(() => fromBase64(toBase64(new Uint8Array(4097))), /oversized|Noncanonical/);
});
test('SOL conversion never uses floating point', () => {
  assert.equal(solLamports('0.000000001'), 1n); assert.equal(solLamports('9000000.123456789'), 9000000123456789n);
  assert.throws(() => solLamports('0.0000000001')); assert.throws(() => solLamports('-1')); assert.throws(() => solLamports('1e3'));
});
test('reject trailing message data, invalid config mask and duplicate addresses', async () => {
  const { message } = await fixture(); assert.throws(() => inspectMessage(cat(message, [0])), /Trailing/);
  const badMask = new Uint8Array(message); badMask[4] = 1; assert.throws(() => inspectMessage(badMask), /mask/);
  const duplicate = new Uint8Array(message); duplicate.set(duplicate.slice(42, 74), 74); assert.throws(() => inspectMessage(duplicate), /Duplicate/);
});
test('wrong payer, image, name and unexpected transfer rejected before approval', async () => {
  const f = await fixture(), p = inspectMessage(f.message);
  for (const patch of [{ walletAddress: key().address }, { imageSha256: 'f'.repeat(64) }, { name: 'Other' }])
    await assert.rejects(() => validateIntent(p, { ...f.intent, ...patch }, f.derived));
  const instructions = [f.instructions[0], { programAddress: SYSTEM, accounts: [f.payer.address, key().address], data: Uint8Array.of(2) }, f.instructions[1]];
  await assert.rejects(() => validateIntent(inspectMessage(encodeMessage({ payer: f.payer.address, mint: f.mint.address, instructions, blockhash: f.prepared.blockhash })), f.intent, f.derived), /Unexpected/);
});
test('first-buy limit and selected buyer are enforced from instruction bytes', async () => {
  const f = await fixture(10), d = f.derived;
  const accounts = Array.from({ length: 27 }, () => key().address);
  Object.assign(accounts, { 0: d.global, 1: f.mint.address, 2: SYSTEM, 3: TOKEN_2022, 4: TOKEN, 5: ATA,
    10: d.bondingCurve, 11: d.baseCurveAta, 13: f.payer.address, 14: d.baseUserAta, 16: d.creatorVault,
    23: 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ', 24: SYSTEM, 25: d.eventAuthority, 26: PUMP });
  const data = cat(BUY, new Uint8Array(16)); const view = new DataView(data.buffer);
  view.setBigUint64(8, 100n, true); view.setBigUint64(16, 1000000000n, true);
  const parsed = () => inspectMessage(encodeMessage({ payer: f.payer.address, mint: f.mint.address,
    instructions: [f.instructions[0], { programAddress: PUMP, accounts, data }, f.instructions[1]], blockhash: f.prepared.blockhash }));
  await validateIntent(parsed(), { ...f.intent, firstBuyAmount: '1' }, d);
  view.setBigUint64(16, 1000000001n, true);
  await assert.rejects(() => validateIntent(parsed(), { ...f.intent, firstBuyAmount: '1' }, d), /SOL limit/);
  view.setBigUint64(16, 1000000000n, true); accounts[13] = key().address;
  await assert.rejects(() => validateIntent(parsed(), { ...f.intent, firstBuyAmount: '1' }, d), /account 13/);
});
test('native sign-only preserves message/mint and persists before returning', async () => {
  const { f, args, saved } = await signing(); const output = await signAtomicV1(args);
  assert.deepEqual(saved(), output); const tx = await verifyWire(fromBase64(output.signedTransactionBase64));
  assert.ok(equalBytes(tx.message, f.message)); assert.ok(equalBytes(tx.signatures[f.mint.address], f.mint.sign(f.message)));
});
test('wallet-returned altered message is rejected, not submitted', async () => {
  const { f, args, saved } = await signing();
  f.wallet.features['solana:signTransaction'].signTransaction = async ({ transaction }) => {
    const changed = new Uint8Array(transaction); changed[8] ^= 1; return [{ signedTransaction: changed }];
  };
  await assert.rejects(() => signAtomicV1(args), /changed the prepared message/); assert.equal(saved(), null);
});
test('wallet cannot remove the mint signature', async () => {
  const { f, args } = await signing();
  f.wallet.features['solana:signTransaction'].signTransaction = async ({ transaction }) => {
    const tx = inspectWire(transaction); return [{ signedTransaction: f.codec.encode(tx.message, { [f.payer.address]: f.payer.sign(tx.message) }) }];
  };
  await assert.rejects(() => signAtomicV1(args), /mint signature/);
});
test('invalid payer signature is rejected locally', async () => {
  const { f, args } = await signing();
  f.wallet.features['solana:signTransaction'].signTransaction = async ({ transaction }) => {
    const tx = inspectWire(transaction); return [{ signedTransaction: f.codec.encode(tx.message, { ...tx.signatures, [f.payer.address]: new Uint8Array(64).fill(7) }) }];
  };
  await assert.rejects(() => signAtomicV1(args), /Invalid transaction signature/);
});
test('changed account and expired preparation never request signing', async () => {
  const { f, args } = await signing(); let calls = 0;
  f.wallet.features['solana:signTransaction'].signTransaction = () => { calls++; };
  await assert.rejects(() => signAtomicV1({ ...args, isCurrent: () => false }), /changed/);
  await assert.rejects(() => signAtomicV1({ ...args, assertFresh: async () => { throw new Error('expired'); } }), /expired/);
  assert.equal(calls, 0);
});
test('exact method capability gating; string 1 is not numeric version 1', async () => {
  const f = await fixture(); f.wallet.features['solana:signTransaction'].supportedTransactionVersions = ['1', 0];
  assert.deepEqual(supportedMethods(f.wallet, f.account), ['signAndSendTransaction']);
  assert.deepEqual(enabledMethods(f.wallet, f.account, { ...config, enabled: false }), []);
  assert.deepEqual(enabledMethods(f.wallet, f.account, config), ['signAndSendTransaction']);
});
test('sign-and-send arms before wallet and preserves identity after account change', async () => {
  const { f, args } = await signing(); const trace = []; let current = true;
  f.prepared.signingMethod = 'signAndSendTransaction';
  f.wallet.features['solana:signAndSendTransaction'].signAndSendTransaction = async ({ transaction }) => {
    trace.push('wallet'); current = false; return [{ signature: f.payer.sign(inspectWire(transaction).message) }];
  };
  const result = await signAtomicV1({ ...args, isCurrent: () => current, beforeWalletSend: async () => { trace.push('arm'); } });
  assert.deepEqual(trace, ['arm', 'wallet']); assert.equal(result.walletSent, true);
});
test('sign-and-send rejection never falls back to another signing method', async () => {
  const { f, args } = await signing(); f.prepared.signingMethod = 'signAndSendTransaction'; let calls = 0;
  f.wallet.features['solana:signAndSendTransaction'].signAndSendTransaction = async () => { calls++; throw new Error('wallet timeout'); };
  await assert.rejects(() => signAtomicV1({ ...args, beforeWalletSend: async () => {} }), /timeout/); assert.equal(calls, 1);
});
test('server stores transaction ID before broadcast and strips secrets from public DTO', async () => {
  const h = await stateHarness(); const result = await h.state.submit(h.get().id, h.token, toBase64(h.f.wire), config);
  assert.ok(h.trace.indexOf('persist:submitting') < h.trace.indexOf('send')); assert.equal(result.status, 'pending');
  assert.equal(result.verifiedPayer, true);
  const dto = publicLaunch(h.get()); for (const key of ['submitTokenHash', 'messageBase64', 'signedTransactionBase64', 'intentHash']) assert.ok(!(key in dto));
});
test('broadcast timeout retains exact signed bytes and retry sends the same transaction', async () => {
  const h = await stateHarness(); let first = true, sent = [];
  h.responses.sendTransaction = async ([bytes]) => { sent.push(bytes); if (first) { first = false; throw new Error('timeout'); } return (await verifyWire(fromBase64(bytes))).transactionSignature; };
  const encoded = toBase64(h.f.wire); const uncertain = await h.state.submit(h.get().id, h.token, encoded, config);
  assert.equal(uncertain.status, 'unknown'); assert.equal(uncertain.signedTransactionBase64, encoded); assert.ok(uncertain.transactionSignature);
  await h.state.submit(h.get().id, h.token, h.get().signedTransactionBase64, config); assert.deepEqual(sent, [encoded, encoded]);
});
test('concurrent duplicate submissions cannot both win the first CAS', async () => {
  const h = await stateHarness(); const encoded = toBase64(h.f.wire);
  const outcomes = await Promise.allSettled([h.state.submit(h.get().id, h.token, encoded, config), h.state.submit(h.get().id, h.token, encoded, config)]);
  assert.ok(outcomes.some(x => x.status === 'fulfilled')); assert.equal(h.trace.filter(x => x === 'send').length, 1);
});
test('wrong recovery token and unavailable conditional writes fail closed', async () => {
  const h = await stateHarness(); await assert.rejects(() => h.state.load(h.get().id, 'b'.repeat(64)), /authorization/);
  await assert.rejects(() => compareAndSet({}, h.get(), { status: 'pending' }), /conditional writes/);
});
test('stale CAS cannot overwrite finalization', async () => {
  const h = await stateHarness(), old = h.get(); h.set({ stateVersion: 4, status: 'confirmed' });
  await assert.rejects(() => compareAndSet(h.entity, old, { status: 'unknown' }), /state changed/); assert.equal(h.get().status, 'confirmed');
});
test('finalized matching message verifies; substituted message never confirms', async () => {
  const h = await stateHarness(), signature = (await verifyWire(h.f.wire)).transactionSignature;
  h.set({ transactionSignature: signature, status: 'pending' });
  h.responses.getTransaction = () => ({ version: 1, transaction: [toBase64(h.f.wire), 'base64'], meta: { err: null } });
  const verified = await h.state.reconcile(h.get()); assert.equal(verified.status, 'confirmed'); assert.equal(verified.atomicV1Verified, true);
  const other = await stateHarness(); other.set({ transactionSignature: signature, status: 'pending' }); other.responses.getTransaction = h.responses.getTransaction;
  const wrong = await other.state.reconcile(other.get()); assert.equal(wrong.status, 'incomplete'); assert.equal(wrong.atomicV1Verified, false);
});
test('expiry requires finalized height, invalid blockhash and absent mint', async () => {
  const h = await stateHarness(); h.responses.getBlockHeight = () => 201; h.responses.isBlockhashValid = () => ({ value: false });
  assert.equal((await h.state.reconcile(h.get())).status, 'expired');
  const live = await stateHarness(); live.responses.getBlockHeight = () => 201; live.responses.isBlockhashValid = () => ({ value: false }); live.responses.getAccountInfo = () => ({ value: { owner: PUMP } });
  assert.equal((await live.state.reconcile(live.get())).status, 'incomplete');
});
test('missing RPC evidence never turns uncertain submission into an expired one', async () => {
  const h = await stateHarness(); h.set({ status: 'submitting' }); h.responses.getSignaturesForAddress = () => { throw new Error('RPC offline'); };
  await assert.rejects(() => h.state.reconcile(h.get()), /offline/); assert.equal(h.get().status, 'submitting');
});
test('full mint-history page blocks automatic expiry when history may be incomplete', async () => {
  const h = await stateHarness(); h.set({ status: 'unknown' });
  h.responses.getBlockHeight = () => 201; h.responses.isBlockhashValid = () => ({ value: false });
  h.responses.getSignaturesForAddress = () => Array.from({ length: 20 }, () => ({ signature: 'unavailable' }));
  assert.equal((await h.state.reconcile(h.get())).status, 'unknown');
});
test('armed wallet submission cannot be armed a second time', async () => {
  const h = await stateHarness(); h.set({ signingMethod: 'signAndSendTransaction' });
  await h.state.arm(h.get().id, h.token, config); await assert.rejects(() => h.state.arm(h.get().id, h.token, config), /already in progress/);
});
test('Wallet Standard registration before/after discovery and cleanup', async () => {
  const target = new EventTarget(), f = await fixture(); let unregister;
  target.addEventListener('wallet-standard:app-ready', e => { unregister = e.detail.register(f.wallet); });
  const registry = createWalletRegistry(target); assert.deepEqual(registry.get(), [f.wallet]);
  const other = { ...f.wallet, name: 'Other' };
  target.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: api => api.register(other) }));
  assert.equal(registry.get().length, 2); unregister(); assert.deepEqual(registry.get(), [other]); registry.dispose(); assert.equal(registry.get().length, 0);
});
test('recovery rejects corrupt data or failed storage; never silently allocates a replacement', () => {
  const map = new Map(), storage = { getItem: k => map.has(k) ? map.get(k) : null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) };
  const saved = newRecovery(key().address); writeRecovery(storage, saved); assert.deepEqual(readRecovery(storage, saved.walletAddress), saved);
  for (const k of map.keys()) map.set(k, '{broken'); assert.throws(() => readRecovery(storage, saved.walletAddress), /damaged/);
  assert.throws(() => writeRecovery({ ...storage, setItem: () => { throw new Error('quota'); } }, saved), /quota/);
});
