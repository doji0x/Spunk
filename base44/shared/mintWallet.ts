import bs58 from 'npm:bs58@6.0.0';

export function parseWallet(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('MINT_WALLET_SECRET_KEY is missing or empty. Re-save a 64-byte Solana keypair in Secrets.');
  }
  const normalized = value.trim();
  let bytes;
  try {
    bytes = normalized.startsWith('[') ? Uint8Array.from(JSON.parse(normalized)) : bs58.decode(normalized);
  } catch {
    throw new Error('MINT_WALLET_SECRET_KEY must be a base58 keypair or a JSON array of 64 bytes.');
  }
  if (bytes.length !== 64) throw new Error('MINT_WALLET_SECRET_KEY must contain exactly 64 bytes.');
  return bytes;
}

export async function assertMainnet(rpcUrl) {
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getGenesisHash' }) });
  const payload = await response.json();
  if (payload.result !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d') throw new Error('Minting is locked to Solana mainnet.');
}

export async function rpcRequest(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || 'Solana RPC request failed.');
  return payload.result;
}