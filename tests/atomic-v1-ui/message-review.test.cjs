const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const source = fs.readFileSync('src/components/atomic/AtomicV1MessageReview.jsx', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', code)(require, mod, mod.exports);
const Review = mod.exports.default;
test('review explicitly describes coin creation/spending rather than login', () => {
  const html = renderToStaticMarkup(React.createElement(Review, { review: {
    name: 'Test coin', symbol: 'TST', payerAddress: 'payer', mintAddress: 'mint', firstBuySol: '1',
    imageByteLength: 1941, messageBytes: 3422, transactionBytes: 3550,
    messageHash: 'message-hash', imageSha256: 'image-hash', priorityFeeLamports: '5000',
    metadataUri: 'https://example.com/metadata', lastValidBlockHeight: 123,
  }, onDecision() {} }));
  for (const text of ['Experimental transaction authorization', 'not a login', 'coin creation', '1 SOL', 'rent and network fees',
    'message-hash', 'image-hash', '3550', 'reject transaction bytes', 'Cancel', 'Authorize this transaction and open Phantom']) assert.ok(html.includes(text), text);
  assert.ok(html.includes('role="dialog"'));
});
test('no experiment consent button exists until a specific review is supplied', () => {
  assert.equal(renderToStaticMarkup(React.createElement(Review, { review: null, onDecision() {} })), '');
});
