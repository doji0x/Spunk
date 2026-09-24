import { MAINNET, base58Decode, base58Encode, equalBytes, fromBase64, inspectMessage,
  invariant, sha256, toBase64, verifySignature, verifyWire } from '../../base44/shared/atomicV1Protocol.js';
import { validateIntent } from '../../base44/shared/atomicV1Intent.js';
import { EXACT_MESSAGE_MODE, requestPhantomExactMessage } from './atomicV1ExactMessage.js';
import { supportedMethods } from './atomicV1WalletRegistry.js';
import { isPhantomRequest, phantomAddress, requestPhantomV1 } from './atomicV1PhantomRequest.js';

function currentAccount(wallet, account, isCurrent) {
  invariant(isCurrent(), 'The selected wallet changed. Reconnect before signing.');
  if (isPhantomRequest(wallet)) {
    invariant(phantomAddress(wallet.provider) === account.address, 'The Phantom account changed.');
    return account;
  }
  const current = wallet.accounts?.find(item => item.address === account.address && equalBytes(item.publicKey, account.publicKey));
  invariant(current?.chains?.includes(MAINNET) && equalBytes(base58Decode(account.address), account.publicKey), 'The selected mainnet account is no longer connected.');
  return current;
}
/** Native signing is the default. The explicit experimental exact-message mode
 * requires its own transaction-authorization review and never acts as fallback.
 */
export async function signAtomicV1({ wallet, account, prepared, mint, intent, codec, isCurrent,
  assertFresh, beforeWalletSend, persistSigned, signingMode = 'native', authorizeMessage = null, onStage = (_text) => {} }) {
  invariant(typeof isCurrent === 'function' && typeof assertFresh === 'function' && codec && intent, 'Missing signing safeguards.');
  const method = prepared.signingMethod, direct = isPhantomRequest(wallet);
  invariant(['native', EXACT_MESSAGE_MODE].includes(signingMode), 'Unknown signing mode.');
  const exact = signingMode === EXACT_MESSAGE_MODE;
  invariant(!exact || (direct && method === 'signTransaction'), 'Experimental message signing requires the explicit Phantom sign-only route.');
  invariant(supportedMethods(wallet, account).includes(method), 'The selected native transaction API is unavailable.');
  currentAccount(wallet, account, isCurrent);
  onStage('Validating the exact coin, image, payer and mint.');
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
  if (method === 'signTransaction') {
    invariant(typeof persistSigned === 'function', 'Durable signed-transaction recovery is required.');
    onStage(exact ? 'Review the experimental transaction authorization before opening Phantom.' : direct ? 'Requesting Phantom signTransaction approval (native request).' : 'Requesting native transaction approval.');
    let signed;
    if (exact) {
      signed = await requestPhantomExactMessage({ provider: wallet.provider, message, mintAddress: mint.address, mintSignature,
        payerAddress: account.address, codec, isCurrent, intent, prepared, assertFresh, authorize: authorizeMessage });
    } else if (direct) {
      signed = await requestPhantomV1({ provider: wallet.provider, message, mintAddress: mint.address, mintSignature,
        payerAddress: account.address, codec, isCurrent });
    } else {
      const result = await wallet.features['solana:signTransaction'].signTransaction({ account: signingAccount, chain: MAINNET, transaction: new Uint8Array(wire) });
      invariant(Array.isArray(result) && result.length === 1 && result[0]?.signedTransaction instanceof Uint8Array, 'Invalid wallet response.');
      signed = result[0].signedTransaction;
    }
    currentAccount(wallet, account, isCurrent);
    const decoded = codec.decode(signed);
    invariant(equalBytes(decoded.message, message), 'Wallet changed the prepared message; nothing was submitted.');
    invariant(equalBytes(decoded.signatures[mint.address], mintSignature), 'Wallet changed the mint signature; nothing was submitted.');
    const checked = await verifyWire(signed);
    const output = { signedTransactionBase64: toBase64(signed), transactionSignature: checked.transactionSignature };
    await persistSigned(output);
    await assertFresh(prepared);
    return output;
  }
  invariant(method === 'signAndSendTransaction' && typeof beforeWalletSend === 'function', 'Native wallet submission safeguards are missing.');
  await assertFresh(prepared);
  currentAccount(wallet, account, isCurrent);
  await beforeWalletSend(prepared);
  currentAccount(wallet, account, isCurrent);
  onStage('Requesting wallet transaction approval and submission.');
  const result = await wallet.features['solana:signAndSendTransaction'].signAndSendTransaction({ account: signingAccount, chain: MAINNET,
    transaction: new Uint8Array(wire), options: { skipPreflight: false, preflightCommitment: 'confirmed' } });
  invariant(Array.isArray(result) && result.length === 1 && result[0]?.signature instanceof Uint8Array && result[0].signature.length === 64,
    'Wallet submission outcome is unknown. Check the saved launch; do not start another.');
  return { transactionSignature: base58Encode(result[0].signature), walletSent: true };
}
