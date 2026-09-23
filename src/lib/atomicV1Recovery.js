import { invariant } from '../../base44/shared/atomicV1Protocol.js';
const keyFor = address => `validate:atomic-v1:recovery:2:${address}`;
export function readRecovery(storage, address) {
  const raw = storage.getItem(keyFor(address));
  if (raw === null) return null;
  let saved;
  try { saved = JSON.parse(raw); } catch { throw new Error('The saved launch record is damaged. Do not replace its mint; recover the browser data first.'); }
  invariant(saved?.version === 2 && saved.walletAddress === address && typeof saved.requestId === 'string' &&
    /^[a-f0-9]{64}$/.test(saved.submitToken), 'Invalid saved launch recovery record.');
  return saved;
}
export function writeRecovery(storage, saved) {
  const encoded = JSON.stringify(saved);
  storage.setItem(keyFor(saved.walletAddress), encoded);
  invariant(storage.getItem(keyFor(saved.walletAddress)) === encoded, 'Unable to persist launch recovery. Nothing should be broadcast.');
  return saved;
}
export function clearRecovery(storage, address) { storage.removeItem(keyFor(address)); }
export function newRecovery(address) {
  return { version: 2, walletAddress: address, requestId: crypto.randomUUID(),
    submitToken: [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('') };
}
