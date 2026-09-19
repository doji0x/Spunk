import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Terminal } from 'lucide-react';

export default function AstraActivityLine({ message }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!message.detail;
  const Chevron = open ? ChevronDown : ChevronRight;
  return <div className="font-mono text-[11px] text-muted-foreground">
    <button type="button" onClick={() => hasDetail && setOpen(value => !value)} className={`flex w-full items-center gap-2 text-left ${hasDetail ? 'hover:text-foreground' : 'cursor-default'}`}>
      <Terminal size={13} className="shrink-0 text-primary" />
      <span className="truncate">{message.content}</span>
      {typeof message.durationMs === 'number' && <span className="shrink-0 text-[10px] text-muted-foreground/70">{message.durationMs}ms</span>}
      {hasDetail && <Chevron size={12} className="shrink-0" />}
    </button>
    {open && <p className="ml-5 mt-1 break-all rounded-lg border border-border bg-card px-2.5 py-1.5 text-[10px] leading-4">{message.detail}</p>}
  </div>;
}