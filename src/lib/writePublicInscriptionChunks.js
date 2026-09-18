import { base44 } from '@/api/base44Client';
const encode = bytes => { let value = ''; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value); };
export default async function writePublicInscriptionChunks(pending, onProgress) {
  const confirmed = new Set(pending.confirmedOffsets || []);
  for (let offset = 0; offset < pending.bytes.length; offset += pending.batchBytes) {
    if (confirmed.has(offset)) continue;
    const chunk = pending.bytes.slice(offset, offset + pending.batchBytes);
    const { data } = await base44.functions.invoke('mintInscribedNft', { action: 'append', mint: pending.mint, offset, totalSize: pending.bytes.length, mimeType: pending.mimeType, data: encode(chunk), publicAuth: pending.publicAuth });
    if (data.error || data.nextOffset !== offset + chunk.length) throw new Error(data.error || 'An image chunk did not confirm.');
    confirmed.add(offset);
    pending = { ...pending, confirmedOffsets: [...confirmed] };
    onProgress(pending);
  }
  return pending;
}