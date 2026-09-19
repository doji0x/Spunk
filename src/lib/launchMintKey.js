import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';

// The coin mint keypair belongs to the launching user's browser, never to a server
// wallet. The seed is kept locally so an interrupted launch can resume onto the
// exact same coin mint without any server-side derivation.
const storageKey = 'validate-launch-mint-keys';
const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
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
  const keypair = Keypair.fromSeed(fromHex(seed));
  const address = keypair.publicKey.toBase58();
  if (!addressPattern.test(address)) throw new Error('The coin mint key could not be generated in this browser. Refresh the page and tap Launch again.');
  return {
    address,
    sign: async messageBytes => nacl.sign.detached(messageBytes, keypair.secretKey),
  };
}