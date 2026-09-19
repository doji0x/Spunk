// Turns stored AstraMessage rows into model context Astra can cite by number.
const maxDigestChars = 4000;

export function nextTurn(stored) {
  return stored.filter(item => item.role === 'user').length + 1;
}

// User messages are prefixed with their turn number so Astra can cite "#N" exactly.
export function buildHistory(stored) {
  let turn = 0;
  return stored.filter(item => item.role !== 'activity').map(item => {
    if (item.role !== 'user') return { role: 'assistant', content: item.content };
    turn = item.turn || turn + 1;
    return { role: 'user', content: `[#${turn}] ${item.content}` };
  });
}

// A compact record of what Astra already did, so earlier reads and commits are remembered.
export function buildActivityDigest(stored) {
  const lines = stored.filter(item => item.role === 'activity').map(item => `- ${item.content}${item.detail ? ` (${item.detail})` : ''}`);
  if (!lines.length) return '';
  const text = lines.join('\n');
  const trimmed = text.length > maxDigestChars ? `…\n${text.slice(-maxDigestChars)}` : text;
  return `Earlier tool activity in this conversation:\n${trimmed}`;
}

export function summarizeToolArgs(args) {
  const { content, ...rest } = args || {};
  const parts = Object.entries(rest).map(([key, value]) => `${key}=${String(value)}`);
  if (typeof content === 'string') parts.push(`content=${content.length} chars`);
  return parts.join(', ');
}

export function summarizeToolResult(result) {
  if (result?.error) return `error: ${result.error}`;
  if (Array.isArray(result)) return `${result.length} items`;
  if (result && typeof result === 'object') {
    if (typeof result.content === 'string') return `${result.content.length} chars`;
    if (result.url) return `url ${result.url}`;
    return Object.keys(result).join(', ');
  }
  return String(result ?? '').slice(0, 120);
}