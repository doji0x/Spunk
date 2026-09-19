import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const fields = [['website', 'Website', 'https://yourcoin.xyz'], ['twitter', 'X / Twitter', 'https://x.com/yourcoin'], ['github', 'GitHub', 'https://github.com/you/repo']];

export default function LaunchLinksFields({ links, onChange, disabled }) {
  return <div className="grid gap-3 sm:grid-cols-3">{fields.map(([key, label, placeholder]) => <div key={key} className="space-y-1.5">
    <Label htmlFor={`links-${key}`} className="text-xs text-muted-foreground">{label}</Label>
    <Input id={`links-${key}`} value={links[key] || ''} onChange={event => onChange(key, event.target.value)} placeholder={placeholder} disabled={disabled} inputMode="url" className="font-mono text-xs" />
  </div>)}</div>;
}