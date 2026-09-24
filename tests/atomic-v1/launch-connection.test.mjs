import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { key } from './fixtures.mjs';
import { connectPhantomForLaunch } from '../../src/lib/atomicV1LaunchConnection.js';
import { createLaunchSessionLoader } from '../../src/lib/atomicV1LaunchSession.js';
import { newRecovery, readRecovery, writeRecovery } from '../../src/lib/atomicV1Recovery.js';
const store = () => { const values = new Map(); return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k), values }; };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('connection is invoked immediately and returns a directly usable account', async () => {
  const address = key().address, gate = deferred(); let called = false;
  const provider = { isPhantom: true, isConnected: false, publicKey: null, request() { throw new Error('No signature here'); },
    connect: async () => { called = true; await gate.promise; provider.publicKey = address; provider.isConnected = true; return { publicKey: address }; } };
  const promise = connectPhantomForLaunch(provider); assert.equal(called, true);
  gate.resolve(); assert.equal((await promise).address, address);
});
test('connected provider is reused with no connection or signature request', async () => {
  const address = key().address;
  const provider = { isPhantom: true, isConnected: true, publicKey: address,
    connect() { throw new Error('Duplicate connect'); }, request() { throw new Error('Unexpected request'); } };
  assert.equal((await connectPhantomForLaunch(provider)).address, address);
});
test('request-only provider uses connect, never signMessage or signTransaction', async () => {
  const address = key().address; const requests = [];
  const provider = { isPhantom: true, request: async request => {
    requests.push(request); provider.publicKey = address; provider.isConnected = true; return { publicKey: address };
  } };
  assert.equal((await connectPhantomForLaunch(provider)).address, address);
  assert.deepEqual(requests, [{ method: 'connect' }]);
});
test('connection rejection preserves its Phantom source, stage and original code', async () => {
  const provider = { isPhantom: true, request() {}, connect() { throw { code: 4001, message: 'Declined' }; } };
  await assert.rejects(() => connectPhantomForLaunch(provider), e => e.source === 'phantom' && e.stage === 'wallet-connection' && e.code === 4001 && e.message === 'Declined');
});
test('disconnect during an outstanding connection rejects and removes the listener', async () => {
  const provider = new EventEmitter(), gate = deferred(), address = key().address;
  Object.assign(provider, { isPhantom: true, request() {}, connect: async () => { await gate.promise; provider.publicKey = address; provider.isConnected = true; return { publicKey: address }; } });
  const promise = connectPhantomForLaunch(provider); provider.emit('disconnect'); gate.resolve();
  await assert.rejects(() => promise, /disconnected/); assert.equal(provider.listenerCount('disconnect'), 0);
});
test('different response and live-provider accounts cannot initialize a payer session', async () => {
  const provider = { isPhantom: true, request() {}, publicKey: key().address, connect: async () => ({ publicKey: key().address }) };
  await assert.rejects(() => connectPhantomForLaunch(provider), /account changed/);
});
test('effect and submit session initialization share one promise and one mint', async () => {
  const storage = store(), gate = deferred(), payer = key().address, mint = key(); let calls = 0;
  const load = createLaunchSessionLoader(storage, async () => { calls++; await gate.promise; return mint; });
  const a = load(payer), b = load(payer); assert.equal(a, b); gate.resolve();
  const [first, second] = await Promise.all([a,b]); assert.equal(calls, 1); assert.equal(first.requestId, second.requestId);
  assert.equal(first.coinMint, mint.address); assert.equal((await load(payer)).coinMint, mint.address); assert.equal(calls, 1);
});
test('corrupt recovery is never automatically cleared or replaced', async () => {
  const storage = store(), payer = key().address, name = `validate:atomic-v1:recovery:2:${payer}`;
  storage.setItem(name, '{bad'); let calls = 0;
  const load = createLaunchSessionLoader(storage, async () => { calls++; return key(); });
  await assert.rejects(() => load(payer), /damaged/); assert.equal(storage.getItem(name), '{bad'); assert.equal(calls, 0);
});
test('a previously prepared session with a missing mint cannot allocate a replacement', async () => {
  const storage = store(), payer = key().address;
  writeRecovery(storage, { ...newRecovery(payer), preparationRequested: true });
  const load = createLaunchSessionLoader(storage, async () => { throw new Error('Must not mint'); });
  await assert.rejects(() => load(payer), /original launch mint is missing/);
});
test('late initialization preserves newer fields for the same request', async () => {
  const storage = store(), payer = key().address, gate = deferred(), mint = key();
  const load = createLaunchSessionLoader(storage, async () => { await gate.promise; return mint; });
  const promise = load(payer); const saved = readRecovery(storage, payer);
  writeRecovery(storage, { ...saved, messageHash: 'newer-state' }); gate.resolve();
  assert.equal((await promise).messageHash, 'newer-state');
});
test('replaced request identity during initialization is not overwritten', async () => {
  const storage = store(), payer = key().address, gate = deferred(), mint = key();
  const load = createLaunchSessionLoader(storage, async () => { await gate.promise; return mint; });
  const promise = load(payer); const replacement = writeRecovery(storage, newRecovery(payer)); gate.resolve();
  await assert.rejects(() => promise, /saved launch changed/); assert.equal(readRecovery(storage, payer).requestId, replacement.requestId);
});
