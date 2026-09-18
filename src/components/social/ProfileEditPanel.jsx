import React, { useEffect, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { runWalletAction, uploadSocialMedia } from '@/lib/walletSocial';

export default function ProfileEditPanel({ open, onClose, profile, provider, onSaved, variant }) {
  const [form, setForm] = useState(profile); const [avatar, setAvatar] = useState(null); const [banner, setBanner] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { setForm(profile); setAvatar(null); setBanner(null); setError(''); }, [profile, open]);
  if (!open) return null;
  const submit = async e => { e.preventDefault(); setBusy(true); setError('');
    try { const [avatarUrl, bannerUrl] = await Promise.all([avatar ? uploadSocialMedia(avatar) : profile.avatarUrl, banner ? uploadSocialMedia(banner) : profile.bannerUrl]); const { profile: saved } = await runWalletAction(provider, 'updateProfile', { walletAddress: profile.walletAddress, handle: form.handle, displayName: form.displayName, bio: form.bio, avatarUrl, bannerUrl }); onSaved(saved); onClose(); }
    catch (err) { setError(err.response?.data?.error || err.message); } finally { setBusy(false); }
  };
  if (variant !== 'x') return null;
  return <div className="x-panel-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="x-panel"><div className="x-panelinner"><div className="x-panelhead"><h2>Edit profile</h2><button type="button" className="x-close" aria-label="Close" onClick={onClose}><X /></button></div>
    <form onSubmit={submit} className="x-form"><input className="x-field" required maxLength={50} value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} placeholder="Display name" /><input className="x-field" required maxLength={24} value={form.handle} onChange={e => setForm({ ...form, handle: e.target.value })} placeholder="Handle" /><textarea className="x-field x-area" maxLength={240} value={form.bio || ''} onChange={e => setForm({ ...form, bio: e.target.value })} placeholder="Bio" />
    <div className="x-uploads"><label className="x-upload"><Upload />{avatar ? avatar.name : 'Upload PFP'}<input type="file" accept="image/*" onChange={e => setAvatar(e.target.files?.[0] || null)} /></label><label className="x-upload"><Upload />{banner ? banner.name : 'Upload banner'}<input type="file" accept="image/*" onChange={e => setBanner(e.target.files?.[0] || null)} /></label></div>{error && <p className="x-form-error">{error}</p>}<button className="x-save" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Save &amp; sign</button></form>
  </div></section></div>;
}