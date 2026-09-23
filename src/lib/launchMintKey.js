import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';

// Only the launch mint key is stored here, never the connected wallet's key.
const storageKey = 'validate-launch-mint-keys';
const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const toHex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
const fromHex = value => Uint8Array.from(value.match(/.{2}/g).map(pair => Number.parseInt(pair, 16)));
function readStore() {
  const raw = localStorage.getItem(storageKey);
  if (raw === null) return {};
  const store = JSON.parse(raw);
  if (!store || typeof store !== 'object' || Array.isArray(store)) throw new Error('Invalid saved mint keys. Preserve the browser data before recovering.');
  return store;
}
export function hasLaunchMintKey(requestId) { return Boolean(readStore()[requestId]); }
export function removeLaunchMintKey(requestId) {
  const store = readStore(); delete store[requestId];
  localStorage.setItem(storageKey, JSON.stringify(store));
}
export async function launchMintKey(requestId) {
  const store = readStore();
  let seed = store[requestId];
  if (!seed) {
    seed = toHex(crypto.getRandomValues(new Uint8Array(32)));
    store[requestId] = seed;
    localStorage.setItem(storageKey, JSON.stringify(store));
    if (readStore()[requestId] !== seed) throw new Error('The browser could not save the mint key. Nothing should be signed.');
  }
  if (typeof seed !== 'string' || !/^[0-9a-f]{64}$/.test(seed)) throw new Error('The saved mint key is damaged. Do not replace it.');
  const keypair = Keypair.fromSeed(fromHex(seed));
  const address = keypair.publicKey.toBase58();
  if (!addressPattern.test(address)) throw new Error('The coin mint key could not be generated.');
  return { address, sign: async messageBytes => nacl.sign.detached(messageBytes, keypair.secretKey) };
}
