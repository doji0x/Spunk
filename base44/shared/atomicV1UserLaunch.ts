import { Buffer } from 'node:buffer';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { fromLegacyTransactionInstruction } from 'npm:@solana/compat@8.0.0';
import {
  address, appendTransactionMessageInstructions, compileTransaction, createTransactionMessage,
  pipe, setTransactionMessageConfig, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash
} from 'npm:@solana/kit@8.0.0';
import { bondingCurvePda } from 'npm:@pump-fun/pump-sdk@2.0.0';
import { rpcRequest } from './mintWallet.ts';
import { atomicAmount } from './pumpBuy.ts';
import { cleanSocials } from './launchSocials.ts';
import { atomicV1MaxBytes, commitmentHeaderBytes, commitmentPayload } from './atomicV1Launch.ts';
import { pumpInstructions } from './atomicV1Launcher.ts';

// User-signed Atomic V1: the connected wallet is the fee payer and the on-chain creator, and
// the coin mint keypair lives in the user's browser. No app wallet is ever loaded here — the
// server only builds the unsigned V1 message and submits the fully signed bytes back to Solana.
const appUrl = 'https://solvalidate.base44.app';
const noopProgram = 'noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV';
const computeBudgetProgram = 'ComputeBudget111111111111111111111111111111';

function compileV1({ legacyInstructions, payerAddress, latest, payload, computeUnitLimit }) {
  const pump = legacyInstructions.filter(ix => ix.programId.toBase58() !== computeBudgetProgram).map(fromLegacyTransactionInstruction);
  const noop = { programAddress: address(noopProgram), accounts: [], data: new Uint8Array(payload) };
  const message = pipe(
    createTransactionMessage({ version: 1 }),
    m => setTransactionMessageFeePayer(address(payerAddress), m),
    m => setTransactionMessageLifetimeUsingBlockhash({ blockhash: latest.blockhash, lastValidBlockHeight: BigInt(latest.lastValidBlockHeight) }, m),
    m => appendTransactionMessageInstructions([...pump, noop], m),
    m => setTransactionMessageConfig({ computeUnitLimit: computeUnitLimit || 700000, loadedAccountsDataSizeLimit: 64 * 1024 * 1024, priorityFeeLamports: 5000n }, m)
  );
  const compiled = compileTransaction(message);
  const messageBytes = Buffer.from(compiled.messageBytes);
  if (messageBytes[0] !== 0x81) throw new Error('The prepared transaction is not encoded as Solana version 1.');
  const requiredSignatures = messageBytes[1];
  const signerAddresses = Array.from({ length: requiredSignatures }, (_, index) => new PublicKey(messageBytes.subarray(42 + index * 32, 74 + index * 32)).toBase58());
  // A v1 wire transaction is the message followed by its 64-byte signatures.
  return { messageBytes, signerAddresses, size: messageBytes.length + requiredSignatures * 64 };
}

export async function buildUnsignedAtomicV1({ legacyInstructions, payerAddress, latest, mint, imageBytes }) {
  const committed = await commitmentPayload(mint, imageBytes);
  const final = compileV1({ legacyInstructions, payerAddress, latest, payload: committed.payload });
  const base = compileV1({ legacyInstructions, payerAddress, latest, payload: committed.payload.subarray(0, commitmentHeaderBytes) });
  if (!final.signerAddresses.includes(mint)) throw new Error('The coin mint is not a required signer of the V1 transaction.');
  if (!final.signerAddresses.includes(payerAddress)) throw new Error('The connected wallet is not a required signer of the V1 transaction.');
  return {
    messageBase64: final.messageBytes.toString('base64'),
    signerAddresses: final.signerAddresses,
    imageSha256: committed.hashHex,
    size: final.size,
    commitmentBytes: committed.payload.length,
    transactionBytesWithoutImage: base.size,
    remainingBytes: atomicV1MaxBytes - final.size,
    requiredReductionBytes: Math.max(0, final.size - atomicV1MaxBytes)
  };
}

