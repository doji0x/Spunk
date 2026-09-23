import { MAINNET, base58Decode, base58Encode, equalBytes, fromBase64, inspectMessage,
  invariant, sha256, toBase64, verifySignature, verifyWire } from '../../base44/shared/atomicV1Protocol.js';
import { validateIntent } from '../../base44/shared/atomicV1Intent.js';
import { supportedMethods } from './atomicV1WalletRegistry.js';

function currentAccount(wallet, account, isCurrent) {
  invariant(isCurrent(), 'The selected wallet changed. Reconnect before signing.');
  const current = wallet.accounts?.find(item => item.address === account.address && equalBytes(item.publicKey, account.publicKey));
  invariant(current?.chains?.includes(MAINNET) && equalBytes(base58Decode(account.address), account.publicKey), 'The selected mainnet account is no longer connected.');
  return current;
}
/** Native transaction APIs only. The mint key never leaves the browser.
 * Callbacks are mandatory so intent, freshness and durable recovery cannot be skipped.
 */
export async function signAtomicV1({ wallet, account, prepared, mint, intent, codec, isCurrent,
  assertFresh, beforeWalletSend, persistSigned }) {
  invariant(typeof isCurrent === 'function' && typeof assertFresh === 'function' && codec && intent, 'Missing signing safeguards.');
  const method = prepared.signingMethod;
  invariant(supportedMethods(wallet, account).includes(method), 'This wallet account does not support the selected V1 signing method.');
  currentAccount(wallet, account, isCurrent);
  const message = fromBase64(prepared.messageBase64), parsed = inspectMessage(message);
  invariant(mint.address === intent.coinMint && prepared.coinMint === mint.address && account.address === intent.walletAddress,
    'The mint or payer differs from the local launch.');
  invariant(prepared.messageHash === await sha256(message) && prepared.signerAddresses?.length === parsed.signers.length &&
    parsed.signers.every((key, i) => key === prepared.signerAddresses[i]), 'Prepared transaction identity mismatch.');
  invariant(Number.isSafeInteger(prepared.lastValidBlockHeight), 'Missing transaction lifetime.');
  await validateIntent(parsed, intent, await codec.derive(intent.walletAddress, intent.coinMint));
  await assertFresh(prepared);
  const mintSignature = new Uint8Array(await mint.sign(new Uint8Array(message)));
  invariant(await verifySignature(mintSignature, message, mint.address), 'Invalid mint signature.');
  const wire = codec.encode(message, { [mint.address]: mintSignature });
  const signingAccount = currentAccount(wallet, account, isCurrent);
  const feature = wallet.features[`solana:${method}`];
  if (method === 'signTransaction') {
    invariant(typeof persistSigned === 'function', 'Durable signed-transaction recovery is required.');
    const result = await feature.signTransaction({ account: signingAccount, chain: MAINNET, transaction: new Uint8Array(wire) });
    currentAccount(wallet, account, isCurrent);
    invariant(Array.isArray(result) && result.length === 1 && result[0]?.signedTransaction instanceof Uint8Array, 'Invalid wallet response.');
    const signed = result[0].signedTransaction, decoded = codec.decode(signed);
    invariant(equalBytes(decoded.message, message), 'Wallet changed the prepared message; nothing was submitted.');
    invariant(equalBytes(decoded.signatures[mint.address], mintSignature), 'Wallet changed the mint signature; nothing was submitted.');
    const checked = await verifyWire(signed);
    await assertFresh(prepared);
    const output = { signedTransactionBase64: toBase64(signed), transactionSignature: checked.transactionSignature };
    await persistSigned(output); // Must complete before the caller is allowed to submit.
    return output;
  }
  invariant(method === 'signAndSendTransaction' && typeof beforeWalletSend === 'function', 'Native wallet submission safeguards are missing.');
  await beforeWalletSend(prepared); // Persist uncertainty and arm the server record before calling the wallet.
  await assertFresh(prepared);
  currentAccount(wallet, account, isCurrent);
  const result = await feature.signAndSendTransaction({ account: signingAccount, chain: MAINNET,
    transaction: new Uint8Array(wire), options: { skipPreflight: false, preflightCommitment: 'confirmed' } });
  invariant(Array.isArray(result) && result.length === 1 && result[0]?.signature instanceof Uint8Array && result[0].signature.length === 64,
    'Wallet submission outcome is unknown. Check the saved launch; do not start another.');
  // An account change after broadcast must NOT discard a transaction identity.
  return { transactionSignature: base58Encode(result[0].signature), walletSent: true };
}
