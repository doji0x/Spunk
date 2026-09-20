import React from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';

export default function AstraConversationRow({ conversation, active, onOpen, onDelete }) {
  return <div className={`rounded-xl border bg-card p-4 ${active ? 'border-primary' : 'border-border'}`}>
    <div className="flex items-start gap-3">
      <span className="mt-0.5 rounded-lg bg-secondary p-2 text-primary"><MessageSquare size={15} /></span>
      <button type="button" onClick={() => onOpen(conversation.id)} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium leading-5">{conversation.firstMessage || 'Untitled conversation'}</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {conversation.turns} turn{conversation.turns === 1 ? '' : 's'} · {conversation.replies} repl{conversation.replies === 1 ? 'y' : 'ies'} · {conversation.activity} step{conversation.activity === 1 ? '' : 's'}
          {conversation.repo ? ` · ${conversation.repo}` : ''}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{new Date(conversation.lastAt).toLocaleString()}{active ? ' · open now' : ''}</p>
      </button>
      <button onClick={() => onDelete(conversation.id)} aria-label="Delete conversation" className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-destructive"><Trash2 size={14} /></button>
    </div>
  </div>;
}