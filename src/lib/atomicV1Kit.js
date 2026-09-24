import { address, getProgramDerivedAddress, getTransactionDecoder, getTransactionEncoder } from '@solana/kit';
import { VersionedTransaction } from '@solana/web3.js';
import { createV1Codec } from '../../base44/shared/atomicV1Codec.js';
import { createV1WalletTransaction } from './atomicV1WalletTransaction.js';
const codec = createV1Codec({ address, getProgramDerivedAddress, getTransactionDecoder, getTransactionEncoder });
export const atomicV1Codec = Object.freeze({ ...codec,
  toWalletTransaction: wire => createV1WalletTransaction(VersionedTransaction, codec, wire),
});
