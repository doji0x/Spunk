import React from 'react';
import { ScrollText } from 'lucide-react';

export default function InscriptionLog({ entries = [], title = 'Continuity log' }) {
  if (!entries.length) return null;
  return <div className="mt-5 border-t border-border pt-4">
    <div className="mb-3 flex items-center gap-2 font-medium"><ScrollText className="h-4 w-4" />{title}</div>
    <ol className="max-h-56 space-y-3 overflow-y-auto pr-2">
      {[...entries].reverse().map((entry, index) => <li key={entry.id || `${entry.at}-${index}`} className="grid grid-cols-[5rem_1fr] gap-3 text-xs">
        <time className="font-mono text-muted-foreground">{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
        <div><p>{entry.message}</p>{entry.details && <p className="mt-0.5 break-all font-mono text-muted-foreground">{entry.details}</p>}</div>
      </li>)}
    </ol>
  </div>;
}