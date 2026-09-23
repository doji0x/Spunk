import { ATA, PUMP, TOKEN_2022, base58Decode, equalBytes, inspectMessage, inspectWire, invariant, utf8 } from './atomicV1Protocol.js';

/** One implementation, injected with the environment's pinned Solana Kit. */
export function createV1Codec({ address, getProgramDerivedAddress, getTransactionDecoder, getTransactionEncoder }) {
  function encode(messageBytes, signatures = {}) {
    const parsed = inspectMessage(messageBytes);
    invariant(Object.keys(signatures).every(key => parsed.signers.includes(key)), 'Unexpected signature key.');
    const signatureMap = Object.fromEntries(parsed.signers.map(key => [key, signatures[key] || null]));
    const wire = new Uint8Array(getTransactionEncoder().encode({ messageBytes: parsed.message, signatures: signatureMap }));
    invariant(equalBytes(inspectWire(wire).message, parsed.message), 'V1 encoder changed the message.');
    return wire;
  }
  function decode(wire) {
    const decoded = getTransactionDecoder().decode(wire);
    const canonical = new Uint8Array(getTransactionEncoder().encode(decoded));
    invariant(equalBytes(canonical, wire), 'Noncanonical V1 transaction.');
    const inspected = inspectWire(wire);
    invariant(equalBytes(new Uint8Array(decoded.messageBytes), inspected.message), 'V1 decoders disagree.');
    return inspected;
  }
  async function derive(wallet, mint) {
    const pda = async (program, seeds) => (await getProgramDerivedAddress({ programAddress: address(program), seeds }))[0];
    const [bondingCurve, mintAuthority, global, eventAuthority, creatorVault] = await Promise.all([
      pda(PUMP, [utf8('bonding-curve'), base58Decode(mint)]), pda(PUMP, [utf8('mint-authority')]),
      pda(PUMP, [utf8('global')]), pda(PUMP, [utf8('__event_authority')]),
      pda(PUMP, [utf8('creator-vault'), base58Decode(wallet)]),
    ]);
    const ata = owner => pda(ATA, [base58Decode(owner), base58Decode(TOKEN_2022), base58Decode(mint)]);
    const [baseUserAta, baseCurveAta] = await Promise.all([ata(wallet), ata(bondingCurve)]);
    return { bondingCurve, mintAuthority, global, eventAuthority, creatorVault, baseUserAta, baseCurveAta };
  }
  return Object.freeze({ encode, decode, derive });
}
