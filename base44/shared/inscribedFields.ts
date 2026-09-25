import { Buffer } from 'node:buffer';

function pick(source) {
  const fields = {};
  for (const [key, limit] of [['name', 32], ['symbol', 10], ['description', 1000]]) {
    if (typeof source?.[key] === 'string') fields[key] = source[key].slice(0, limit);
  }
  if (source?.mediaType === 'audio' && source?.mediaMime === 'audio/mpeg') {
    fields.mediaType = 'audio'; fields.mediaMime = 'audio/mpeg';
  } else {
    fields.mediaType = 'image';
    if (typeof source?.mediaMime === 'string') fields.mediaMime = source.mediaMime.slice(0, 50);
  }
  return fields;
}

export async function inscribedFields(rootAccount, root, allowLegacyFallback = false) {
  let onChain = {};
  if (rootAccount?.data?.[0]) {
    const text = Buffer.from(rootAccount.data[0], 'base64').toString('utf8').replace(/\0+$/, '').trim();
    try { onChain = pick(JSON.parse(text)); } catch { /* Missing or incomplete root JSON. */ }
    if (onChain.name && onChain.symbol) return { description: '', ...onChain };
  }
  if (!allowLegacyFallback) throw new Error('The raw inscription must contain its name and symbol in on-chain JSON; no gateway fallback is allowed.');
  const response = await fetch(`https://igw.metaplex.com/mainnet/${root}`, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('The legacy inscription metadata could not be read on-chain or from the gateway.');
  const fields = { description: '', ...pick(await response.json()), ...onChain };
  if (!fields.name || !fields.symbol) throw new Error('The inscription metadata has no name or symbol.');
  return fields;
}