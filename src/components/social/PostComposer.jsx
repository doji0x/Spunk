import React, { useState } from 'react';
import { ImagePlus, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { runWalletAction, uploadSocialMedia } from '@/lib/walletSocial';

export default function PostComposer({ address, provider, onPosted }) {
  const [text, setText] = useState(''); const [media, setMedia] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async e => { e.preventDefault(); setBusy(true); setError('');
    try { const mediaUrl = await uploadSocialMedia(media); const { post } = await runWalletAction(provider, 'createPost', { walletAddress: address, text, mediaUrl }); setText(''); setMedia(null); onPosted(post); }
    catch (err) { setError(err.response?.data?.error || err.message); } finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="rounded-2xl border border-border bg-card/75 p-4 text-left backdrop-blur-sm">
    <textarea required maxLength={500} value={text} onChange={e => setText(e.target.value)} placeholder="Share your work, process, or perspective…" className="min-h-24 w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-muted-foreground" />
    {media && <p className="mb-3 truncate font-mono text-[9px] text-primary">ATTACHED · {media.name}</p>}{error && <p className="mb-3 text-xs text-destructive">{error}</p>}
    <div className="flex items-center justify-between border-t border-border pt-3"><label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-primary"><ImagePlus className="h-4 w-4" />Media<input type="file" accept="image/*,.gif" className="hidden" onChange={e => setMedia(e.target.files?.[0] || null)} /></label><div className="flex items-center gap-3"><span className="font-mono text-[9px] text-muted-foreground">{text.length}/500</span><Button size="sm" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Send />}Post & sign</Button></div></div>
  </form>;
}