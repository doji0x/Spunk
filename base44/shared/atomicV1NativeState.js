import { base58Decode, equalBytes, fromBase64, invariant, sha256, utf8, verifyWire } from './atomicV1Protocol.js';

export const PUBLIC_FIELDS = ['id', 'requestId', 'walletAddress', 'coinMint', 'bondingCurve', 'name', 'symbol',
  'description', 'imageUrl', 'imageMime', 'imageByteLength', 'imageSha256', 'metadataUri', 'socials',
  'transactionSignature', 'transactionVersion', 'serializedTransactionBytes', 'firstBuyAmount', 'status',
  'error', 'atomicV1Verified', 'nativeProtocol', 'checkedAt', 'lastValidBlockHeight', 'created_date'];
export function publicLaunch(record) {
  return { ...Object.fromEntries(PUBLIC_FIELDS.filter(key => record[key] !== undefined).map(key => [key, record[key]])), createdDate: record.created_date };
}
export function preparedLaunch(record) {
  return { id: record.id, requestId: record.requestId, coinMint: record.coinMint, walletAddress: record.walletAddress,
    messageBase64: record.messageBase64, messageHash: record.messageHash, signerAddresses: record.signerAddresses,
    lastValidBlockHeight: record.lastValidBlockHeight, blockhash: record.blockhash, signingMethod: record.signingMethod,
    stateVersion: record.stateVersion, size: record.size, walletName: record.walletName };
}
export async function tokenHash(record, token) {
  invariant(typeof token === 'string' && /^[a-f0-9]{64}$/.test(token), 'A valid launch recovery token is required.');
  return sha256(utf8(`atomic-v1:2:${record.requestId}:${record.walletAddress}:${record.coinMint}:${token}`));
}
/** Conditional writes only. Never silently fall back to a read-then-update lock.
 * The deployed SDK/backend must support updateMany's query + $set contract.
 */
export async function compareAndSet(entity, record, patch) {
  invariant(typeof entity.updateMany === 'function', 'Atomic launch conditional writes are unavailable. Keep the feature disabled.');
  const result = await entity.updateMany({ id: record.id, stateVersion: record.stateVersion, messageHash: record.messageHash },
    { $set: { ...patch, stateVersion: record.stateVersion + 1 } });
  invariant(result.success === true && result.updated === 1 && result.has_more !== true, 'Launch state changed in another request. Reload the saved launch.');
  return { ...record, ...patch, stateVersion: record.stateVersion + 1 };
}
export function assertEnabled(config, walletName, signingMethod, firstBuy = '') {
  invariant(config.enabled && (config.walletMethods?.[walletName] || []).includes(signingMethod), 'This wallet/method is not enabled for Atomic V1.');
  invariant(!firstBuy || config.firstBuyEnabled, 'Atomic first buys are not enabled yet.');
}

/** Dependency-injected state machine. No wallet secrets, global locks, or RPC
 * URLs are stored in records. Duplicate sends can only rebroadcast identical bytes.
 */
