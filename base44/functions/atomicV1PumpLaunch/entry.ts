import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { Buffer } from 'node:buffer';
import { fromLegacyTransactionInstruction, createTransactionMessage, getTransactionSize, assertIsTransactionWithinSizeLimit } from '@solana/kit';
import { PUMP_SDK } from '@pump-fun/pump-sdk';
import { sha256 } from '../../../shared/guard.ts';

const TRANSACTION_VERSION = 1;
const SPL_NOOP_PROGRAM_ID = 'noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV';
const VALIDATE_PREFIX = 'VALIDATE';

async function createAtomicV1Launch(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Use POST.' }, { status: 405 });
    }

    const expectedKey = secrets.get('AGENT_INSCRIBE_API_KEY');
    const authorization = req.headers.get('authorization') || '';
    const receivedKey = req.headers.get('x-api-key') || (authorization.startsWith('Bearer ') ? authorization.slice(7) : '');

    if (!(await secretsMatch(receivedKey, expectedKey))) {
      return Response.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const input = await req.json();

    // Validate image
    // This should account for size, format, and compliance with the VALIDATE prefix
    if (!input || typeof input !== 'object' || !input.image) {
      return Response.json({ error: 'Image data is required.' }, { status: 400 });
    }

    const imageBytes = Buffer.from(input.image, 'base64');
    const imageHash = sha256(imageBytes);
    const mintPublicKeyBytes = Buffer.from(input.mintPublicKey, 'base64');

    const payload = Buffer.concat([
      Buffer.from(VALIDATE_PREFIX),
      Uint8Array.of(1),
      mintPublicKeyBytes,
      imageHash,
      imageBytes
    ]);

    // BUILD transaction
    const pumpInstructions = PUMP_SDK.createV2Instruction(input.pumpData); // Adjust for V2, confirm data structure
    const pumpInstructionsKit = pumpInstructions.map(fromLegacyTransactionInstruction);

    const noopInstructionKit = new TransactionInstruction({
      keys: [],
      programId: SPL_NOOP_PROGRAM_ID,
      data: payload
    });

    const message = createTransactionMessage({
      payerKey: input.payerPublicKey,
      instructions: [...pumpInstructionsKit, noopInstructionKit],
      recentBlockhash: input.recentBlockhash,
      version: TRANSACTION_VERSION
    });

    const size = getTransactionSize(message);
    assertIsTransactionWithinSizeLimit(size);

    // Construct the transaction
    const transaction = new Transaction({
      message,
      signatures: [
        { publicKey: input.payerPublicKey, signature: null },
        { publicKey: input.mintPublicKey, signature: null }
      ]
    });

    // TODO: Add signing logic

    return Response.json({ message: 'Atomic V1 launch initiated.' }, { status: 202 });

  } catch (error) {
    return Response.json({ error: error.message || 'Unable to process the request.' }, { status: 500 });
  }
}

export default createAtomicV1Launch;
