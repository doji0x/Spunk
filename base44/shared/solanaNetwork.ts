import { secrets } from 'base44:runtime';
import { mainnetGenesis, parseWallet, rpcRequest } from './mintWallet.ts';

export const devnetGenesis = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const genesisByNetwork = { mainnet: mainnetGenesis, devnet: devnetGenesis };

// An unset secret throws, so every optional secret is read through this.
function optionalSecret(name) {
  try {
    return secrets.get(name);
  } catch {
    return null;
  }
}

// Defaults to mainnet: devnet only ever engages when the operator explicitly asks for it.
export function solanaNetwork() {
  return (optionalSecret('SOLANA_NETWORK') || 'mainnet').trim().toLowerCase() === 'devnet' ? 'devnet' : 'mainnet';
}

export function networkRpcUrl(network = solanaNetwork()) {
  if (network === 'devnet') {
    const devnetUrl = optionalSecret('SOLANA_RPC_URL_DEVNET');
    if (!devnetUrl) throw new Error('Set the SOLANA_RPC_URL_DEVNET secret before running on devnet.');
    return devnetUrl.trim();
  }
  return secrets.get('SOLANA_RPC_URL').trim();
}

export function networkWalletBytes(network = solanaNetwork()) {
  if (network === 'devnet') {
    const devnetKey = optionalSecret('MINT_WALLET_SECRET_KEY_DEVNET');
    if (!devnetKey) throw new Error('Set the MINT_WALLET_SECRET_KEY_DEVNET secret before running on devnet.');
    return parseWallet(devnetKey);
  }
  return parseWallet(secrets.get('MINT_WALLET_SECRET_KEY'));
}

// Replaces the old mainnet-only guard: the cluster behind the RPC URL must match the selected network.
export async function assertNetwork(rpcUrl, network = solanaNetwork()) {
  const genesis = await rpcRequest(rpcUrl, 'getGenesisHash', []);
  if (genesis !== genesisByNetwork[network]) throw new Error(`The configured RPC endpoint is not Solana ${network}. Check SOLANA_NETWORK and the matching RPC secret.`);
}

// One call for every function that needs a signer plus a verified cluster.
export async function resolveNetwork() {
  const network = solanaNetwork();
  const rpcUrl = networkRpcUrl(network);
  await assertNetwork(rpcUrl, network);
  return { network, rpcUrl, walletBytes: networkWalletBytes(network), isDevnet: network === 'devnet' };
}