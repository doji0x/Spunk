import { Buffer } from 'node:buffer';
import { TransactionMessage, VersionedTransaction } from 'npm:@solana/web3.js@1.98.4';

// Solana rejects any transaction whose serialized form exceeds this ceiling.
export const maxTransactionBytes = 1232;
export class TransactionTooLargeError extends Error {
  constructor(size) {
    super(`The transaction is ${size} bytes, over Solana's ${maxTransactionBytes}-byte limit.`);
    this.name = 'TransactionTooLargeError';
    this.size = size;
  }
}

// Single place both launch paths compile through, so admin and public launches
// always build the same shape of transaction against the same lookup tables.
export function compileLaunchTransaction({ payerKey, instructions, blockhash, lookupTables = [], signers = [] }) {
  const message = new TransactionMessage({ payerKey, recentBlockhash: blockhash, instructions }).compileToV0Message(lookupTables);
  const transaction = new VersionedTransaction(message);
  if (signers.length) transaction.sign(signers);
  const bytes = transaction.serialize();
  if (bytes.length > maxTransactionBytes) throw new TransactionTooLargeError(bytes.length);
  return { transaction, encoded: Buffer.from(bytes).toString('base64') };
}