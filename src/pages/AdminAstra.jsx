import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Plus, Sparkles, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import AstraMessageList from '@/components/astra/AstraMessageList';
import AstraComposer from '@/components/astra/AstraComposer';
import useAstraChat from '@/hooks/useAstraChat';

export default function AdminAstra() {
  const [user, setUser] = useState();
  const chat = useAstraChat();
  useEffect(() => { base44.auth.me().then(setUser); }, []);

  if (!user) return <div className="validate-surface flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" /></div>;
  if (user.role !== 'admin') return <main className="validate-surface flex min-h-screen items-center justify-center px-5"><div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center"><h1 className="font-display text-xl font-semibold">Admin access required</h1><p className="mt-2 text-sm text-muted-foreground">Astra is restricted to administrator accounts.</p><Link to="/" className="mt-5 inline-block text-sm text-primary underline">Return home</Link></div></main>;

  return <div className="validate-surface min-h-screen text-foreground">
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-2">
        <Link to="/" aria-label="Close Astra" className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-card"><X className="h-5 w-5" /></Link>
        <div className="flex-1"><p className="font-mono text-[10px] leading-none tracking-[0.3em] text-primary">ADMIN · ASTRA</p><h1 className="font-display font-semibold leading-tight">Repository agent</h1></div>
        <Button variant="outline" size="sm" onClick={chat.reset} className="gap-1.5"><Plus size={14} />New</Button>
      </div>
    </header>
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-3xl flex-col px-4 sm:px-6">
      <div className="flex items-start gap-3 py-7">
        <span className="rounded-2xl bg-primary p-2.5 text-primary-foreground"><Sparkles size={20} /></span>
        <div><h2 className="font-display text-2xl font-bold tracking-tight">Astra</h2><p className="mt-1.5 text-sm leading-6 text-muted-foreground">Reviews a GitHub repository with your own OpenAI key, flags what it finds, and commits fixes straight to your working branch using your GitHub token.</p></div>
      </div>
      {chat.error && <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{chat.error}</div>}
      <div className="flex-1 pb-4"><AstraMessageList messages={chat.messages} busy={chat.busy} /></div>
      <AstraComposer onSend={chat.send} busy={chat.busy} />
    </main>
  </div>;
}