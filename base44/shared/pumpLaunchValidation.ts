import { rpcRequest } from './mintWallet.ts';

export async function walletOwnsInscription(rpcUrl, wallet, mint, proof) {
  if ((proof.updateAuthorities || []).includes(wallet)) return true;
  const result = await rpcRequest(rpcUrl, 'getTokenAccountsByOwner', [wallet, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  return (result?.value || []).some(entry => entry.account?.data?.parsed?.info?.tokenAmount?.amount === '1');
}

export async function checkMetadataProxy(uri, expectedImage) {
  try {
    const response = await fetch(uri, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`The app metadata endpoint returned HTTP ${response.status}.`);
    const text = await response.text();
    if (text.length > 65536) throw new Error('The metadata response is unexpectedly large.');
    const metadata = JSON.parse(text);
    if (!metadata.name || !metadata.symbol) throw new Error('The metadata has no name or symbol.');
    if (metadata.image !== expectedImage) throw new Error('The metadata image field does not point at the app image endpoint.');
    return { ready: true };
  } catch (error) {
    return { ready: false, message: `Launch blocked: the metadata URI is not serving usable inscription metadata. ${error.message} No SOL was spent.` };
  }
}