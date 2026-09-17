import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function FeeShareEditor({ recipients, disabled, onChange }) {
  const total = recipients.reduce((sum, item) => sum + (Number(item.shareBps) || 0), 0);
  const update = (index, patch) => onChange(recipients.map((item, i) => i === index ? { ...item, ...patch } : item));
  return <div className="space-y-3 rounded-xl border border-launch-border bg-muted/30 p-4">
    <div><p className="text-sm font-medium">Custom fee allocation</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Allocate exactly 100%. Keep a Creator row for any share that should remain with the creator.</p></div>
    {recipients.map((item, index) => <div key={index} className="grid gap-2 sm:grid-cols-[110px_1fr_100px_36px]">
      <select value={item.type} disabled={disabled} onChange={e => update(index, { type: e.target.value, value: e.target.value === 'creator' ? 'Creator' : '' })} className="h-10 rounded-md border border-input bg-background px-2 text-sm"><option value="creator">Creator</option><option value="wallet">Wallet</option><option value="github">GitHub ID</option></select>
      <Input value={item.value} disabled={disabled || item.type === 'creator'} maxLength={44} placeholder={item.type === 'wallet' ? 'Solana wallet address' : item.type === 'github' ? 'Numeric GitHub user ID' : 'Creator wallet'} onChange={e => update(index, { value: e.target.value })} />
      <Input type="number" min="0.01" max="100" step="0.01" value={item.shareBps ? Number(item.shareBps) / 100 : ''} disabled={disabled} placeholder="Share %" onChange={e => update(index, { shareBps: Math.round(Number(e.target.value) * 100) })} />
      <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label="Remove recipient" onClick={() => onChange(recipients.filter((_, i) => i !== index))}><Trash2 size={16} /></Button>
    </div>)}
    <div className="flex items-center justify-between gap-3"><Button type="button" variant="outline" size="sm" disabled={disabled || recipients.length >= 10} onClick={() => onChange([...recipients, { type: 'wallet', value: '', shareBps: 0 }])}><Plus size={14} className="mr-2" />Add recipient</Button><span className={total === 10000 ? 'text-xs text-launch-brand' : 'text-xs text-destructive'}>{(total / 100).toFixed(2)}% / 100%</span></div>
    <p className="text-xs text-muted-foreground">This split is configured after launch and becomes permanent. pump.fun currently supports wallet and GitHub social recipients.</p>
  </div>;
}