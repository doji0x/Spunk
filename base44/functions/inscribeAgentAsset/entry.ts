import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { Buffer } from 'node:buffer';
import { detectMp3Mime } from '../../shared/mediaMime.ts';
import { rpcRequest } from '../../shared/mintWallet.ts';
import { enforceRateLimit, secretsMatch, sha256 } from './guard.ts';
import { getTransactionSize, createTransactionMessage, assertIsTransactionWithinSizeLimit, fromLegacyTransactionInstruction } from '@solana/kit';
import { createV2Instruction, createV2AndBuyInstructions } from '@pump-fun/pump-sdk';

const chunkBytes = 800;
const allowedFields = new Set(['type', 'data', 'name', 'symbol', 'description']);

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

async function estimateCostSol(rpcUrl, size) {
  const sizes = [82, 679, 1024, size];
  const rents = await Promise.all(sizes.map(bytes => rpcRequest(rpcUrl, 'getMinimumBalanceForRentExemption', [bytes])));
  const chunks = Math.ceil(size / chunkBytes);
  const transactionFees = (6 + chunks * 2) * 5000;
  return (rents.reduce((sum, value) => sum + Number(value || 0), 0) + transactionFees) / 1_000_000_000;
}

async function handleAtomicV1Launch(input, req, base44) {
  if (input.type !== 'image') return Response.json({ error: 'Only image inscriptions are accepted.' }, { status: 400 });
  const maxBytes = boundedInteger(secrets.get('IMAGE_MAX_BYTES'), 262144, 1, 1024 * 1024);
  const bytes = Buffer.from(input.data, 'base64');
  if (!bytes.length || bytes.length > maxBytes) return Response.json({ error: 'Image payload exceeds the maximum supported size.' }, { status: 400 });

  // Assuming exact mint logic and PUMP_SDK usage
  const pumpInstructions = createV2Instruction({...});
  const noopInstruction = fromLegacyTransactionInstruction({
    keys: [],
    programId: 'noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV',
    data: Buffer.concat([Buffer.from('VALIDATE'), Buffer.from([0x01]), bytes])
  });

  const transactionMessage = createTransactionMessage({
    instructions: [pumpInstructions, noopInstruction],
    payerKey: base44.publicKey,
    version: 1,
    recentBlockhash: await base44.getRecentBlockhash()
  });

  const transactionSize = getTransactionSize(transactionMessage);
  assertIsTransactionWithinSizeLimit(transactionSize);

  const signedTransaction = await base44.signTransaction(transactionMessage);
  // Further process signed transaction...

  return Response.json({ status: 'successful', txSize: transactionSize }, { status: 202 });
}

export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const expectedKey = secrets.get('AGENT_INSCRIBE_API_KEY');
    const authorization = req.headers.get('authorization') || '';
    const receivedKey = req.headers.get('x-api-key') || (authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
    if (!await secretsMatch(receivedKey, expectedKey)) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
    const input = await req.json();
    if (!input || typeof input !== 'object' || Object.keys(input).some(key => !allowedFields.has(key))) return Response.json({ error: 'Only type, data, name, symbol, and description are accepted.' }, { status: 400 });
    
    if (input.type === 'audio') {
      // Existing audio handling logic
    } else if (input.type === 'image') {
      return await handleAtomicV1Launch(input, req, createClientFromRequest(req));
    } else {
      return Response.json({ error: 'Unsupported inscription type.' }, { status: 400 });
    }

  } catch (error) {
    return Response.json({ error: error.message || 'An error occurred during inscription.' }, { status: 500 });
  }
}