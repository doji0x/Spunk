import React, { useState } from 'react';
import { Pause, SendHorizonal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const maxChars = 60000;

export default function AstraComposer({ onSend, busy, onPause }) {
  const [value, setValue] = useState('');
  const tooLong = value.trim().length > maxChars;
  const submit = () => {
    const text = value.trim();
    if (!text || busy || text.length > maxChars) return;
    setValue('');
    onSend(text);
  };
  return <div className="sticky bottom-0 border-t border-border/60 bg-background/90 py-3 backdrop-blur-xl">
    <div className="flex items-end gap-2">
      <Textarea value={value} onChange={event => setValue(event.target.value)} rows={2} disabled={busy}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } }}
        placeholder="Ask Astra to review a repo, flag issues, or commit a fix…" className="min-h-[56px] resize-none bg-card font-body text-sm" />
      {busy
        ? <Button onClick={onPause} variant="outline" className="h-[56px] w-12 shrink-0" aria-label="Pause reply"><Pause size={18} /></Button>
        : <Button onClick={submit} disabled={!value.trim() || tooLong} className="h-[56px] w-12 shrink-0" aria-label="Send message"><SendHorizonal size={18} /></Button>}
    </div>
    <p className={`mt-2 font-mono text-[10px] ${tooLong ? 'text-destructive' : 'text-muted-foreground'}`}>
      {tooLong
        ? `${value.trim().length.toLocaleString()} / ${maxChars.toLocaleString()} characters — trim ${(value.trim().length - maxChars).toLocaleString()} to send.`
        : 'Astra builds on a separate astra/* test branch you can review and merge.'}
    </p>
  </div>;
}