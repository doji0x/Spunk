const key = userId => `validate-inscription-log-v1:${userId}`;
const limit = entries => entries.slice(-80);

export function loadInscriptionLog(userId) {
  if (!userId) return [];
  try { return JSON.parse(localStorage.getItem(key(userId)) || '[]'); }
  catch { return []; }
}

export function addInscriptionLog(userId, message, details = '') {
  const entry = { id: crypto.randomUUID(), at: new Date().toISOString(), message, details };
  const entries = limit([...loadInscriptionLog(userId), entry]);
  localStorage.setItem(key(userId), JSON.stringify(entries));
  return entries;
}