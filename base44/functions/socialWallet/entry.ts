import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import nacl from 'npm:tweetnacl@1.0.3';
import bs58 from 'npm:bs58@6.0.0';

function verifySignedMessage(message, signature, walletAddress) {
  const bytes = new TextEncoder().encode(message);
  const sig = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
  return nacl.sign.detached.verify(bytes, sig, bs58.decode(walletAddress));
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { message, signature } = body;
    if (typeof message !== 'string' || typeof signature !== 'string' || message.length > 4000) return Response.json({ error: 'Signed request required.' }, { status: 400 });
    const signed = JSON.parse(message);
    const { action, timestamp, data } = signed;
    if (!data?.walletAddress || Math.abs(Date.now() - Number(timestamp)) > 300000) return Response.json({ error: 'Signed request expired.' }, { status: 401 });
    if (!verifySignedMessage(message, signature, data.walletAddress)) return Response.json({ error: 'Wallet signature is invalid.' }, { status: 401 });

    if (action === 'createProfile' || action === 'updateProfile') {
      const handle = String(data.handle || '').toLowerCase().trim();
      const displayName = String(data.displayName || '').trim();
      const bio = String(data.bio || '').trim();
      if (!/^[a-z0-9_]{3,24}$/.test(handle) || !displayName || displayName.length > 50 || bio.length > 240) return Response.json({ error: 'Profile details are invalid.' }, { status: 400 });
      const owned = await base44.asServiceRole.entities.Profile.filter({ walletAddress: data.walletAddress });
      const used = await base44.asServiceRole.entities.Profile.filter({ handle });
      if (used.some(profile => profile.walletAddress !== data.walletAddress)) return Response.json({ error: 'That handle is already taken.' }, { status: 409 });
      const values = { walletAddress: data.walletAddress, handle, displayName, bio, avatarUrl: String(data.avatarUrl || ''), bannerUrl: String(data.bannerUrl || '') };
      const profile = owned[0] ? await base44.asServiceRole.entities.Profile.update(owned[0].id, values) : await base44.asServiceRole.entities.Profile.create(values);
      return Response.json({ profile });
    }

    if (action === 'createPost') {
      const text = String(data.text || '').trim();
      if (!text || text.length > 500) return Response.json({ error: 'Posts must contain 1–500 characters.' }, { status: 400 });
      const profiles = await base44.asServiceRole.entities.Profile.filter({ walletAddress: data.walletAddress });
      if (!profiles.length) return Response.json({ error: 'Create your profile before posting.' }, { status: 403 });
      const mediaUrl = String(data.mediaUrl || '');
      if (mediaUrl && (!mediaUrl.startsWith('https://') || mediaUrl.length > 1000)) return Response.json({ error: 'Media URL is invalid.' }, { status: 400 });
      const post = await base44.asServiceRole.entities.Post.create({ authorWallet: data.walletAddress, text, mediaUrl });
      return Response.json({ post });
    }
    return Response.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || 'Social action failed.' }, { status: 500 });
  }
}