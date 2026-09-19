import { createKeyPairFromPrivateKeyBytes, getAddressFromPublicKey, signBytes } from '@solana/kit';

// The coin mint keypair belongs to the launching user's browser, never to a server
// wallet. The seed is kept locally so an interrupted launch can resume onto the
// exact same coin mint without any server-side derivation.
const storageKey = 'validate-launch-mint-keys';
const toHex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
const fromHex = value => Uint8Array.from(value.match(/.{2}/g).map(pair => Number.parseInt(pair, 16)));

function readStore() {
  try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; }
}

export function hasLaunchMintKey(requestId) {
  return Boolean(readStore()[requestId]);
}

export async function launchMintKey(requestId) {
  const store = readStore();
  let seed = store[requestId];
  if (!seed) {
    seed = toHex(crypto.getRandomValues(new Uint8Array(32)));
    store[requestId] = seed;
    localStorage.setItem(storageKey, JSON.stringify(store));
  }
  const keyPair = await createKeyPairFromPrivateKeyBytes(fromHex(seed));
  return {
    address: await getAddressFromPublicKey(keyPair.publicKey),
    sign: async messageBytes => new Uint8Array(await signBytes(keyPair.privateKey, messageBytes)),
  };
}