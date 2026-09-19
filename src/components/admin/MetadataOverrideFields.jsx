import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const rows = [
  { key: 'name', label: 'Name', placeholder: 'Served coin name', hint: 'Max 32 characters' },
  { key: 'symbol', label: 'Symbol', placeholder: 'TICKER', hint: 'Max 10 characters' },
  { key: 'imageUrl', label: 'Image URL', placeholder: 'https://…', hint: 'Public URL served in place of the inscribed image' },
  { key: 'imageMime', label: 'Image type', placeholder: 'image/png', hint: 'Optional, only with an image URL' }
];

export default function MetadataOverrideFields({ fields, onChange, disabled }) {
  return <div className="space-y-4">
    {rows.map(row => <div key={row.key}>
      <Label htmlFor={`override-${row.key}`} className="text-xs text-muted-foreground">{row.label}</Label>
      <Input id={`override-${row.key}`} value={fields[row.key]} onChange={event => onChange(row.key, event.target.value)} placeholder={row.placeholder} disabled={disabled} className={row.key === 'imageUrl' || row.key === 'imageMime' ? 'mt-1.5 font-mono text-xs' : 'mt-1.5'} />
      <p className="mt-1 text-[11px] text-muted-foreground">{row.hint}</p>
    </div>)}
    <div>
      <Label htmlFor="override-description" className="text-xs text-muted-foreground">Description</Label>
      <Textarea id="override-description" value={fields.description} onChange={event => onChange('description', event.target.value)} placeholder="Served description" disabled={disabled} rows={3} className="mt-1.5" />
      <p className="mt-1 text-[11px] text-muted-foreground">Leave any field blank to keep serving the inscribed value.</p>
    </div>
  </div>;
}