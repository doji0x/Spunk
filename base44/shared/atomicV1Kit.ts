import { address, getProgramDerivedAddress, getTransactionDecoder, getTransactionEncoder } from 'npm:@solana/kit@8.3.0';
import { createV1Codec } from './atomicV1Codec.js';
export const atomicV1Codec = createV1Codec({ address, getProgramDerivedAddress, getTransactionDecoder, getTransactionEncoder });
