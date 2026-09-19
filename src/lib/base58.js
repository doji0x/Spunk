const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function encodeBase58(bytes) {
  const digits = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) { carry += digits[i] << 8; digits[i] = carry % 58; carry = (carry / 58) | 0; }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let leading = '';
  for (const byte of bytes) { if (byte !== 0) break; leading += '1'; }
  return leading + digits.reverse().map(digit => alphabet[digit]).join('');
}

export function decodeBase58(value) {
  const bytes = [];
  for (const character of value) {
    const index = alphabet.indexOf(character);
    if (index === -1) throw new Error('The wallet returned an unreadable signature.');
    let carry = index;
    for (let i = 0; i < bytes.length; i += 1) { carry += bytes[i] * 58; bytes[i] = carry & 255; carry >>= 8; }
    while (carry) { bytes.push(carry & 255); carry >>= 8; }
  }
  let leading = 0;
  for (const character of value) { if (character !== '1') break; leading += 1; }
  return Uint8Array.from([...new Array(leading).fill(0), ...bytes.reverse()]);
}