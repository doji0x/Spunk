import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function MetadataRepairForm({ record, onCancel, onSave }) {
  const [name, setName] = useState(record.name);
  const [symbol, setSymbol] = useState(record.symbol);
  const [description, setDescription] = useState(record.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSave(record, { name, symbol, description }); }
    catch (issue) { setError(issue.response?.data?.error || issue.message || 'Metadata could not be updated.'); setBusy(false); }
  };
  return <form onSubmit={submit} className="mt-5 space-y-4 border-t border-launch-border pt-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor={`name-${record.id}`}>NFT name</Label><Input id={`name-${record.id}`} maxLength={32} value={name} onChange={event => setName(event.target.value)} required disabled={busy} /></div>
      <div className="space-y-2"><Label htmlFor={`symbol-${record.id}`}>Ticker</Label><Input id={`symbol-${record.id}`} maxLength={10} value={symbol} onChange={event => setSymbol(event.target.value.toUpperCase())} required disabled={busy} /></div>
    </div>
    <div className="space-y-2"><Label htmlFor={`description-${record.id}`}>Details</Label><Textarea id={`description-${record.id}`} maxLength={1000} rows={4} value={description} onChange={event => setDescription(event.target.value)} required disabled={busy} /></div>
    {error && <p className="text-sm text-destructive">{error}</p>}
    <div className="flex gap-3"><Button type="submit" size="sm" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Re-upload metadata</Button><Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button></div>
  </form>;
}