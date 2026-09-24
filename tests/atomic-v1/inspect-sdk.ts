// Temporary read-only SDK ABI diagnostics; no RPC or signing.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PUMP_SDK } = require('@pump-fun/pump-sdk');
console.log('CREATE_AND_BUY', PUMP_SDK.createV2AndBuyV2Instructions.toString());
console.log('BUY_V2', PUMP_SDK.buyV2Instructions.toString());
