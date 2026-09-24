// Read-only SDK ABI diagnostics. No RPC, wallet or broadcast.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const require = createRequire(import.meta.url);
const entry = require.resolve('@pump-fun/pump-sdk');
const { PUMP_SDK } = require('@pump-fun/pump-sdk');
console.log('ENTRY', entry);
console.log('PACKAGE', readFileSync(resolve(dirname(entry), '../package.json'), 'utf8'));
console.log('BUY_V2', PUMP_SDK.buyV2Instruction.toString());
const text = readFileSync(entry, 'utf8');
for (const name of ['assertCreateV2FlagsAllowed', 'getFeeRecipient', 'createAndBuyQuote']) {
  const start = text.indexOf('function ' + name + '(');
  console.log('HELPER', name, text.slice(start, start + 3500));
}
try { const mod = await import('npm:@pump-fun/pump-sdk@2.0.0/dist/index.js'); console.log('EXPLICIT_CJS_IMPORT', Boolean(mod.PUMP_SDK)); }
catch (error) { console.log('EXPLICIT_CJS_IMPORT_ERROR', error.message); }
