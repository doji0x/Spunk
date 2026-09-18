import { Buffer } from 'node:buffer';
import { PNG } from 'npm:pngjs@7.0.0';
import jpeg from 'npm:jpeg-js@0.4.4';
import { GifReader } from 'npm:omggif@1.0.10';

const fallbackSize = 1200;
const maxSide = 1200;

function dimensions(bytes, mime) {
  if (mime === 'image/png' && bytes.length >= 24) return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  if (mime === 'image/jpeg') {
    for (let offset = 2; offset + 8 < bytes.length;) {
      if (bytes[offset] !== 255) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) return [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)];
      if (marker === 216 || marker === 217) { offset += 2; continue; }
      const length = bytes.readUInt16BE(offset + 2); offset += length > 1 ? length + 2 : 2;
    }
  }
  if (mime === 'image/gif' && bytes.length >= 10) return [bytes.readUInt16LE(6), bytes.readUInt16LE(8)];
  if (mime === 'image/webp' && bytes.length >= 30) {
    const kind = bytes.subarray(12, 16).toString();
    if (kind === 'VP8X') return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
    if (kind === 'VP8 ' && bytes.subarray(23, 26).equals(Buffer.from([157, 1, 42]))) return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
    if (kind === 'VP8L' && bytes[20] === 47) return [1 + bytes[21] + ((bytes[22] & 63) << 8), 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10)];
  }
  return null;
}

function decode(bytes, mime) {
  if (mime === 'image/png') return PNG.sync.read(bytes, { checkCRC: false });
  if (mime === 'image/jpeg') return jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, tolerantDecoding: true });
  if (mime === 'image/gif') {
    const gif = new GifReader(bytes); const data = Buffer.alloc(gif.width * gif.height * 4);
    gif.decodeAndBlitFrameRGBA(0, data); return { width: gif.width, height: gif.height, data };
  }
  return null;
}

export function expectedImage(rootAccount, fallback, detectedMime) {
  try {
    const fields = JSON.parse(Buffer.from(rootAccount.data[0], 'base64').toString().trim());
    const total = Number.isInteger(fields.imageSize) && fields.imageSize >= fallback ? fields.imageSize : fallback;
    return { total, mime: detectedMime || fields.imageMime || '' };
  } catch { return { total: fallback, mime: detectedMime || '' }; }
}

export function confirmedPrefixLength(bytes) {
  for (let index = 8; index <= bytes.length - 64; index += 1) {
    let empty = true;
    for (let offset = 0; offset < 64; offset += 1) if (bytes[index + offset] !== 0) { empty = false; break; }
    if (empty) return index;
  }
  return bytes.length;
}

export function partialImage(bytes, mime, expectedTotal) {
  let source = null;
  try { source = decode(bytes, mime); } catch { source = null; }
  const header = dimensions(bytes, mime);
  const sourceWidth = source?.width || header?.[0] || fallbackSize;
  const sourceHeight = source?.height || header?.[1] || fallbackSize;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const revealHeight = Math.round(height * Math.min(1, bytes.length / Math.max(bytes.length, expectedTotal)));
  const output = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const target = (y * width + x) * 4;
    const pale = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0;
    output.data[target] = pale ? 247 : 237; output.data[target + 1] = pale ? 248 : 240; output.data[target + 2] = pale ? 242 : 231; output.data[target + 3] = 255;
    if (source && y < revealHeight) {
      const sx = Math.min(source.width - 1, Math.floor(x / scale)); const sy = Math.min(source.height - 1, Math.floor(y / scale));
      const origin = (sy * source.width + sx) * 4;
      output.data[target] = source.data[origin]; output.data[target + 1] = source.data[origin + 1]; output.data[target + 2] = source.data[origin + 2]; output.data[target + 3] = source.data[origin + 3];
    }
  }
  return PNG.sync.write(output);
}