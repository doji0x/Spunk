import { base58Decode, base58Encode, equalBytes, invariant, verifySignature } from '../../base44/shared/atomicV1Protocol.js';

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
/** Phantom's documented native signTransaction request:
 * https://docs.phantom.com/solana/sending-a-transaction#request-2
 * params.message is Base58 of the compiled MESSAGE, not the full transaction,
 * a hash, UTF-8 prose, or a V0-labelled object. Phantom must accept actual V1.
 * The mint signature is retained locally and added after the payer approves.
 */
export async function requestPhantomV1({ provider, message, mintAddress, mintSignature, payerAddress, codec, isCurrent }) {
  invariant(provider?.isPhantom && typeof provider.request === 'function', 'Phantom native request API is unavailable. Open the published site in Phantom or its browser extension.');
  invariant(isCurrent() && phantomAddress(provider) === payerAddress, 'The connected Phantom account changed before approval.');
  let result;
  try {
    result = await provider.request({ method: 'signTransaction', params: { message: base58Encode(message) } });
  } catch (reason) {
    const error = new Error(typeof reason?.message === 'string' ? reason.message : String(reason));
    Object.assign(error, { source: 'phantom', stage: 'wallet-signing', code: reason?.code, cause: reason });
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
    const transaction = result?.signedTransaction || result?.transaction || result;
    const wire = bytes(typeof transaction?.serialize === 'function'
      ? transaction.serialize({ requireAllSignatures: false, verifySignatures: false }) : transaction);
    invariant(wire && wire.length <= 4096, 'Phantom returned an unsupported transaction response. No transaction was submitted.');
    const decoded = codec.decode(wire);
    invariant(equalBytes(decoded.message, message), 'Phantom changed the prepared message. No transaction was submitted.');
    signature = decoded.signatures[payerAddress];
    const coSignature = decoded.signatures[mintAddress];
    invariant(!coSignature || coSignature.every(b => b === 0) || equalBytes(coSignature, mintSignature), 'Phantom returned a conflicting mint signature.');
  }
  invariant(signature && await verifySignature(signature, message, payerAddress), 'Phantom response did not contain a valid payer signature over the exact V1 message. Nothing was submitted.');
  return codec.encode(message, { [payerAddress]: signature, [mintAddress]: mintSignature });
}
