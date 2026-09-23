import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { pumpInstructions, cleanAtomicV1Input, atomicV1InputError, readAtomicV1Image } from './atomicV1Launcher.ts';
import { rpcRequest } from './mintWallet.ts';
import { cleanSocials } from './launchSocials.ts';
import { atomicV1Codec } from './atomicV1Kit.ts';
import { buildUnsignedAtomicV1 } from './atomicV1NativeBuilder.ts';
import { assertEnabled, createNativeState, preparedLaunch, publicLaunch, tokenHash } from './atomicV1NativeState.js';
import { validateIntent, BUY } from './atomicV1Intent.js';
import { PUMP, TOKEN_2022, base58Decode, equalBytes, extractCommitment, fromBase64, inspectMessage,
  invariant, metadataUriFor, sha256, solLamports, utf8 } from './atomicV1Protocol.js';

export { buildUnsignedAtomicV1 } from './atomicV1NativeBuilder.ts';
export function nativeConfig(secrets) {
  let walletMethods: Record<string, string[]> = {};
  try {
    const parsed = JSON.parse(secrets.get('ATOMIC_V1_NATIVE_WALLETS') || '{"*":["signTransaction","signAndSendTransaction"]}');
    walletMethods = Object.fromEntries(Object.entries(parsed).filter(([name, modes]) => name.length <= 80 && Array.isArray(modes))
      .map(([name, modes]) => [name, (modes as unknown[]).filter((mode): mode is string => typeof mode === 'string' && ['signTransaction', 'signAndSendTransaction'].includes(mode))]));
  } catch { /* Malformed rollout config stays disabled. */ }
  return { enabled: (secrets.get('ATOMIC_V1_NATIVE_ENABLED') || 'true') === 'true' && Object.values(walletMethods).some(modes => modes.length),
    walletMethods, firstBuyEnabled: secrets.get('ATOMIC_V1_FIRST_BUY_ENABLED') === 'true', protocolVersion: 2, maximumBytes: 4096 };
}
export function createUserAtomicV1Service(entities, rpcUrl) {
  const rpc = (method, params) => rpcRequest(rpcUrl, method, params);
  const entity = entities.AtomicV1Launch;
  const verifyFinalized = async (record, parsed) => {
    await validateIntent(parsed, record, await atomicV1Codec.derive(record.walletAddress, record.coinMint));
    const [mint, curve] = await Promise.all([record.coinMint, record.bondingCurve].map(key =>
      rpc('getAccountInfo', [key, { encoding: 'base64', commitment: 'finalized' }])));
    invariant(mint.value?.owner === TOKEN_2022 && curve.value?.owner === PUMP, 'Expected Pump mint and bonding curve were not found.');
  };
  const state = createNativeState({ entity, rpc, codec: atomicV1Codec, verifyFinalized });
  async function build(draft, imageBytes, estimate) {
    const derived = await atomicV1Codec.derive(draft.walletAddress, draft.coinMint);
    const legacyInstructions = await pumpInstructions({ rpcUrl, mintKey: new PublicKey(draft.coinMint), input: draft,
      metadataUri: metadataUriFor(draft.coinMint), creator: new PublicKey(draft.walletAddress), payer: new PublicKey(draft.walletAddress) });
    // SDK slippage defaults must never increase a user-entered maximum SOL spend.
    const budget = solLamports(draft.firstBuyAmount);
    for (const ix of legacyInstructions) if (ix.programId.toBase58() === PUMP && equalBytes(new Uint8Array(ix.data.slice(0, 8)), BUY)) {
      invariant(ix.data.length === 24 && budget > 0n, 'Unsupported Pump first-buy encoding.');
      new DataView(ix.data.buffer, ix.data.byteOffset, ix.data.byteLength).setBigUint64(16, budget, true);
    }
    const latest = (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
    const args = { legacyInstructions, payerAddress: draft.walletAddress, latest, mint: draft.coinMint, imageBytes };
    let built = await buildUnsignedAtomicV1(args);
    if (!estimate || built.size.remainingBytes < 0) return { ...built, bondingCurve: derived.bondingCurve };
    await validateIntent(inspectMessage(fromBase64(built.messageBase64)), draft, derived);
    const balance = (await rpc('getBalance', [draft.walletAddress, { commitment: 'confirmed' }])).value;
    invariant(BigInt(balance) >= 30000000n + budget, 'The payer needs the first-buy amount plus a 0.03 SOL rent/fee reserve.');
    const simulation = (await rpc('simulateTransaction', [built.unsignedTransactionBase64,
      { encoding: 'base64', commitment: 'confirmed', sigVerify: false }])).value;
    invariant(simulation && !simulation.err, `Unsigned launch simulation failed: ${JSON.stringify(simulation?.err)}`);
    invariant(Number.isFinite(simulation.unitsConsumed), 'RPC did not provide a compute estimate.');
    const computeUnitLimit = Math.min(1400000, Math.max(200000, Math.ceil(simulation.unitsConsumed * 1.2)));
    built = await buildUnsignedAtomicV1({ ...args, computeUnitLimit });
    const adjusted = (await rpc('simulateTransaction', [built.unsignedTransactionBase64,
      { encoding: 'base64', commitment: 'confirmed', sigVerify: false }])).value;
    invariant(adjusted && !adjusted.err, 'Resource-adjusted unsigned simulation failed.');
    return { ...built, bondingCurve: derived.bondingCurve };
  }
  async function prepare(body, config, sizing = false) {
    const input = cleanAtomicV1Input(body);
    invariant(!atomicV1InputError(input), atomicV1InputError(input));
    base58Decode(body.walletAddress); base58Decode(body.mintAddress);
    const image = readAtomicV1Image(body.imageBase64);
    invariant(!image.error, image.error || 'Invalid image.');
    input.firstBuyAmount = solLamports(input.firstBuyAmount) === 0n ? '' : input.firstBuyAmount;
    const draft = { ...input, walletAddress: body.walletAddress, coinMint: body.mintAddress,
      imageByteLength: image.imageBytes.length, imageSha256: await sha256(image.imageBytes), imageMime: image.imageMime,
      imageUrl: body.imageUrl || '', socials: cleanSocials(body.socials), walletName: body.walletName, signingMethod: body.signingMethod };
    assertEnabled(config, draft.walletName, draft.signingMethod, draft.firstBuyAmount);
    if (sizing) return { size: (await build(draft, image.imageBytes, false)).size };
    invariant(typeof entity.updateMany === 'function', 'Conditional entity writes are unavailable.');
    invariant(typeof body.imageUrl === 'string' && /^https:\/\//.test(body.imageUrl), 'The public image upload is missing.');
    const submitTokenHash = await tokenHash(draft, body.submitToken);
    const intentHash = await sha256(utf8(JSON.stringify(draft)));
    const existing = await entity.filter({ requestId: draft.requestId, walletAddress: draft.walletAddress, coinMint: draft.coinMint }, 'created_date', 20);
    if (existing.length) {
      const saved = await state.load(existing[0].id, body.submitToken);
      invariant(saved.intentHash === intentHash, 'This saved launch has different inputs. Resume it or explicitly start a new launch.');
      return { launch: publicLaunch(saved), prepared: preparedLaunch(saved), size: saved.size };
    }
    const recent = await entity.filter({ walletAddress: draft.walletAddress }, '-created_date', 100);
    invariant(recent.filter(item => (item.verifiedPayer || item.atomicV1Verified) &&
      Date.now() - Date.parse(item.created_date) < 3600000).length < 3, 'Limit of three authorized atomic launches per hour reached.');
    const account = (await rpc('getAccountInfo', [draft.coinMint, { encoding: 'base64', commitment: 'confirmed' }])).value;
    invariant(!account, 'This mint already exists. Recover its launch instead of preparing another.');
    const built = await build(draft, image.imageBytes, true);
    invariant(built.size.remainingBytes >= 0, `Remove ${built.size.requiredReductionBytes} image bytes to fit this transaction.`);
    const { unsignedTransactionBase64: _unsigned, ...persistentBuild } = built;
    const record = await entity.create({ ...draft, ...persistentBuild, intentHash,
      submitTokenHash, nativeProtocol: 2, stateVersion: 0, status: 'prepared', transactionSignature: '', signedTransactionBase64: '',
      transactionVersion: 1, serializedTransactionBytes: built.size.finalSerializedTransactionBytes, commitment: 'VALIDATE-v1',
      atomicV1Verified: false, verifiedPayer: false, metadataUri: metadataUriFor(draft.coinMint), checkedAt: new Date().toISOString(), error: '' });
    invariant(record?.id, 'The backend did not persist the preparation.');
    // Read back schema fields before any wallet is allowed to sign.
    const persisted = await state.load(record.id, body.submitToken);
    invariant(persisted.messageHash === built.messageHash && persisted.stateVersion === 0, 'Preparation schema round-trip failed.');
    return { launch: publicLaunch(persisted), prepared: preparedLaunch(persisted), size: built.size };
  }
  async function action(body, config) {
    if (body.action === 'size' || body.action === 'prepare') return prepare(body, config, body.action === 'size');
    const id = String(body.id || ''), token = body.submitToken;
    let record = await state.load(id, token);
    if (body.action === 'resume' || body.action === 'confirm') record = await state.reconcile(record);
    else if (body.action === 'preflight') {
      assertEnabled(config, record.walletName, record.signingMethod, record.firstBuyAmount);
      invariant(body.messageHash === record.messageHash && ['prepared', 'submitting'].includes(record.status), 'The prepared launch changed or was already submitted.');
      await state.fresh(record, 10);
      return { fresh: true, messageHash: record.messageHash, lastValidBlockHeight: record.lastValidBlockHeight };
    } else if (body.action === 'submit') record = await state.submit(id, token, body.signedTransactionBase64, config);
    else if (body.action === 'retry') {
      invariant(record.signedTransactionBase64, 'No signed transaction is saved. Reconcile the wallet submission instead.');
      record = await state.submit(id, token, record.signedTransactionBase64, config);
    } else if (body.action === 'arm') record = await state.arm(id, token, config);
    else if (body.action === 'register') record = await state.register(id, token, body.transactionSignature);
    else if (body.action === 'refresh') {
      assertEnabled(config, record.walletName, record.signingMethod, record.firstBuyAmount);
      record = await state.reconcile(record);
      invariant(record.status === 'expired', 'Refresh is allowed only after finalized expiry and an absent mint.');
      const image = extractCommitment(inspectMessage(fromBase64(record.messageBase64)), record.coinMint).image;
      const built = await build(record, image, true);
      invariant(built.size.remainingBytes >= 0 && built.blockhash !== record.blockhash, 'Unable to produce a fresh fitting message.');
      record = await state.change(record, { messageBase64: built.messageBase64, messageHash: built.messageHash,
        signerAddresses: built.signerAddresses, blockhash: built.blockhash, lastValidBlockHeight: built.lastValidBlockHeight,
        size: built.size, serializedTransactionBytes: built.size.finalSerializedTransactionBytes,
        status: 'prepared', transactionSignature: '', signedTransactionBase64: '', atomicV1Verified: false, error: '' });
    } else throw new Error('Invalid Atomic V1 action.');
    return { launch: publicLaunch(record), prepared: preparedLaunch(record), size: record.size };
  }
  return { action };
}