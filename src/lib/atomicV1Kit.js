import { address, getProgramDerivedAddress, getTransactionDecoder, getTransactionEncoder } from '@solana/kit';
import { createV1Codec } from '../../base44/shared/atomicV1Codec.js';
export const atomicV1Codec = createV1Codec({ address, getProgramDerivedAddress, getTransactionDecoder, getTransactionEncoder });
