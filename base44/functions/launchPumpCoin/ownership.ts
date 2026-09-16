import { rpcRequest } from '../../shared/mintWallet.ts';

// The mint wallet must be an inscription update authority or currently hold the source NFT.
export async function walletOwnsInscription(rpcUrl, wallet, mint, proof) {
  if ((proof.updateAuthorities || []).includes(wallet)) return true;
  const result = await rpcRequest(rpcUrl, 'getTokenAccountsByOwner', [wallet, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  return (result?.value || []).some(entry => entry.account?.data?.parsed?.info?.tokenAmount?.amount === '1');
}