import nacl from 'npm:tweetnacl@1.0.3';
import bs58 from 'npm:bs58@6.0.0';

// Shared by every wallet-signed endpoint: the signed payload is the exact message bytes.
export function verifySignedMessage(message, signature, walletAddress) {
  const bytes = new TextEncoder().encode(message);
  const sig = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
  return nacl.sign.detached.verify(bytes, sig, bs58.decode(walletAddress));
}

export function issueNonce() {
  return bs58.encode(crypto.getRandomValues(new Uint8Array(24)));
}

// Single-use, 5-minute nonce. Returns false when the nonce is missing, spent, or stale.
export async function consumeNonce(entities, nonce, walletAddress) {
  const [issued] = typeof nonce === 'string' ? await entities.WalletNonce.filter({ nonce, walletAddress }) : [];
  if (!issued || issued.used || Date.now() - new Date(issued.created_date).getTime() > 300000) return false;
  await entities.WalletNonce.update(issued.id, { used: true });
  return true;
}