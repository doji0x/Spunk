import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { verifySignedMessage, issueNonce, consumeNonce } from '../../shared/walletSignature.ts';
import { cleanSocials, readSocials, findLaunch } from '../../shared/launchSocials.ts';

const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Public endpoint: the launching wallet authorizes with a signed nonce, admins with their session.
export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const entities = base44.asServiceRole.entities;
    const body = await req.json();

    if (body.action === 'nonce') {
      const walletAddress = String(body.walletAddress || '').trim();
      if (!addressPattern.test(walletAddress)) return Response.json({ error: 'Invalid wallet address.' }, { status: 400 });
      const nonce = issueNonce();
      await entities.WalletNonce.create({ walletAddress, nonce, used: false });
      return Response.json({ nonce });
    }

    if (body.action === 'lookup') {
      const coinMint = String(body.coinMint || '').trim();
      if (!addressPattern.test(coinMint)) return Response.json({ error: 'Enter a valid coin mint address.' }, { status: 400 });
      const found = await findLaunch(entities, coinMint);
      if (!found) return Response.json({ error: 'No launch was found for that coin mint.' }, { status: 404 });
      return Response.json({ coinMint, source: found.source, status: found.record.status, ownerWallet: found.owner, name: found.record.name || '', symbol: found.record.symbol || '', socials: readSocials(found.record) });
    }

    if (body.action !== 'update') return Response.json({ error: 'Invalid link update action.' }, { status: 400 });

    let coinMint = '', socials, walletAddress = '';
    if (typeof body.message === 'string') {
      const { message, signature } = body;
      if (message.length > 2000 || typeof signature !== 'string') return Response.json({ error: 'Signed request required.' }, { status: 400 });
      const signed = JSON.parse(message);
      if (signed.action !== 'updateLaunchLinks' || Math.abs(Date.now() - Number(signed.timestamp)) > 300000) return Response.json({ error: 'Signed request expired. Try again.' }, { status: 401 });
      walletAddress = String(signed.data?.walletAddress || '').trim();
      if (!addressPattern.test(walletAddress) || !verifySignedMessage(message, signature, walletAddress)) return Response.json({ error: 'Wallet signature is invalid.' }, { status: 401 });
      if (!await consumeNonce(entities, signed.nonce, walletAddress)) return Response.json({ error: 'Signed request is no longer valid. Please try again.' }, { status: 401 });
      coinMint = String(signed.data?.coinMint || '').trim();
      try { socials = cleanSocials(signed.data); } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
    } else {
      const user = await base44.auth.me().catch(() => null);
      if (user?.role !== 'admin') return Response.json({ error: 'Connect the launching wallet or sign in as an admin to edit links.' }, { status: 403 });
      coinMint = String(body.coinMint || '').trim();
      try { socials = cleanSocials(body); } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
    }
    if (!addressPattern.test(coinMint)) return Response.json({ error: 'Enter a valid coin mint address.' }, { status: 400 });

    const found = await findLaunch(entities, coinMint);
    if (!found) return Response.json({ error: 'No launch was found for that coin mint.' }, { status: 404 });
    if (found.record.status !== 'confirmed') return Response.json({ error: 'Links can only be edited once the launch is confirmed on-chain.' }, { status: 409 });
    // A signature only authorizes the wallet that launched the coin; admins bypass this.
    if (walletAddress && found.owner !== walletAddress) return Response.json({ error: 'This wallet did not launch that coin.' }, { status: 403 });

    const updated = await entities[found.entity].update(found.record.id, { socials });
    return Response.json({ coinMint, source: found.source, socials: readSocials(updated) });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to update the launch links.' }, { status: 500 });
  }
}