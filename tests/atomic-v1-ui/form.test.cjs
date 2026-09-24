const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Render the actual form with presentational children; no wallet or RPC calls.
const source = fs.readFileSync('src/components/atomic/AtomicV1Form.jsx', 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} });
const namespace = { exports: {} };
function moduleRequire(name) {
  if (name === 'react' || name === 'react/jsx-runtime') return require(name);
  if (name === 'lucide-react') return { Loader2: () => null, Rocket: () => null };
  if (name.endsWith('/ui/button')) return { Button: props => React.createElement('button', props) };
  if (name.endsWith('/ui/input')) return { Input: props => React.createElement('input', props) };
  if (name.endsWith('/ui/label')) return { Label: props => React.createElement('label', props) };
  return { __esModule: true, default: () => null };
}
new Function('require', 'module', 'exports', outputText)(moduleRequire, namespace, namespace.exports);
const Form = namespace.exports.default;
const state = { input: { name: 'Test', symbol: 'T', description: '', firstBuyAmount: '' },
  setInput() {}, setFile() {}, file: null, size: null, sizing: false, busy: false, error: '', launch() {}, links: {}, setLink() {} };
function button(overrides, props = {}) {
  const html = renderToStaticMarkup(React.createElement(Form, { state: { ...state, ...overrides }, ...props }));
  const match = html.match(/<button[^>]*type="submit"[^>]*>/);
  assert.ok(match); return match[0];
}
test('public launch remains clickable before any size preview is available', () => {
  assert.doesNotMatch(button({}, { allowUnestimatedSubmit: true }), /disabled/);
});
test('in-flight or stale negative previews do not block a fresh public preparation', () => {
  assert.doesNotMatch(button({ sizing: true }, { allowUnestimatedSubmit: true }), /disabled/);
  assert.doesNotMatch(button({ size: { remainingBytes: -1 } }, { allowUnestimatedSubmit: true }), /disabled/);
});
test('duplicate clicks stay disabled while a launch action is running', () => {
  assert.match(button({ busy: true }, { allowUnestimatedSubmit: true }), /disabled/);
});
test('admin form retains its existing required-size behavior', () => {
  assert.match(button({}), /disabled/);
  assert.doesNotMatch(button({ size: { remainingBytes: 1 } }), /disabled/);
});
