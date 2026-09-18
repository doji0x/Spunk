import React, { useState } from 'react';
import { ExternalLink, RefreshCw, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import MetadataRepairForm from '@/components/admin/MetadataRepairForm';

const statusStyles = { success: 'bg-[#edf2e6] text-[#526d3b]', failed: 'bg-[#f8e8e5] text-[#a54132]', in_progress: 'bg-[#f4f0dc] text-[#77681f]' };
const formatDate = value => value ? new Date(value).toLocaleString() : '—';

export default function MintRecordCard({ record, onSave }) {
  const [editing, setEditing] = useState(false);
  const save = async (current, values) => { await onSave(current, values); setEditing(false); };
  return <article className="rounded-2xl border border-launch-border bg-card p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-semibold">{record.name} <span className="font-mono text-sm text-muted-foreground">${record.symbol}</span></p><p className="mt-1 text-sm leading-6 text-muted-foreground">{record.description}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[record.status]}`}>{record.status.replace('_', ' ')}</span></div>
    <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-2">
      <div><dt className="text-muted-foreground">Contract address</dt><dd className="mt-1 break-all font-mono">{record.mint}</dd></div>
      <div><dt className="text-muted-foreground">Owner wallet</dt><dd className="mt-1 break-all font-mono">{record.owner || '—'}</dd></div>
      <div><dt className="text-muted-foreground">Image SHA-256</dt><dd className="mt-1 break-all font-mono">{record.imageHash || 'Pending'}</dd></div>
      <div><dt className="text-muted-foreground">Created / last updated</dt><dd className="mt-1">{formatDate(record.created_date)}<br />{formatDate(record.updated_date)}</dd></div>
    </dl>
    {record.errorMessage && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{record.errorMessage}</p>}
    <div className="mt-5 flex flex-wrap gap-3"><Button asChild size="sm"><Link to={`/admin/mint?mint=${encodeURIComponent(record.mint)}`}><RotateCcw className="mr-2 h-4 w-4" />Continue inscription</Link></Button><Button asChild size="sm" variant="outline"><a href={`https://solscan.io/token/${record.mint}`} target="_blank" rel="noreferrer">View on Solscan<ExternalLink className="ml-2 h-4 w-4" /></a></Button><Button type="button" size="sm" variant="outline" onClick={() => setEditing(value => !value)}><RefreshCw className="mr-2 h-4 w-4" />Re-upload metadata</Button></div>
    {editing && <MetadataRepairForm record={record} onCancel={() => setEditing(false)} onSave={save} />}
  </article>;
}