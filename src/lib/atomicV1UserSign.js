import { decodeBase58, encodeBase58 } from '@/lib/base58';

const fromBase64 = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));
const toBase64 = bytes => btoa(String.fromCharCode(...bytes));

// Phantom's request-based signTransaction takes raw message bytes and returns a detached
// signature, so a version 1 message is signed without Phantom having to deserialize it.
async function walletSignature(provider, messageBytes) {
  if (!provider?.isPhantom) throw new Error('Connect Phantom to sign the atomic V1 launch.');
  try {
    const result = await provider.request({ method: 'signTransaction', params: { message: encodeBase58(messageBytes) } });
    const signature = result?.signature;
    if (typeof signature !== 'string') throw new Error('empty signature');
    return decodeBase58(signature);
  } catch (reason) {
    if (/reject|denied|cancel/i.test(reason?.message || '')) throw reason;
    // Phantom cannot deserialize a Solana version 1 message, so it answers with a buffer
    // error. Signing the exact same bytes detached produces the identical signature.
    const signed = await provider.signMessage(messageBytes);
    const signature = signed?.signature || signed;
    if (!signature || signature.length !== 64) throw new Error('Phantom did not return a signature for this version 1 transaction.');
    return signature instanceof Uint8Array ? signature : new Uint8Array(signature);
  }
}

// Collects one signature per required signer: the connected wallet as fee payer and creator,
// and the browser-held coin mint keypair.
export async function signAtomicV1({ provider, prepared, walletAddress, mint }) {
  const messageBytes = fromBase64(prepared.messageBase64);
  const signatures = {};
  for (const signer of prepared.signerAddresses) {
    if (signer === walletAddress) signatures[signer] = toBase64(await walletSignature(provider, messageBytes));
    else if (signer === mint.address) signatures[signer] = toBase64(await mint.sign(messageBytes));
    else throw new Error(`The prepared transaction requires an unexpected signer (${signer}).`);
  }
  return signatures;
}