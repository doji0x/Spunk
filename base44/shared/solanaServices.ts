import { secrets } from 'base44:runtime';

async function request(url, method, params, service) {
  let response;
  try {
    response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), redirect: 'manual', signal: AbortSignal.timeout(18000) });
  } catch { throw new Error(`${service} could not be reached. Please try again shortly.`); }
  if (!response.ok) throw new Error(`${service} rejected the request (HTTP ${response.status}). Check your provider access and limits.`);
  let body;
  try { body = await response.json(); } catch { throw new Error(`${service} returned an unreadable response.`); }
  if (body?.error) throw new Error(`${service} could not complete the lookup (code ${Number(body.error.code) || 'unknown'}).`);
  if (!body || Array.isArray(body) || !Object.prototype.hasOwnProperty.call(body, 'result')) throw new Error(`${service} returned an unexpected response. Check the configured endpoint.`);
  return body.result;
}

export async function solanaRpc(method, params) {
  const url = secrets.get('SOLANA_RPC_URL');
  if (!url) throw new Error('The private Solana RPC is not configured.');
  return request(url, method, params, 'Private Solana RPC');
}

export async function heliusRpc(method, params) {
  let url;
  try { url = new URL(secrets.get('INSCRIPTION_API_URL')); } catch { throw new Error('The Helius API URL is not configured correctly.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'mainnet.helius-rpc.com') throw new Error('Set the indexing API URL to your Helius mainnet RPC endpoint.');
  // DAS and paginated account discovery use Helius's RPC root, not /v0 REST paths.
  const key = secrets.get('INSCRIPTION_API_KEY') || url.searchParams.get('api-key');
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  if (key) url.searchParams.set('api-key', key);
  return request(url.toString(), method, params, 'Helius');
}

async function heliusAddressTransactions(address, limit, sortOrder) {
  const key = secrets.get('INSCRIPTION_API_KEY');
  if (!key) throw new Error('The Helius API key is not configured.');
  const url = new URL(`https://api.helius.xyz/v0/addresses/${address}/transactions`);
  url.searchParams.set('api-key', key);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('sort-order', sortOrder);
  let response;
  try { response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(18000) }); } catch { throw new Error('Helius address history could not be reached.'); }
  if (!response.ok) throw new Error(`Helius address history is unavailable (HTTP ${response.status}).`);
  const transactions = await response.json();
  if (!Array.isArray(transactions)) throw new Error('Helius address history returned an unexpected response.');
  return transactions;
}

export async function recentAddressSignatures(address, limit = 20) {
  const transactions = await heliusAddressTransactions(address, Math.min(limit, 20), 'desc');
  return [...new Set(transactions.map(tx => tx.signature))].filter(signature => typeof signature === 'string' && /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature));
}

export async function inscriptionHistoryAccounts(metadataKey) {
  const transactions = await heliusAddressTransactions(metadataKey, 3, 'asc');
  return [...new Set(transactions.flatMap(tx => (tx.accountData || []).map(a => a.account)))].filter(a => typeof a === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)).slice(0, 100);
}

export async function indexedAsset(mint) {
  try {
    const asset = await heliusRpc('getAsset', { id: mint });
    return asset?.id === mint ? { status: 'found', mint: asset.id, name: String(asset.content?.metadata?.name || '').slice(0, 200), uri: typeof asset.content?.json_uri === 'string' ? asset.content.json_uri : '' } : { status: 'not_found' };
  } catch { return { status: 'unavailable' }; }
}