// Real React 18 provider, page, form, hook, signing and recovery modules.
// Network, provider, mint storage and presentational children are test doubles.
// No runtime network calls or real wallet/fund access are permitted.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const React = require('react');
const Renderer = require('react-test-renderer');
const ts = require('typescript');
const { act } = Renderer;
const root = path.resolve(__dirname, '../..');
const protocolPath = '../../base44/shared/atomicV1Protocol.js';
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
function storage() { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k), data }; }

async function harness(options = {}) {
  const { fixture, key } = await import('../atomic-v1/fixtures.mjs');
  const { fromBase64, verifyWire, toBase64 } = await import(protocolPath);
  const f = await fixture(200), trace = [], minted = new Map();
  const provider = new EventEmitter(); let connects = 0, signatures = 0, uploads = 0, preparations = 0, submits = 0, mintRequests = 0;
  Object.assign(provider, { isPhantom: true, isConnected: Boolean(options.connected), publicKey: options.connected ? f.payer.address : null });
  provider.connect = async () => {
    trace.push('connect'); connects++;
    if (options.connectError) throw options.connectError;
    if (options.connectGate) await options.connectGate.promise;
    provider.publicKey = f.payer.address; provider.isConnected = true;
    provider.emit('connect', provider.publicKey); return { publicKey: provider.publicKey };
  };
  provider.disconnect = async () => { provider.isConnected = false; provider.publicKey = null; provider.emit('disconnect'); };
  provider.request = async () => { throw new Error('Do not use the legacy raw-message request for transaction approval'); };
  provider.signTransaction = async transaction => {
    trace.push('signTransaction'); signatures++;
    assert.equal(transaction.version, 1);
    assert.deepEqual(transaction.message.serialize(), f.message);
    assert.equal(transaction.serialize().length, f.message.length + 128);
    assert.deepEqual(transaction.signatures[1], f.mint.sign(f.message));
    if (options.signatureGate) await options.signatureGate.promise;
    if (options.signatureError) throw options.signatureError;
    transaction.signatures[0] = f.payer.sign(f.message);
    return transaction;
  };
  const local = storage();
  const win = new EventTarget(); win.phantom = { solana: provider };
  const previous = { window: global.window, localStorage: global.localStorage, navigator: Object.getOwnPropertyDescriptor(global, 'navigator') };
  global.window = win; global.localStorage = local;
  Object.defineProperty(global, 'navigator', { configurable: true, value: { locks: { request: async (name, _options, work) => {
    trace.push('lock'); assert.equal(name, `spunk:atomic-v1:${f.payer.address}`); return work({ name });
  } } } });
  let current, renderer, lastRecord;
  const fakeBase44 = { functions: { invoke: async (_fn, body) => {
    trace.push(body.action);
    if (body.action === 'config') return { data: { enabled: false, phantomRequestEnabled: !options.disabled, firstBuyEnabled: true, walletMethods: {} } };
    if (body.action === 'size') return { data: { size: { remainingBytes: 1000 } } };
    if (body.action === 'prepare') {
      preparations++;
      assert.equal(body.walletAddress, f.payer.address); assert.equal(body.mintAddress, f.mint.address);
      assert.equal(body.name, f.intent.name); assert.equal(body.symbol, f.intent.symbol);
      assert.equal(body.imageBase64, toBase64(f.image));
      assert.equal(body.description, 'Entered before wallet connection');
      assert.equal(body.socials.website, 'https://example.com');
      const prepared = { ...f.prepared, walletAddress: f.payer.address, signingTransport: 'phantom-request' };
      lastRecord = { ...body, ...f.intent, id: 'record', walletAddress: f.payer.address, coinMint: f.mint.address,
        status: 'prepared', metadataAuthorized: true, prepared };
      return { data: { launch: lastRecord, prepared } };
    }
    if (body.action === 'preflight') return { data: { fresh: true, messageHash: f.prepared.messageHash } };
    if (body.action === 'submit') {
      submits++; await verifyWire(fromBase64(body.signedTransactionBase64));
      lastRecord = { ...lastRecord, status: 'pending', transactionSignature: 'test-identity' };
      return { data: { launch: lastRecord, prepared: lastRecord.prepared } };
    }
    if (body.action === 'resume') return { data: { launch: lastRecord, prepared: lastRecord.prepared } };
    throw new Error(`Unexpected backend action: ${body.action}`);
  } }, integrations: { Core: { UploadPublicFile: async ({ file }) => {
    trace.push('upload'); uploads++;
    assert.equal(file.name, 'selected.png'); assert.equal(file.size, f.image.length);
    if (options.uploadGate) await options.uploadGate.promise;
    if (options.onUpload) options.onUpload(provider, f);
    return { file_url: 'https://example.com/test.png' };
  } } } };
  const mintModule = { launchMintKey: async id => {
    trace.push('mint'); mintRequests++;
    if (options.mintGate) await options.mintGate.promise;
    minted.set(id, f.mint); return f.mint;
  }, hasLaunchMintKey: id => minted.has(id), removeLaunchMintKey: id => minted.delete(id) };
  const cache = new Map();
  function load(filename) {
    let file = path.resolve(root, filename);
    if (!path.extname(file)) file += fs.existsSync(file + '.jsx') ? '.jsx' : '.js';
    if (cache.has(file)) return cache.get(file).exports;
    const source = fs.readFileSync(file, 'utf8');
    const mod = { exports: {} }; cache.set(file, mod);
    const code = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    function customRequire(name) {
      if (['react', 'react/jsx-runtime'].includes(name)) return require(name);
      if (name === '@/api/base44Client') return { base44: fakeBase44 };
      if (name === '@/lib/launchMintKey') return mintModule;
      if (name === '@/lib/atomicV1Kit') return { atomicV1Codec: f.codec };
      if (name === '@/hooks/usePublicAtomicV1Launch') {
        const hook = load('src/hooks/usePublicAtomicV1Launch.js').default;
        return { __esModule: true, default: () => { current = hook(); return current; } };
      }
      if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
      if (name === 'react-router-dom') return { Link: ({ to, children, ...props }) => React.createElement('a', { ...props, href: to }, children) };
      if (name.endsWith('/ui/button')) return { Button: props => React.createElement('button', props) };
      if (name.endsWith('/ui/input')) return { Input: props => React.createElement('input', props) };
      if (name.endsWith('/ui/label')) return { Label: props => React.createElement('label', props) };
      if ((name.includes('components/') || /AtomicV1(SizeMeter|ImagePreview|ImageLimitNotice)/.test(name)) && !name.endsWith('AtomicV1Form')) {
        return { __esModule: true, default: () => null };
      }
      if (name.startsWith('@/')) return load('src/' + name.slice(2));
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name));
      throw new Error(`Unexpected dependency: ${name}`);
    }
    new Function('require', 'module', 'exports', code)(customRequire, mod, mod.exports);
    return mod.exports;
  }
  const Provider = load('src/contexts/AtomicV1WalletContext.jsx').default;
  const Page = load('src/pages/PublicAtomicV1Launch.jsx').default;
  await act(async () => { renderer = Renderer.create(React.createElement(Provider, null, React.createElement(Page))); });
  const fill = async () => {
    await act(async () => {
      current.setInput({ name: f.intent.name, symbol: f.intent.symbol, description: 'Entered before wallet connection', firstBuyAmount: '' });
      current.setLink('website', 'https://example.com');
      current.setFile(new File([f.image], 'selected.png', { type: 'image/png' }));
    });
  };
  return { f, provider, local, renderer, trace, key, minted, fill,
    state: () => current, counts: () => ({ connects, signatures, uploads, preparations, submits, mintRequests }),
    submit: () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }),
    button: () => renderer.root.findAllByType('button').find(b => b.props.type === 'submit'),
    close: async () => {
      await act(async () => renderer.unmount());
      global.window = previous.window; global.localStorage = previous.localStorage;
      Object.defineProperty(global, 'navigator', previous.navigator);
    },
  };
}

