import React, { useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { runWalletAction, uploadSocialMedia } from '@/lib/walletSocial';

export default function ProfileOnboarding({ address, provider, onCreated }) {
  const [form, setForm] = useState({ handle: '', displayName: '', bio: '' });
  const [avatar, setAvatar] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async e => { e.preventDefault(); setBusy(true); setError('');
    try { const avatarUrl = await uploadSocialMedia(avatar); const { profile } = await runWalletAction(provider, 'createProfile', { walletAddress: address, ...form, avatarUrl, bannerUrl: '' }); onCreated(profile); }
    catch (err) { setError(err.response?.data?.error || err.message); } finally { setBusy(false); }
  };
  return <section className="rounded-2xl border border-primary/25 bg-card/80 p-6 text-left gold-glow">
    <p className="font-mono text-[9px] tracking-[0.2em] text-primary">WELCOME TO THE FEED</p><h2 className="mt-2 font-display text-2xl font-bold">Create your wallet profile</h2><p className="mt-2 text-sm text-muted-foreground">Choose how collectors and artists will know you.</p>
    <form onSubmit={submit} className="mt-6 space-y-3"><Input required maxLength={24} placeholder="Handle (letters, numbers, underscore)" value={form.handle} onChange={e => setForm({ ...form, handle: e.target.value })} /><Input required maxLength={50} placeholder="Display name" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} /><textarea maxLength={240} placeholder="Short bio" value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} className="min-h-24 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" /><label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground hover:border-primary/50"><Upload className="h-4 w-4" />{avatar ? avatar.name : 'Upload profile image'}<input type="file" accept="image/*" className="hidden" onChange={e => setAvatar(e.target.files?.[0] || null)} /></label>{error && <p className="text-xs text-destructive">{error}</p>}<Button disabled={busy} className="w-full gold-glow">{busy && <Loader2 className="animate-spin" />}Create profile & sign</Button></form>
  </section>;
}