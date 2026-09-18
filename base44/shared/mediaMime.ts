import { Buffer } from 'node:buffer';
import { detectImageMime } from './imageMime.ts';

export function detectMp3Mime(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 3) return null;
  if (bytes.subarray(0, 3).toString('ascii') === 'ID3') return 'audio/mpeg';
  const version = (bytes[1] >> 3) & 0x03;
  const layer = (bytes[1] >> 1) & 0x03;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && version !== 1 && layer !== 0 ? 'audio/mpeg' : null;
}

export function detectMediaMime(bytes) {
  return detectImageMime(bytes) || detectMp3Mime(bytes);
}

export function mediaTypeForMime(mime) {
  return mime === 'audio/mpeg' ? 'audio' : 'image';
}