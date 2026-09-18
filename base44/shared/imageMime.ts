import { Buffer } from 'node:buffer';

export function detectImageMime(bytes) {
  const hex = bytes.subarray(0, 12).toString('hex');
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png';
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (/^474946383[79]61/.test(hex)) return 'image/gif';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

export function isCompleteImage(bytes, mime = detectImageMime(bytes)) {
  if (mime === 'image/png') return bytes.includes(Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]));
  if (mime === 'image/jpeg') return bytes.length >= 2 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  if (mime === 'image/gif') return bytes.length > 0 && bytes[bytes.length - 1] === 0x3b;
  if (mime === 'image/webp') return bytes.length >= 12 && bytes.readUInt32LE(4) + 8 <= bytes.length;
  return false;
}