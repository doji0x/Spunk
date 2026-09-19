import React, { useEffect, useRef } from 'react';
import { Bot, Loader2, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import AstraActivityLine from '@/components/astra/AstraActivityLine';

export default function AstraMessageList({ messages, busy }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);
  return <div className="flex flex-col gap-4">
    {!messages.length && <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Ask Astra to review a repository — for example <span className="font-mono text-primary">review owner/repo and fix what you find</span>.</div>}
    {messages.map(message => {
      if (message.role === 'activity') return <AstraActivityLine key={message.id} message={message} />;
      const mine = message.role === 'user';
      return <div key={message.id} className={`flex gap-3 ${mine ? 'flex-row-reverse' : ''}`}>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${mine ? 'bg-secondary text-foreground' : 'bg-primary text-primary-foreground'}`}>{mine ? <User size={15} /> : <Bot size={15} />}</span>
        <div className={`relative max-w-[85%] rounded-2xl border px-4 py-3 text-sm leading-6 ${mine ? 'border-border bg-secondary' : 'border-border bg-card'}`}>
          {mine && message.turn && <span className="mb-1 block font-mono text-[10px] tracking-widest text-primary">#{message.turn}</span>}
          <div className="prose prose-sm prose-invert max-w-none prose-pre:bg-background prose-pre:text-xs"><ReactMarkdown>{message.content}</ReactMarkdown></div>
        </div>
      </div>;
    })}
    {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin text-primary" />Astra is working…</div>}
    <div ref={endRef} />
  </div>;
}