import React from 'react';
import { History } from 'lucide-react';

const changed = record => [['name', record.name], ['symbol', record.symbol], ['image', record.imageUrl], ['type', record.imageMime], ['description', record.description]].filter(([, value]) => value);

export default function MetadataOverrideHistory({ history }) {
  if (!history.length) return <p className="text-sm text-muted-foreground">No overrides have been recorded for this coin.</p>;
  return <ol className="space-y-3">
    {history.map(record => <li key={record.id} className="rounded-xl border border-border bg-background/50 p-3.5">
      <div className="flex items-center gap-2">
        <History className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono text-[10px] tracking-[0.2em] text-primary">{record.action === 'clear' ? 'CLEARED' : 'SET'}</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">{new Date(record.created_date).toLocaleString()}</span>
      </div>
      {record.adminEmail && <p className="mt-1.5 break-all text-[11px] text-muted-foreground">by {record.adminEmail}</p>}
      {record.action === 'set' && <p className="mt-1.5 break-all text-xs leading-5">{changed(record).map(([label, value]) => `${label}: ${value}`).join(' · ')}</p>}
      {Object.keys(record.previousValues || {}).length > 0 && <p className="mt-1.5 break-all text-[11px] leading-5 text-muted-foreground">replaced — {Object.entries(record.previousValues).map(([label, value]) => `${label}: ${value}`).join(' · ')}</p>}
    </li>)}
  </ol>;
}