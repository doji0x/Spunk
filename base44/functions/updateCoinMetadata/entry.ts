import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { verifySignedMessage, issueNonce, consumeNonce } from '../../shared/walletSignature.ts';
import { findLaunch } from '../../shared/launchSocials.ts';
import { coinAddressPattern, editorError, loadCoinEditor, cleanCreatorMetadata, saveCoinEditor } from '../../shared/coinMetadataEditor.ts';

// Public lookup; writes require a signature from the recorded launching wallet, not a site login.
export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const text = await req.text();
    if (text.length > 8192) throw editorError('The request is too large.', 413);
    let body;
    try { body = JSON.parse(text); } catch { throw editorError('Invalid request.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw editorError('Invalid request.');
    const entities = createClientFromRequest(req).asServiceRole.entities;
    if (body.action === 'lookup') {
      const state = await loadCoinEditor(entities, String(body.coinMint || '').trim());
      return Response.json(state.view, { headers: { 'cache-control': 'no-store' } });
    }
    if (body.action === 'nonce') {
      const walletAddress = String(body.walletAddress || '').trim();
      if (!coinAddressPattern.test(walletAddress)) throw editorError('Invalid wallet address.');
      const recent = await entities.WalletNonce.filter({ walletAddress, created_date: { $gte: new Date(Date.now() - 60000).toISOString() } }, '-created_date', 6);
      if (recent.length >= 6) throw editorError('Too many signature requests. Wait a minute and try again.', 429);
      const nonce = issueNonce();
      await entities.WalletNonce.create({ walletAddress, nonce, used: false });
      return Response.json({ nonce });
    }
    if (typeof body.message !== 'string' || body.message.length > 6000 || typeof body.signature !== 'string' || body.signature.length !== 88) throw editorError('A signed wallet request is required.', 401);
    let signed;
    try { signed = JSON.parse(body.message); } catch { throw editorError('Invalid signed request.'); }
    if (!signed || !['updateCoinMetadata', 'clearCoinMetadata'].includes(signed.action) || !Number.isFinite(signed.timestamp) || Math.abs(Date.now() - signed.timestamp) > 300000) throw editorError('The signed request has expired or is invalid. Try again.', 401);
    const data = signed.data || {}, walletAddress = String(data.walletAddress || ''), coinMint = String(data.coinMint || '').trim();
    if (!coinAddressPattern.test(walletAddress) || !coinAddressPattern.test(coinMint)) throw editorError('Invalid wallet or coin address.');
    let valid = false;
    try { valid = verifySignedMessage(body.message, body.signature, walletAddress); } catch { valid = false; }
    if (!valid) throw editorError('The wallet signature is invalid.', 401);
    const found = await findLaunch(entities, coinMint);
    if (!found || found.entity !== 'PublicLaunchAttempt' || found.owner !== walletAddress) throw editorError('Only the wallet that launched this coin may edit it.', 403);
    if (found.record.status !== 'confirmed') throw editorError('This coin is not confirmed yet. Check its launch status first.', 409);
    const state = await loadCoinEditor(entities, coinMint);
    if (!state.view.editable) throw editorError(state.view.unsupportedReason, 422);
    if (data.revision !== state.view.revision) throw editorError('The metadata changed since you opened it. Find the coin again before saving.', 409);
    const cleared = signed.action === 'clearCoinMetadata';
    const fields = cleared ? null : cleanCreatorMetadata(data);
    if (!await consumeNonce(entities, signed.nonce, walletAddress)) throw editorError('This signature request was already used or expired. Try again.', 401);
    return Response.json(await saveCoinEditor(entities, state, fields, walletAddress, cleared), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to update coin metadata.' }, { status: error.status || 500 });
  }
}