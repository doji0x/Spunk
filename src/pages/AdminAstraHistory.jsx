import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessagesSquare, RefreshCw, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import AstraConversationRow from '@/components/astra/AstraConversationRow';
import useAstraConversations from '@/hooks/useAstraConversations';

export default function AdminAstraHistory() {
  const [user, setUser] = useState();
  const { conversations, loading, reload, remove } = useAstraConversations();
  const activeId = localStorage.getItem('astra-conversation-id');
  useEffect(() => { base44.auth.me().then(setUser); }, []);

  if (!user) return <div className="validate-surface flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" /></div>;
  if (user.role !== 'admin') return <main className="validate-surface flex min-h-screen items-center justify-center px-5"><div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center"><h1 className="font-display text-xl font-semibold">Admin access required</h1><Link to="/" className="mt-5 inline-block text-sm text-primary underline">Return home</Link></div></main>;

  return <div className="validate-surface min-h-screen text-foreground">
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-2">
        <Link to="/admin/astra" aria-label="Back to Astra" className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-card"><X className="h-5 w-5" /></Link>
        <div className="flex-1"><p className="font-mono text-[10px] leading-none tracking-[0.3em] text-primary">ADMIN · ASTRA</p><h1 className="font-display font-semibold leading-tight">Conversation history</h1></div>
        <Button variant="outline" size="sm" onClick={reload} className="gap-1.5"><RefreshCw size={14} />Refresh</Button>
      </div>
    </header>
    <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
      <div className="flex items-start gap-3 py-7">
        <span className="rounded-2xl bg-primary p-2.5 text-primary-foreground"><MessagesSquare size={20} /></span>
        <div><h2 className="font-display text-2xl font-bold tracking-tight">Your chats with Astra</h2><p className="mt-1.5 text-sm leading-6 text-muted-foreground">Every conversation is kept. Open one to continue it — Astra reads the whole thread back, including your numbered turns and the steps its crew already ran, so it picks up exactly where you left off.</p></div>
      </div>
      {loading && <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading conversations…</div>}
      {!loading && !conversations.length && <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No conversations yet. Start one with Astra and it will show up here.</div>}
      <div className="flex flex-col gap-3">{conversations.map(conversation => <AstraConversationRow key={conversation.id} conversation={conversation} active={conversation.id === activeId} onDelete={remove} />)}</div>
    </main>
  </div>;
}