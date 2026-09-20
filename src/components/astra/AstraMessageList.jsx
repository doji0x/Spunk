import React, { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import AstraActivityLine from '@/components/astra/AstraActivityLine';
import AstraMessageActions from '@/components/astra/AstraMessageActions';

export default function AstraMessageList({ messages, busy, onEdit, onDelete }) {
  const endRef = useRef(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  const startEdit = message => { setEditingId(message.id); setDraft(message.content); };
  const saveEdit = async () => { const text = draft.trim(); if (text) await onEdit(editingId, text); setEditingId(null); };

  return <div className="flex flex-col gap-4">
    {!messages.length && <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Ask Astra to review a repository — for example <span className="font-mono text-primary">review owner/repo and fix what you find</span>.</div>}
    {messages.map(message => {
      if (message.role === 'activity') return <AstraActivityLine key={message.id} message={message} />;
      const mine = message.role === 'user';
      const saved = !String(message.id).startsWith('local-');
      const editing = editingId === message.id;
      return <div key={message.id} className={`flex gap-3 ${mine ? 'flex-row-reverse' : ''}`}>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${mine ? 'bg-secondary text-foreground' : 'bg-primary text-primary-foreground'}`}>{mine ? <User size={15} /> : <Bot size={15} />}</span>
        <div className="max-w-[85%]">
          <div className={`relative rounded-2xl border px-4 py-3 text-sm leading-6 ${mine ? 'border-border bg-secondary' : 'border-border bg-card'}`}>
            {mine && message.turn && <span className="mb-1 block font-mono text-[10px] tracking-widest text-primary">#{message.turn}</span>}
            {editing
              ? <div className="space-y-2">
                  <Textarea value={draft} onChange={event => setDraft(event.target.value)} rows={4} className="resize-none bg-background font-body text-sm" />
                  <div className="flex gap-2"><Button size="sm" onClick={saveEdit}>Save</Button><Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button></div>
                </div>
              : <div className="prose prose-sm prose-invert max-w-none prose-pre:bg-background prose-pre:text-xs"><ReactMarkdown>{message.content}</ReactMarkdown></div>}
          </div>
          {saved && !editing && !busy && <div className={mine ? 'flex justify-end' : ''}><AstraMessageActions onEdit={mine ? () => startEdit(message) : undefined} onDelete={() => onDelete(message.id)} /></div>}
        </div>
      </div>;
    })}
    {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin text-primary" />{[...messages].reverse().find(item => item.role === 'activity')?.content || 'Astra is working…'}</div>}
    <div ref={endRef} />
  </div>;
}