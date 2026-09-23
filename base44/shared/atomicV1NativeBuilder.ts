import { fromLegacyTransactionInstruction } from 'npm:@solana/compat@8.3.0';
import { address, appendTransactionMessageInstructions, compileTransaction, createTransactionMessage,
  getTransactionEncoder, pipe, setTransactionMessageConfig, setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash } from 'npm:@solana/kit@8.3.0';
import { COMMITMENT_BYTES, MAX_V1_BYTES, NOOP, commitmentPayload, inspectMessage, sha256, toBase64 } from './atomicV1Protocol.js';

export async function buildUnsignedAtomicV1({ legacyInstructions, payerAddress, latest, mint, imageBytes, computeUnitLimit = 1400000 }) {
  const payload = await commitmentPayload(mint, imageBytes);
  const pump = legacyInstructions.filter(ix => ix.programId.toBase58() !== 'ComputeBudget111111111111111111111111111111')
    .map(fromLegacyTransactionInstruction);
  const compile = data => compileTransaction(pipe(createTransactionMessage({ version: 1 }),
    m => setTransactionMessageFeePayer(address(payerAddress), m),
    m => setTransactionMessageLifetimeUsingBlockhash({ blockhash: latest.blockhash, lastValidBlockHeight: BigInt(latest.lastValidBlockHeight) }, m),
    m => appendTransactionMessageInstructions([...pump, { programAddress: address(NOOP), accounts: [], data }], m),
    m => setTransactionMessageConfig({ computeUnitLimit, loadedAccountsDataSizeLimit: 67108864, priorityFeeLamports: 5000n }, m)));
  const transaction = compile(payload), message = new Uint8Array(transaction.messageBytes);
  const parsed = inspectMessage(message, false), base = inspectMessage(new Uint8Array(compile(payload.slice(0, COMMITMENT_BYTES)).messageBytes), false);
  const imageSha256 = await sha256(imageBytes);
  const size = { imageBytes: imageBytes.length, commitmentBytes: payload.length, transactionBytesWithoutImage: base.wireSize,
    finalSerializedTransactionBytes: parsed.wireSize, maximumBytes: MAX_V1_BYTES, remainingBytes: MAX_V1_BYTES - parsed.wireSize,
    requiredReductionBytes: Math.max(0, parsed.wireSize - MAX_V1_BYTES), coinMint: mint, imageSha256 };
  return { messageBase64: toBase64(message), messageHash: await sha256(message), signerAddresses: parsed.signers,
    blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight, size,
    unsignedTransactionBase64: parsed.wireSize <= MAX_V1_BYTES ? toBase64(new Uint8Array(getTransactionEncoder().encode(transaction))) : '' };
}