// action is 'size' (no writes) or 'prepare' (persists the message awaiting wallet signatures).
export async function prepareUserAtomicV1({ entities, rpcUrl, body, input, imageBytes, imageMime, walletAddress, mintAddress, action }) {
  const [existing] = await entities.AtomicV1Launch.filter({ requestId: input.requestId });
  if (existing?.transactionSignature) return { launch: existing };
  const coinMint = mintAddress;
  const bondingCurve = bondingCurvePda(new PublicKey(coinMint)).toBase58();
  const metadataUri = `${appUrl}/functions/atomicV1Metadata?mint=${coinMint}`;
  const creator = new PublicKey(walletAddress);
  const legacyInstructions = await pumpInstructions({ rpcUrl, mintKey: new PublicKey(coinMint), input, metadataUri, creator, payer: creator });
  const latest = (await rpcRequest(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
  const built = await buildUnsignedAtomicV1({ legacyInstructions, payerAddress: walletAddress, latest, mint: coinMint, imageBytes });
  const size = { imageBytes: imageBytes.length, commitmentBytes: built.commitmentBytes, transactionBytesWithoutImage: built.transactionBytesWithoutImage, finalSerializedTransactionBytes: built.size, maximumBytes: atomicV1MaxBytes, remainingBytes: built.remainingBytes, requiredReductionBytes: built.requiredReductionBytes, coinMint, imageSha256: built.imageSha256 };
  if (action === 'size') return { size };
  if (built.size > atomicV1MaxBytes) return { status: 422, error: `The signed V1 transaction is ${built.size} bytes. Remove exactly ${built.requiredReductionBytes} bytes from the image before launching.`, size };
  if (typeof body.imageUrl !== 'string' || !/^https:\/\//.test(body.imageUrl)) return { status: 400, error: 'The public Pump image upload is missing.' };

  const balance = (await rpcRequest(rpcUrl, 'getBalance', [walletAddress, { commitment: 'confirmed' }])).value;
  const buyLamports = input.firstBuyAmount ? BigInt(atomicAmount(input.firstBuyAmount, 9).toString()) : 0n;
  if (BigInt(balance) < 30_000_000n + buyLamports) return { status: 422, error: 'Your wallet needs the first-buy amount plus about 0.03 SOL for rent and fees. Add SOL or lower the first buy.' };

  const submitToken = crypto.randomUUID();
  const record = { requestId: input.requestId, walletAddress, coinMint, bondingCurve, name: input.name, symbol: input.symbol, description: input.description, imageUrl: body.imageUrl, imageMime, imageByteLength: imageBytes.length, imageSha256: built.imageSha256, metadataUri, socials: cleanSocials(body.socials), messageBase64: built.messageBase64, signerAddresses: built.signerAddresses, submitToken, transactionVersion: 1, serializedTransactionBytes: built.size, commitment: 'VALIDATE-v1', atomicV1Verified: false, firstBuyAmount: input.firstBuyAmount, status: 'prepared', error: '', lastValidBlockHeight: latest.lastValidBlockHeight, checkedAt: new Date().toISOString() };
  const launch = existing ? await entities.AtomicV1Launch.update(existing.id, record) : await entities.AtomicV1Launch.create(record);
  return { prepared: { requestId: input.requestId, coinMint, bondingCurve, metadataUri, messageBase64: built.messageBase64, signerAddresses: built.signerAddresses, submitToken }, size, launch };
}

export async function submitUserAtomicV1({ entities, rpcUrl, body }) {
  const [launch] = await entities.AtomicV1Launch.filter({ requestId: String(body.requestId || '') });
  if (!launch?.messageBase64) return { status: 404, error: 'Start the launch again — no prepared transaction was found.' };
  if (launch.transactionSignature) return { launch };
  if (!launch.submitToken || launch.submitToken !== String(body.submitToken || '')) return { status: 403, error: 'This launch was already submitted or has expired. Start it again.' };

  const messageBytes = Buffer.from(launch.messageBase64, 'base64');
  const signatures = (launch.signerAddresses || []).map(signer => Buffer.from(String(body.signatures?.[signer] || ''), 'base64'));
  if (signatures.some(signature => signature.length !== 64 || signature.every(byte => byte === 0))) {
    return { status: 400, error: 'Both your wallet signature and the coin mint signature are required before submitting.' };
  }
  const encoded = Buffer.concat([messageBytes, ...signatures]).toString('base64');
  const simulation = (await rpcRequest(rpcUrl, 'simulateTransaction', [encoded, { encoding: 'base64', commitment: 'confirmed', sigVerify: true }])).value;
  if (simulation.err) {
    await entities.AtomicV1Launch.update(launch.id, { error: `Atomic V1 simulation failed, so nothing was sent: ${JSON.stringify(simulation.err)}`, checkedAt: new Date().toISOString() });
    return { status: 422, error: `Atomic V1 simulation failed, so nothing was sent: ${JSON.stringify(simulation.err)}`, logs: simulation.logs };
  }
  const signature = await rpcRequest(rpcUrl, 'sendTransaction', [encoded, { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 2 }]);
  return { launch: await entities.AtomicV1Launch.update(launch.id, { transactionSignature: signature, submitToken: '', status: 'pending', error: '', checkedAt: new Date().toISOString() }) };
}