import { Buffer } from 'node:buffer';
import { createSignerFromKeypair, generateSigner } from 'npm:@metaplex-foundation/umi@0.9.2';
import { rpcRequest } from '../../shared/mintWallet.ts';

export async function recoverableMintSigner(umi, walletBytes, requestId) {
  if (!requestId) return generateSigner(umi);
  const seed = new Uint8Array(await crypto.subtle.digest('SHA-256', Buffer.concat([
    Buffer.from('inscription-start-v1:'), Buffer.from(requestId), Buffer.from(walletBytes),
  ])));
  return createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSeed(seed));
}

export async function chunkMatches(rpcUrl, address, offset, bytes) {
  const result = await rpcRequest(rpcUrl, 'getAccountInfo', [address, {
    commitment: 'confirmed', encoding: 'base64', dataSlice: { offset, length: bytes.length },
  }]);
  if (!result?.value?.data?.[0]) return false;
  return Buffer.from(result.value.data[0], 'base64').equals(Buffer.from(bytes));
}