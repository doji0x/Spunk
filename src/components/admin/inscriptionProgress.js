const key = userId => `validate-inscription-v2:${userId}`;
const encode = bytes => { let text = ''; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text); };

export function savePending(pending, userId, includeImage = false) {
  if (!userId) throw new Error('Sign in before starting an inscription.');
  if (includeImage) localStorage.setItem(`${key(userId)}:image`, JSON.stringify({ requestId: pending.requestId, data: encode(pending.bytes) }));
  const { bytes, ...progress } = pending;
  localStorage.setItem(key(userId), JSON.stringify(progress));
}

export function loadPending(userId) {
  const saved = localStorage.getItem(key(userId));
  if (!saved) return null;
  const pending = JSON.parse(saved);
  const image = JSON.parse(localStorage.getItem(`${key(userId)}:image`) || 'null');
  if (!image || image.requestId !== pending.requestId) throw new Error('The saved image is missing. Recover the existing mint using the original image.');
  return { ...pending, bytes: Uint8Array.from(atob(image.data), character => character.charCodeAt(0)) };
}

export function clearPending(userId) {
  localStorage.removeItem(key(userId));
  localStorage.removeItem(`${key(userId)}:image`);
}

export function confirmedProgress(pending) {
  if (!pending?.batchBytes) return 0;
  const count = (pending.confirmedOffsets || []).reduce((sum, offset) => sum + Math.min(pending.batchBytes, pending.bytes.length - offset), 0);
  return Math.round(count / pending.bytes.length * 100);
}