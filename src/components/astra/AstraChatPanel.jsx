import React from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';
import AstraMessageList from '@/components/astra/AstraMessageList';
import AstraComposer from '@/components/astra/AstraComposer';

export default function AstraChatPanel({ chat }) {
  return <div className="flex min-h-[60vh] flex-col">
    <div className="flex items-start gap-3 pb-6">
      <span className="rounded-2xl bg-primary p-2.5 text-primary-foreground"><Sparkles size={20} /></span>
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">Astra</h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">Acts as foreman over a crew — architect, logic, functions, integration, documentation and audit engineers — assigning each a scoped job and reporting back. All work lands on a separate <span className="font-mono text-primary">astra/*</span> test branch you can review and merge.</p>
      </div>
    </div>
    {chat.error && <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{chat.error}</div>}
    <div className="flex-1 pb-4"><AstraMessageList messages={chat.messages} busy={chat.busy} onEdit={chat.editMessage} onDelete={chat.deleteMessage} auditIssues={chat.auditIssues} onAuditDecision={chat.decideAudit} loading={chat.loading} /></div>
    <AstraComposer onSend={chat.send} busy={chat.busy} onPause={chat.pause} loading={chat.loading} />
  </div>;
}