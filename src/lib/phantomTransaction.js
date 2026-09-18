function shortVec(bytes, start = 0) {
  let value = 0, shift = 0, offset = start;
  while (offset < bytes.length) { const byte = bytes[offset++]; value |= (byte & 127) << shift; if (!(byte & 128)) break; shift += 7; }
  return [value, offset];
}
function fromBase64(value) {
  const binary = atob(value); return Uint8Array.from(binary, character => character.charCodeAt(0));
}
export function phantomTransaction(value) {
  const bytes = fromBase64(value); const [count, offset] = shortVec(bytes);
  const signatures = Array.from({ length: count }, (_, index) => bytes.slice(offset + index * 64, offset + (index + 1) * 64));
  const messageBytes = bytes.slice(offset + count * 64);
  return {
    version: 0,
    signatures,
    message: { serialize: () => messageBytes },
    serialize: () => bytes,
  };
}