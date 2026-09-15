export const encodeBase64 = bytes => {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return window.btoa(value);
};

export const sha256Hex = async bytes => {
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

export const formatSol = lamports => `${(Number(lamports || 0) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`;