export function createNativeState({ entity, rpc, codec, verifyFinalized, now = () => new Date().toISOString() }) {
  async function load(id, token) {
    invariant(typeof id === 'string' && id.length <= 100, 'Invalid launch id.');
    const [record] = await entity.filter({ id });
    invariant(record?.nativeProtocol === 2, 'No native V1 preparation was found.');
    const supplied = await tokenHash(record, token);
    invariant(equalBytes(utf8(supplied), utf8(record.submitTokenHash || '')), 'Launch recovery authorization failed.');
    return record;
  }
  const change = (record, patch) => compareAndSet(entity, record, { ...patch, checkedAt: now() });
  async function fresh(record, margin = 0) {
    const height = await rpc('getBlockHeight', [{ commitment: 'confirmed' }]);
    const valid = await rpc('isBlockhashValid', [record.blockhash, { commitment: 'confirmed' }]);
    invariant(Number.isSafeInteger(height) && Number.isSafeInteger(record.lastValidBlockHeight) &&
      height + margin <= record.lastValidBlockHeight && valid.value === true, 'The prepared blockhash expired or is near expiry. Refresh the saved launch.');
    return true;
  }
  async function reconcile(record) {
    if (['confirmed', 'failed'].includes(record.status)) return record;
    const signatures = [];
    let historyComplete = true;
    if (record.transactionSignature) signatures.push(record.transactionSignature);
    else if (['submitting', 'unknown', 'pending'].includes(record.status)) {
      const found = await rpc('getSignaturesForAddress', [record.coinMint, { limit: 20, commitment: 'finalized' }]);
      historyComplete = found.length < 20;
      signatures.push(...found.map(item => item.signature));
    }
    for (const signature of signatures) {
      const tx = await rpc('getTransaction', [signature, { encoding: 'base64', commitment: 'finalized', maxSupportedTransactionVersion: 1 }]);
      if (!tx) continue;
      if (tx.version !== 1 || !Array.isArray(tx.transaction) || !tx.meta) continue;
      const wire = fromBase64(tx.transaction[0]), parsed = codec.decode(wire);
      if (await sha256(parsed.message) !== record.messageHash) {
        if (record.transactionSignature === signature) return change(record, { status: 'incomplete', atomicV1Verified: false, error: 'The wallet returned a different finalized message. Keep the recovery record; do not retry automatically.' });
        continue;
      }
      const signed = await verifyWire(wire);
      invariant(signed.transactionSignature === signature, 'RPC transaction identity mismatch.');
      if (tx.meta.err) return change(record, { transactionSignature: signature, status: 'failed', error: 'The finalized atomic transaction failed.', atomicV1Verified: false });
      try { await verifyFinalized(record, parsed); }
      catch { return change(record, { transactionSignature: signature, status: 'incomplete', atomicV1Verified: false,
        error: 'The finalized transaction did not pass the complete launch and image proof. Do not relaunch this mint.' }); }
      return change(record, { transactionSignature: signature, status: 'confirmed', atomicV1Verified: true, verifiedPayer: true, error: '' });
    }
    if (record.transactionSignature) {
      const state = (await rpc('getSignatureStatuses', [[record.transactionSignature], { searchTransactionHistory: true }])).value[0];
      if (state) {
        if (state.confirmationStatus === 'finalized' && state.err) return change(record, { status: 'failed', error: 'The finalized transaction failed.', atomicV1Verified: false });
        return record.status === 'pending' ? record : change(record, { status: 'pending', error: 'Waiting for a verifiable finalized transaction.' });
      }
    }
    const finalizedHeight = await rpc('getBlockHeight', [{ commitment: 'finalized' }]);
    invariant(Number.isSafeInteger(finalizedHeight), 'Invalid finalized block height.');
    if (finalizedHeight <= record.lastValidBlockHeight) return record;
    const valid = await rpc('isBlockhashValid', [record.blockhash, { commitment: 'finalized' }]);
    if (valid.value || !historyComplete) return record;
    const mint = (await rpc('getAccountInfo', [record.coinMint, { encoding: 'base64', commitment: 'finalized' }])).value;
    if (mint) return record.status === 'incomplete' ? record : change(record, { status: 'incomplete', atomicV1Verified: false,
      error: 'The mint exists but its matching launch could not be proved. Keep this recovery record; do not create a replacement.' });
    if (record.status === 'expired') return record;
    return change(record, { status: 'expired', error: 'The previous message expired without a verified launch. It can now be refreshed.', atomicV1Verified: false });
  }
  async function submit(id, token, encoded, config) {
    let record = await load(id, token);
    assertEnabled(config, record.walletName, record.signingMethod, record.firstBuyAmount);
    invariant(record.signingMethod === 'signTransaction', 'Wallet-broadcast launches must be reconciled, not server-submitted.');
    const wire = fromBase64(encoded), parsed = codec.decode(wire);
    invariant(equalBytes(parsed.message, fromBase64(record.messageBase64)), 'Signed message does not match its immutable preparation.');
    const signed = await verifyWire(wire);
    invariant(!record.transactionSignature || record.transactionSignature === signed.transactionSignature, 'A different transaction is already bound to this preparation.');
    if (['confirmed', 'failed', 'incomplete', 'expired'].includes(record.status)) return record;
    await fresh(record);
    const simulation = (await rpc('simulateTransaction', [encoded, { encoding: 'base64', commitment: 'confirmed', sigVerify: true }])).value;
    invariant(simulation && !simulation.err, `Signature-verifying simulation failed: ${JSON.stringify(simulation?.err || 'missing result')}`);
    // Persist the computable transaction ID and exact wire BEFORE any broadcast.
    if (!record.transactionSignature) record = await change(record, { status: 'submitting', transactionSignature: signed.transactionSignature,
      signedTransactionBase64: encoded, verifiedPayer: true, error: '' });
    else invariant(record.signedTransactionBase64 === encoded, 'Only an identical signed transaction may be retried.');
    try {
      const signature = await rpc('sendTransaction', [encoded, { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 2 }]);
      invariant(signature === signed.transactionSignature, 'RPC returned an unexpected transaction signature.');
      return await change(record, { status: 'pending', error: '' });
    } catch {
      // A timeout is not proof that nothing landed. A concurrent confirmer may
      // already have advanced the record, so never overwrite it unconditionally.
      try { return await change(record, { status: 'unknown', error: 'Submission outcome is uncertain. Check or rebroadcast the saved bytes; do not start another launch.' }); }
      catch { return load(id, token); }
    }
  }
  async function arm(id, token, config) {
    let record = await load(id, token);
    assertEnabled(config, record.walletName, record.signingMethod, record.firstBuyAmount);
    invariant(record.signingMethod === 'signAndSendTransaction' && record.status === 'prepared', 'A wallet submission is already in progress. Reconcile it before trying again.');
    await fresh(record, 10);
    record = await change(record, { status: 'submitting', error: 'Wallet submission started; its outcome must be reconciled.' });
    return record;
  }
  async function register(id, token, signature) {
    let record = await load(id, token);
    base58Decode(signature, 64);
    invariant(record.signingMethod === 'signAndSendTransaction' && ['submitting', 'unknown', 'pending', 'confirmed'].includes(record.status), 'No wallet submission was armed.');
    invariant(!record.transactionSignature || record.transactionSignature === signature, 'This preparation already has a different signature.');
    if (record.status !== 'confirmed' && !record.transactionSignature) record = await change(record, { transactionSignature: signature, status: 'pending', error: '' });
    return reconcile(record); // The supplied ID alone never establishes success.
  }
  return { load, change, fresh, reconcile, submit, arm, register };
}