test('actual Launch connects, awaits session, requests a full V1 signature and submits once', async () => {
  const h = await harness();
  try {
    await h.fill(); assert.equal(h.state().wallet.address, ''); assert.equal(h.state().session, null);
    assert.equal(h.button().props.disabled, false);
    await act(async () => { const promise = h.submit(); assert.ok(h.trace.includes('connect')); await promise; });
    assert.equal(h.state().error, '');
    assert.deepEqual(h.counts(), { connects: 1, signatures: 1, uploads: 1, preparations: 1, submits: 1, mintRequests: 3 });
    assert.equal(h.minted.size, 1);
    assert.ok(h.trace.indexOf('connect') < h.trace.indexOf('lock'));
    assert.ok(h.trace.indexOf('prepare') < h.trace.indexOf('signTransaction'));
    assert.equal(h.state().session.coinMint, h.f.mint.address);
    assert.equal(h.state().input.name, 'Test'); assert.equal(h.state().file.name, 'selected.png');
  } finally { await h.close(); }
});
test('already-connected Phantom is adopted without the separate Connect button', async () => {
  const h = await harness({ connected: true });
  try { await h.fill(); await act(async () => h.submit()); assert.equal(h.state().error, ''); assert.equal(h.counts().connects, 0); assert.equal(h.counts().signatures, 1); }
  finally { await h.close(); }
});
test('a deferred connection and React rerender preserve File and form fields', async () => {
  const gate = deferred(), h = await harness({ connectGate: gate }); let task;
  try {
    await h.fill(); await act(async () => { task = h.submit(); });
    assert.equal(h.state().busy, true); assert.equal(h.state().file.name, 'selected.png');
    assert.equal(h.counts().preparations, 0); assert.equal(h.counts().signatures, 0);
    await act(async () => { gate.resolve(); await task; });
    assert.equal(h.state().error, ''); assert.equal(h.counts().signatures, 1);
    assert.equal(h.state().input.description, 'Entered before wallet connection');
    assert.equal(h.state().links.website, 'https://example.com');
  } finally { gate.resolve(); await task; await h.close(); }
});
test('two submit events during connection produce one signature request', async () => {
  const gate = deferred(), h = await harness({ connectGate: gate }); let task;
  try { await h.fill(); await act(async () => { task = h.submit(); await h.submit(); });
    assert.equal(h.counts().connects, 1); await act(async () => { gate.resolve(); await task; });
    assert.equal(h.counts().signatures, 1); assert.equal(h.counts().submits, 1);
  } finally { gate.resolve(); await task; await h.close(); }
});
test('Launch awaits in-progress session initialization rather than a readiness gate', async () => {
  const gate = deferred(), h = await harness({ mintGate: gate }); let task;
  try {
    await h.fill(); await act(async () => h.state().wallet.connect());
    assert.equal(h.state().session, null); assert.equal(h.button().props.disabled, false);
    await act(async () => { task = h.submit(); }); assert.equal(h.counts().preparations, 0);
    await act(async () => { gate.resolve(); await task; });
    assert.equal(h.state().error, ''); assert.equal(h.counts().mintRequests, 3); assert.equal(h.counts().signatures, 1);
  } finally { gate.resolve(); await task; await h.close(); }
});
test('connection rejection retains Phantom code and does not upload or sign', async () => {
  const h = await harness({ connectError: { code: 4001, message: 'User rejected connection.' } });
  try { await h.fill(); await act(async () => h.submit());
    assert.equal(h.state().failure.source, 'Phantom'); assert.equal(h.state().failure.stage, 'wallet-connection');
    assert.equal(h.state().failure.code, 4001); assert.equal(h.state().error, 'User rejected connection.');
    assert.equal(h.counts().uploads, 0); assert.equal(h.counts().preparations, 0); assert.equal(h.counts().signatures, 0);
  } finally { await h.close(); }
});
test('wallet decoder rejection comes from the signing method and never submits', async () => {
  const h = await harness({ signatureError: { code: -32603, message: 'Reached end of buffer unexpectedly' } });
  try { await h.fill(); await act(async () => h.submit());
    assert.equal(h.state().failure.source, 'Phantom'); assert.equal(h.state().failure.stage, 'wallet-signing');
    assert.equal(h.state().failure.code, -32603); assert.equal(h.state().error, 'Reached end of buffer unexpectedly');
    assert.equal(h.counts().signatures, 1); assert.equal(h.counts().submits, 0);
  } finally { await h.close(); }
});
test('an account change during upload prevents signing old payer intent', async () => {
  const h = await harness({ onUpload(provider) { provider.publicKey = '11111111111111111111111111111111'; provider.emit('accountChanged', provider.publicKey); } });
  try { await h.fill(); await act(async () => h.submit()); assert.match(h.state().error, /Wallet changed/); assert.equal(h.counts().signatures, 0); assert.equal(h.counts().preparations, 0); }
  finally { await h.close(); }
});
test('a duplicate same-account event does not invalidate the launch', async () => {
  const h = await harness({ onUpload(provider) { provider.emit('accountChanged', provider.publicKey); } });
  try { await h.fill(); await act(async () => h.submit()); assert.equal(h.state().error, ''); assert.equal(h.counts().signatures, 1); }
  finally { await h.close(); }
});
test('rendering or connecting alone never requests a transaction signature', async () => {
  const h = await harness({ connected: true });
  try { await h.fill(); await act(async () => h.state().wallet.connect()); assert.equal(h.counts().signatures, 0); assert.equal(h.counts().preparations, 0); }
  finally { await h.close(); }
});
test('corrupt recovery remains intact instead of generating another mint', async () => {
  const h = await harness();
  try { await h.fill(); const key = `validate:atomic-v1:recovery:2:${h.f.payer.address}`; h.local.setItem(key, '{corrupt');
    await act(async () => h.submit()); assert.match(h.state().error, /damaged/);
    assert.equal(h.local.getItem(key), '{corrupt'); assert.equal(h.counts().mintRequests, 0); assert.equal(h.counts().signatures, 0);
  } finally { await h.close(); }
});
test('explicit operator disable is preserved', async () => {
  const h = await harness({ disabled: true });
  try { await h.fill(); await act(async () => h.submit()); assert.match(h.state().error, /explicitly disabled/); assert.equal(h.counts().connects, 0); assert.equal(h.counts().signatures, 0); }
  finally { await h.close(); }
});
