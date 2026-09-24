import { equalBytes, invariant } from '../../base44/shared/atomicV1Protocol.js';

// Snapshot the complete, decoded V1 message independently of its serializer.
// This also validates a returned read-only MessageV1 without calling serialize().
function messageView(message) {
  invariant(message?.version === 1, 'Expected an actual version 1 transaction message.');
  invariant(Array.isArray(message.addressTableLookups) && message.addressTableLookups.length === 0,
    'V1 cannot contain address lookup tables.');
  const h = message.header, c = message.transactionConfig;
  invariant(h && c && Array.isArray(message.staticAccountKeys) && Array.isArray(message.compiledInstructions),
    'Incomplete versioned transaction message.');
  return JSON.stringify([message.version, h.numRequiredSignatures, h.numReadonlySignedAccounts,
    h.numReadonlyUnsignedAccounts, message.recentBlockhash,
    message.staticAccountKeys.map(key => key.toBase58()),
    message.compiledInstructions.map(ix => [ix.programIdIndex, [...ix.accountKeyIndexes], [...ix.data]]),
    c.priorityFee, c.computeUnitLimit, c.loadedAccountsDataSizeLimit, c.heapSize]);
}

/** Instance-local bridge, not a global SDK patch or a fake V0 transaction.
 * web3.js 1.99.0 can DECODE V1, but MessageV1.serialize() deliberately throws.
 * Decode a real VersionedTransaction, retain its true version=1 and public key
 * objects, and use our existing Kit codec for message/wire serialization.
 * Keep all decoded fields bound to the original bytes; only signatures may change.
 */
export function createV1WalletTransaction(VersionedTransaction, codec, wire) {
  const parsed = codec.decode(new Uint8Array(wire));
  const original = new Uint8Array(parsed.message);
  const transaction = VersionedTransaction.deserialize(new Uint8Array(wire));
  invariant(transaction.version === 1, 'The wallet transport must retain transaction version 1.');
  const expectedView = messageView(transaction.message);
  function checkMessage(candidate) {
    invariant(candidate?.version === 1 && messageView(candidate.message) === expectedView,
      'Wallet changed the prepared message; no transaction was submitted.');
  }
  function encodeResult(candidate) {
    checkMessage(candidate);
    invariant(Array.isArray(candidate.signatures) && candidate.signatures.length === parsed.signers.length,
      'Wallet returned an incorrect signature-slot count.');
    const signatures = Object.fromEntries(parsed.signers.map((key, i) => {
      const signature = candidate.signatures[i];
      invariant(signature instanceof Uint8Array && signature.length === 64, 'Invalid wallet signature slot.');
      return [key, new Uint8Array(signature)];
    }));
    return codec.encode(original, signatures);
  }
  Object.defineProperty(transaction.message, 'serialize', { value: () => {
    checkMessage(transaction); return new Uint8Array(original);
  } });
  Object.defineProperty(transaction, 'serialize', { value: () => encodeResult(transaction) });
  invariant(equalBytes(transaction.serialize(), wire), 'Wallet transaction bridge changed the serialized bytes.');
  return { transaction, encodeResult, checkMessage };
}
