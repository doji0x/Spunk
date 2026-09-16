import { Buffer } from 'node:buffer';

function pick(source) {
  const name = String(source?.name || '').slice(0, 32);
  const symbol = String(source?.symbol || '').slice(0, 10);
  const description = String(source?.description || '').slice(0, 1000);
  return name && symbol ? { name, symbol, description } : null;
}

// Primary source is the JSON written to the root inscription account; the Metaplex gateway is only a fallback.
export async function inscribedFields(rootAccount, root) {
  if (rootAccount?.data?.[0]) {
    const text = Buffer.from(rootAccount.data[0], 'base64').toString('utf8');
    const end = text.lastIndexOf('}');
    if (end > 0) {
      try {
        const fields = pick(JSON.parse(text.slice(0, end + 1)));
        if (fields) return fields;
      } catch { /* fall through to the gateway */ }
    }
  }
  const response = await fetch(`https://igw.metaplex.com/mainnet/${root}`, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('The inscription metadata could not be read on-chain or from the gateway.');
  const fields = pick(await response.json());
  if (!fields) throw new Error('The inscription metadata has no name or symbol.');
  return fields;
}