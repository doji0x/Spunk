import { decodeBase58, encodeBase58 } from '@/lib/base58';

const fromBase64 = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));
const toBase64 = bytes => btoa(String.fromCharCode(...bytes));

// Phantom's signTransaction cannot deserialize a Solana version 1 message (it fails with
// "reached end of buffer unexpectedly"), so the wallet signs the compiled message bytes
// directly. An ed25519 signature over those bytes IS the transaction signature.
async function walletSignature(provider, messageBytes) {
  if (!provider?.isPhantom) throw new Error('Connect Phantom to sign the atomic V1 launch.');
  const result = await provider.request({ method: 'signMessage', params: { message: encodeBase58(messageBytes), display: 'hex' } });
  const signature = result?.signature;
  const bytes = typeof signature === 'string' ? decodeBase58(signature) : signature && new Uint8Array(signature);
  if (!bytes || bytes.length !== 64) throw new Error('Phantom did not return a signature for this version 1 transaction.');
  return bytes;
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