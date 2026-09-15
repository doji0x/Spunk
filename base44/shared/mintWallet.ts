import { Buffer } from 'node:buffer';
import bs58 from 'npm:bs58@6.0.0';
import { createSignerFromKeypair } from 'npm:@metaplex-foundation/umi@0.9.2';

export const mintPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const signaturePattern = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
export const mainnetGenesis = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';

export function parseWallet(value) {
  const bytes = value.trim().startsWith('[') ? Uint8Array.from(JSON.parse(value)) : bs58.decode(value.trim());
  if (bytes.length !== 64) throw new Error('The mint wallet secret must contain 64 bytes.');
  return bytes;
}

export function isSupportedImage(bytes, mimeType) {
  if (mimeType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mimeType === 'image/gif') return bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString());
  if (mimeType === 'image/webp') return bytes.length >= 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  return false;
}

export async function rpcRequest(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || 'Solana RPC request failed.');
  return payload.result;
}

export async function assertMainnet(rpcUrl) {
  if (await rpcRequest(rpcUrl, 'getGenesisHash', []) !== mainnetGenesis) throw new Error('Minting is locked to Solana mainnet.');
}

export async function accountData(rpcUrl, address) {
  const result = await rpcRequest(rpcUrl, 'getAccountInfo', [address, { commitment: 'confirmed', encoding: 'base64' }]);
  return result?.value?.data?.[0] ? Buffer.from(result.value.data[0], 'base64') : null;
}

export async function accountExists(rpcUrl, address) {
  const result = await rpcRequest(rpcUrl, 'getAccountInfo', [address, { commitment: 'confirmed', encoding: 'base64' }]);
  return Boolean(result?.value);
}

export async function accountDataLength(rpcUrl, address) {
  const data = await accountData(rpcUrl, address);
  return data ? data.length : 0;
}

export async function tokenBalance(rpcUrl, tokenAccount) {
  const result = await rpcRequest(rpcUrl, 'getAccountInfo', [tokenAccount, { commitment: 'confirmed', encoding: 'jsonParsed' }]);
  return result?.value?.data?.parsed?.info?.tokenAmount?.amount === '1';
}

export async function tokenHasSupply(rpcUrl, mint) {
  const result = await rpcRequest(rpcUrl, 'getTokenSupply', [mint, { commitment: 'confirmed' }]);
  return result?.value?.amount === '1';
}

export async function masterEditionState(rpcUrl, address) {
  const data = await accountData(rpcUrl, address);
  if (!data) return null;
  return { supply: data.readBigUInt64LE(1), maxSupply: data[9] === 1 ? data.readBigUInt64LE(10) : null };
}

// Same label + same server wallet always yields the same keypair, so resumed runs never drift to a new address.
export async function deterministicSeed(label, walletBytes) {
  const material = Buffer.concat([Buffer.from(label), Buffer.from(walletBytes)]);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', material));
}

export async function deterministicSigner(umi, label, walletBytes) {
  return createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSeed(await deterministicSeed(label, walletBytes)));
}

export async function sendWithFreshBlockhash(builder, umi, isApplied = null) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await builder.sendAndConfirm(umi, { send: { maxRetries: 0 }, confirm: { commitment: 'confirmed' } });
    } catch (error) {
      if (isApplied) {
        try {
          if (await isApplied()) return;
        } catch {
          // Preserve the transaction error when the state check is temporarily unavailable.
        }
      }
      const message = error instanceof Error ? error.message : String(error);
      const expired = /block height exceeded|signature .* expired/i.test(message);
      if (!expired || attempt === 2) throw error;
    }
  }
}