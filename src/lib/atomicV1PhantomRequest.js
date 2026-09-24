import { base58Decode, equalBytes, invariant, verifySignature } from '../../base44/shared/atomicV1Protocol.js';

// App transport, NOT a fabricated Wallet Standard transaction capability.
export const PHANTOM_REQUEST = 'phantom-request';
/** @param {any} [target] */
export function getInjectedPhantom(target = globalThis.window) {
  return [target?.phantom?.solana, target?.solana].find(provider =>
    provider?.isPhantom && typeof provider.request === 'function') || null;
}
export function phantomAddress(provider) {
  const key = provider?.publicKey;
  const value = typeof key === 'string' ? key : key?.toBase58?.() || key?.toString?.();
  base58Decode(value);
  return value;
}
export function isPhantomRequest(wallet) {
  return wallet?.transport === PHANTOM_REQUEST && wallet.provider?.isPhantom === true &&
    typeof wallet.provider.request === 'function';
}
function bytes(value, length = undefined) {
  let output;
  if (value instanceof Uint8Array) output = new Uint8Array(value);
  else if (value instanceof ArrayBuffer) output = new Uint8Array(value);
  else if (Array.isArray(value) && value.every(b => Number.isInteger(b) && b >= 0 && b <= 255)) output = Uint8Array.from(value);
  else if (value?.type === 'Buffer' && Array.isArray(value.data)) return bytes(value.data, length);
  if (output) invariant(length === undefined || output.length === length, 'Unexpected Phantom signature length.');
  return output;
}
function responseSignature(value) {
  return typeof value === 'string' ? base58Decode(value, 64) : bytes(value, 64);
}
/** Pass a real, complete V1 VersionedTransaction to the native method.
 * Do NOT apply the legacy request({params:{message:...}}) example to V1.
 * The label PHANTOM_REQUEST is retained for saved-record/backend compatibility;
 * it no longer means the legacy raw-message request transport is used.
 */
export async function requestPhantomV1({ provider, message, mintAddress, mintSignature, payerAddress, codec, isCurrent }) {
  invariant(provider?.isPhantom && typeof provider.signTransaction === 'function',
    'This Phantom provider does not expose native signTransaction. No alternate signing request was made.');
  invariant(isCurrent() && phantomAddress(provider) === payerAddress, 'The connected Phantom account changed before approval.');
  invariant(typeof codec.toWalletTransaction === 'function', 'The V1 wallet transaction codec is missing.');
  const wire = codec.encode(message, { [mintAddress]: mintSignature });
  const decodedInput = codec.decode(wire);
  invariant(decodedInput.signers.length === 2 && decodedInput.signers[0] === payerAddress && decodedInput.signers[1] === mintAddress,
    'The wallet transaction has unexpected signer addresses.');
  const adapter = codec.toWalletTransaction(wire);
  const requestInfo = { method: 'signTransaction', transport: 'versioned-transaction-object', version: 1,
    messageBytes: message.length, transactionBytes: wire.length, signatureSlots: decodedInput.signers.length };
  let result;
  try {
    // Exactly one native sign-only request from the Launch flow. Never switch
    // APIs after an error, send a truncated message, or relabel this as V0.
    result = await provider.signTransaction(adapter.transaction);
  } catch (reason) {
    const error = new Error(typeof reason?.message === 'string' ? reason.message : String(reason));
    Object.assign(error, { source: 'phantom', stage: 'wallet-signing', code: reason?.code, cause: reason, requestInfo });
    throw error;
  }
  invariant(isCurrent() && phantomAddress(provider) === payerAddress, 'The Phantom account changed during approval; no transaction was submitted.');
  if (result?.publicKey) {
    const returned = typeof result.publicKey === 'string' ? result.publicKey : result.publicKey.toBase58?.() || result.publicKey.toString?.();
    invariant(returned === payerAddress, 'Phantom returned a signature for a different account.');
  }
  let signature;
  if (result?.signature !== undefined && (typeof result.signature === 'string' || bytes(result.signature))) {
    signature = responseSignature(result.signature);
  } else {
    const transaction = result?.signedTransaction || result?.transaction || result || adapter.transaction;
    // web3.js V1 results may be read-only. Validate every decoded field and
    // re-encode their signatures with Kit instead of calling that serializer.
    const signedWire = transaction?.message && Array.isArray(transaction.signatures)
      ? adapter.encodeResult(transaction)
      : bytes(typeof transaction?.serialize === 'function'
        ? transaction.serialize({ requireAllSignatures: false, verifySignatures: false }) : transaction);
    invariant(signedWire && signedWire.length <= 4096, 'Phantom returned an unsupported transaction response. No transaction was submitted.');
    const decoded = codec.decode(signedWire);
    invariant(equalBytes(decoded.message, message), 'Phantom changed the prepared message. No transaction was submitted.');
    signature = decoded.signatures[payerAddress];
    const coSignature = decoded.signatures[mintAddress];
    invariant(!coSignature || coSignature.every(b => b === 0) || equalBytes(coSignature, mintSignature), 'Phantom returned a conflicting mint signature.');
  }
  invariant(signature && await verifySignature(signature, message, payerAddress), 'Phantom response did not contain a valid payer signature over the exact V1 message. Nothing was submitted.');
  return codec.encode(message, { [payerAddress]: signature, [mintAddress]: mintSignature });
}
