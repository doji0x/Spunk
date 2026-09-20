import React from 'react';
import { MessagesSquare, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AstraConversationRow from '@/components/astra/AstraConversationRow';
import useAstraConversations from '@/hooks/useAstraConversations';

export default function AstraConversationsPanel({ activeId, onOpen }) {
  const { conversations, loading, reload, remove } = useAstraConversations();

  return <div className="pb-4">
    <div className="flex items-start gap-3 pb-6">
      <span className="rounded-2xl bg-primary p-2.5 text-primary-foreground"><MessagesSquare size={20} /></span>
      <div className="flex-1">
        <h2 className="font-display text-2xl font-bold tracking-tight">Your chats with Astra</h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">Every conversation is kept. Open one to continue it — Astra reads the whole thread back, including your numbered turns and the steps its crew already ran, so it picks up exactly where you left off.</p>
      </div>
      <Button variant="outline" size="sm" onClick={reload} className="gap-1.5"><RefreshCw size={14} />Refresh</Button>
    </div>
    {loading && <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading conversations…</div>}
    {!loading && !conversations.length && <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No conversations yet. Start one with Astra and it will show up here.</div>}
    <div className="flex flex-col gap-3">{conversations.map(conversation => <AstraConversationRow key={conversation.id} conversation={conversation} active={conversation.id === activeId} onOpen={onOpen} onDelete={remove} />)}</div>
  </div>;
}