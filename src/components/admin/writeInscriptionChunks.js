import { base44 } from '@/api/base44Client';

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const encode = bytes => { let text = ''; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text); };

export default async function writeInscriptionChunks(pending, onConfirmed) {
  const confirmed = new Set(pending.confirmedOffsets || []);
  const offsets = [];
  for (let offset = 0; offset < pending.bytes.length; offset += pending.batchBytes) {
    if (!confirmed.has(offset)) offsets.push(offset);
  }
  let cursor = 0;
  let failure = null;
  let latest = pending;
  async function worker() {
    while (!failure && cursor < offsets.length) {
      const offset = offsets[cursor++];
      const chunk = pending.bytes.slice(offset, offset + pending.batchBytes);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const { data } = await base44.functions.invoke('mintInscribedNft', { action: 'append', mint: pending.mint, offset, totalSize: pending.bytes.length, mimeType: pending.mimeType, data: encode(chunk) });
          if (data.error || data.nextOffset !== offset + chunk.length) throw new Error(data.error || 'The chunk confirmation did not match its offset.');
          confirmed.add(offset);
          let frontier = 0;
          while (confirmed.has(frontier)) frontier += Math.min(pending.batchBytes, pending.bytes.length - frontier);
          latest = { ...pending, offset: frontier, confirmedOffsets: [...confirmed].sort((a, b) => a - b) };
          onConfirmed(latest);
          break;
        } catch (error) {
          if (attempt === 2 || failure) { failure ||= error; break; }
          await wait(500 * (attempt + 1));
        }
      }
    }
  }
  // Drain both workers before exposing Resume, including a sibling still confirming.
  await Promise.all([worker(), worker()]);
  if (failure) throw failure;
  return latest;
}