import bs58 from 'npm:bs58@6.0.0';

export const adminWalletSecretName = 'ADMIN_MINT_WALLET_SECRET_KEY';
export const publicWalletSecretName = 'MINT_WALLET_SECRET_KEY';

export function parseWallet(value, secretName = publicWalletSecretName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${secretName} is missing or empty. Re-save a 64-byte Solana keypair in Secrets.`);
  }
  const normalized = value.trim();
  let bytes;
  try {
    bytes = normalized.startsWith('[') ? Uint8Array.from(JSON.parse(normalized)) : bs58.decode(normalized);
  } catch {
    throw new Error(`${secretName} must be a base58 keypair or a JSON array of 64 bytes.`);
  }
  if (bytes.length !== 64) throw new Error(`${secretName} must contain exactly 64 bytes.`);
  return bytes;
}

export async function assertMainnet(rpcUrl) {
  const genesisHash = await rpcRequest(rpcUrl, 'getGenesisHash', []);
  if (genesisHash !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d') throw new Error('Minting is locked to Solana mainnet.');
}

export async function getLatestBlockhash(umi) {
  return await umi.rpc.getLatestBlockhash({ commitment: 'confirmed' });
}

export async function rpcRequest(rpcUrl, method, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
      signal: controller.signal, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error.message || 'Solana RPC request failed.');
    return payload.result;
  } catch (error) {
    if (controller.signal.aborted) throw Object.assign(
      new Error(`Solana RPC ${method} timed out after 20 seconds. Keep the saved launch and check its status before retrying.`),
      { status: 504, code: 'RPC_TIMEOUT', stage: `rpc-${method}` });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}