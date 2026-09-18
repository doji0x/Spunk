import React, { useEffect, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { runWalletAction, uploadSocialMedia } from '@/lib/walletSocial';

export default function ProfileEditPanel({ open, onClose, profile, provider, onSaved }) {
  const [form, setForm] = useState(profile); const [avatar, setAvatar] = useState(null); const [banner, setBanner] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { setForm(profile); setAvatar(null); setBanner(null); setError(''); }, [profile, open]);
  if (!open) return null;
  const submit = async e => { e.preventDefault(); setBusy(true); setError('');
    try { const [avatarUrl, bannerUrl] = await Promise.all([avatar ? uploadSocialMedia(avatar) : profile.avatarUrl, banner ? uploadSocialMedia(banner) : profile.bannerUrl]); const { profile: saved } = await runWalletAction(provider, 'updateProfile', { walletAddress: profile.walletAddress, handle: form.handle, displayName: form.displayName, bio: form.bio, avatarUrl, bannerUrl }); onSaved(saved); onClose(); }
    catch (err) { setError(err.response?.data?.error || err.message); } finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-end bg-background/75 backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="mx-auto w-full max-w-2xl rounded-t-3xl border border-b-0 border-border bg-card p-5 shadow-2xl">
    <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/40" /><div className="flex items-center justify-between"><h2 className="font-display text-xl font-bold">Edit profile</h2><Button type="button" variant="ghost" size="icon" onClick={onClose}><X /></Button></div>
    <form onSubmit={submit} className="mt-5 space-y-3"><Input required maxLength={50} value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} placeholder="Display name" /><Input required maxLength={24} value={form.handle} onChange={e => setForm({ ...form, handle: e.target.value })} placeholder="Handle" /><textarea maxLength={240} value={form.bio || ''} onChange={e => setForm({ ...form, bio: e.target.value })} placeholder="Bio" className="min-h-24 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
    <div className="grid grid-cols-2 gap-3"><label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground hover:border-primary/50"><Upload className="h-4 w-4" />{avatar ? avatar.name : 'Upload PFP'}<input type="file" accept="image/*" className="hidden" onChange={e => setAvatar(e.target.files?.[0] || null)} /></label><label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground hover:border-primary/50"><Upload className="h-4 w-4" />{banner ? banner.name : 'Upload banner'}<input type="file" accept="image/*" className="hidden" onChange={e => setBanner(e.target.files?.[0] || null)} /></label></div>
    {error && <p className="text-xs text-destructive">{error}</p>}<Button disabled={busy} className="w-full gold-glow">{busy && <Loader2 className="animate-spin" />}Save & sign</Button></form>
  </section></div>;
}