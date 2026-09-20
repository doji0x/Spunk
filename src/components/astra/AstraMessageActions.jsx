import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';

export default function AstraMessageActions({ onEdit, onDelete }) {
  return <div className="mt-1.5 flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
    {onEdit && <button type="button" onClick={onEdit} className="flex items-center gap-1 hover:text-foreground"><Pencil size={11} />Edit</button>}
    <button type="button" onClick={onDelete} className="flex items-center gap-1 hover:text-destructive"><Trash2 size={11} />Delete</button>
  </div>;
}