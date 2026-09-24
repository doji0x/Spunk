import { base58Decode, equalBytes, fromBase64, inspectMessage, invariant, sha256, solLamports,
  verifySignature, verifyWire } from '../../base44/shared/atomicV1Protocol.js';
import { readCreate, validateIntent } from '../../base44/shared/atomicV1Intent.js';
import { phantomAddress } from './atomicV1PhantomRequest.js';

export const EXACT_MESSAGE_MODE = 'experimental-exact-message';

function signatureBytes(value) {
  if (typeof value === 'string') return base58Decode(value, 64);
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (Array.isArray(value) && value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) return Uint8Array.from(value);
  throw new Error('Phantom returned an unsupported message signature. Nothing was submitted.');
}
function assertAccount(provider, payer, isCurrent) {
  invariant(isCurrent() && provider.isConnected !== false && phantomAddress(provider) === payer,
    'The Phantom account changed. No transaction was submitted.');
}

/** Explicit experimental transaction authorization, NOT a login or normal wallet
 * transaction preview. Phantom may reject transaction-shaped input; respect that
 * refusal. Never prefix, hash, re-encode, disguise, or retry the supplied bytes.
 * The ordinary native transaction-signing implementation remains separate.
 */
export async function requestPhantomExactMessage({ provider, message, mintAddress, mintSignature,
  payerAddress, intent, codec, isCurrent, authorize, assertFresh, prepared }) {
  invariant(provider?.isPhantom && typeof provider.signMessage === 'function', 'This Phantom provider does not expose signMessage.');
  invariant(typeof authorize === 'function' && typeof assertFresh === 'function' && typeof isCurrent === 'function',
    'Explicit transaction review and freshness checks are required for experimental message signing.');
  const original = new Uint8Array(message), retainedMint = new Uint8Array(mintSignature);
  const parsed = inspectMessage(original);
  invariant(intent?.walletAddress === payerAddress && intent?.coinMint === mintAddress,
    'The experimental signing request differs from the reviewed wallet and mint.');
  await validateIntent(parsed, intent, await codec.derive(payerAddress, mintAddress));
  invariant(await verifySignature(retainedMint, original, mintAddress), 'Invalid mint signature.');
  const digest = await sha256(original);
  invariant(prepared?.messageHash === digest && equalBytes(fromBase64(prepared.messageBase64), original),
    'The experimental signing request is not the immutable prepared message.');
  const identity = readCreate(parsed.instructions[0].data);
  const review = Object.freeze({ mode: EXACT_MESSAGE_MODE, name: identity.name, symbol: identity.symbol,
    payerAddress, creatorAddress: identity.creator, mintAddress, metadataUri: identity.uri,
    firstBuySol: intent.firstBuyAmount || '0', firstBuyLamports: solLamports(intent.firstBuyAmount || '').toString(),
    imageSha256: intent.imageSha256, imageByteLength: intent.imageByteLength,
    messageHash: digest, messageBytes: original.length, transactionBytes: parsed.wireSize,
    priorityFeeLamports: parsed.config.priorityFeeLamports.toString(),
    blockhash: parsed.blockhash, lastValidBlockHeight: prepared.lastValidBlockHeight });
  assertAccount(provider, payerAddress, isCurrent);
  // Returning the digest binds this acknowledgement to THIS review. A fresh
  // blockhash/message requires fresh consent; consent is never saved to storage.
  const approvedDigest = await authorize(review);
  invariant(approvedDigest === digest, 'Experimental transaction authorization was cancelled. Nothing was signed or submitted.');
  await assertFresh(prepared);
  assertAccount(provider, payerAddress, isCurrent);
  invariant(equalBytes(message, original), 'The prepared message changed during review.');

  // An owned copy protects the immutable message from provider-side mutation.
  // "hex" is only Phantom's display hint. The input is raw compiled bytes,
  // NOT UTF-8 hex/Base58/Base64 text and NOT the entire transaction envelope.
  const signingBytes = new Uint8Array(original);
  const requestInfo = Object.freeze({ method: 'signMessage', mode: EXACT_MESSAGE_MODE,
    version: 1, messageBytes: original.length, transactionBytes: parsed.wireSize });
  let result;
  try {
    result = await provider.signMessage(signingBytes, 'hex');
  } catch (reason) {
    throw Object.assign(new Error(typeof reason?.message === 'string' ? reason.message : String(reason)),
      { source: 'phantom', stage: 'wallet-message-signing', code: reason?.code, cause: reason, requestInfo });
  }
  assertAccount(provider, payerAddress, isCurrent);
  invariant(equalBytes(signingBytes, original) && equalBytes(message, original), 'Message bytes changed during Phantom signing. Nothing was submitted.');
  if (result?.publicKey) invariant(phantomAddress({ publicKey: result.publicKey }) === payerAddress,
    'Phantom returned a signature for another account. Nothing was submitted.');
  if (result?.signedMessage !== undefined) invariant(result.signedMessage instanceof Uint8Array &&
    equalBytes(result.signedMessage, original), 'Phantom signed different or prefixed bytes. Nothing was submitted.');
  const signature = signatureBytes(result?.signature);
  invariant(signature.length === 64 && await verifySignature(signature, original, payerAddress),
    'Phantom did not sign the exact prepared V1 message. Nothing was submitted.');
  invariant(await verifySignature(retainedMint, original, mintAddress), 'The retained mint signature is invalid.');
  const wire = codec.encode(original, { [payerAddress]: signature, [mintAddress]: retainedMint });
  await verifyWire(wire);
  return wire; // Submission is the existing caller/backend path, not signMessage.
}
