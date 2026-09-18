import React, { useState } from 'react';
import { ExternalLink, RefreshCw, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import MetadataRepairForm from '@/components/admin/MetadataRepairForm';
import MintLogExport from '@/components/admin/MintLogExport';
import InscriptionLog from '@/components/admin/InscriptionLog';

const statusStyles = { success: 'bg-primary/10 text-primary', failed: 'bg-destructive/10 text-destructive', in_progress: 'bg-muted text-muted-foreground' };
const formatDate = value => value ? new Date(value).toLocaleString() : '—';

export default function MintRecordCard({ record, onSave, onRetry }) {
  const [editing, setEditing] = useState(false);
  const progress = record.totalSize ? Math.min(100, Math.round(((record.offset || 0) / record.totalSize) * 100)) : 0;
  const mediaLabel = record.mediaType === 'audio' ? 'Audio' : 'Image';
  const sourceUri = record.sourceUri || record.imageUri;
  const archiveUri = record.archivedSourceUri || record.archivedImageUri;
  const save = async (current, values) => { await onSave(current, values); setEditing(false); };
  return <article className="rounded-3xl border border-border bg-card p-5 transition hover:border-primary/25">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-semibold">{record.name} <span className="font-mono text-sm text-muted-foreground">${record.symbol}</span></p><p className="mt-1 text-sm leading-6 text-muted-foreground">{record.description}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[record.status]}`}>{record.status.replace('_', ' ')}</span></div>
    <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-2">
      <div><dt className="text-muted-foreground">Contract address</dt><dd className="mt-1 break-all font-mono">{record.mint}</dd></div>
      <div><dt className="text-muted-foreground">Owner wallet</dt><dd className="mt-1 break-all font-mono">{record.owner || '—'}</dd></div>
      <div><dt className="text-muted-foreground">{mediaLabel} SHA-256</dt><dd className="mt-1 break-all font-mono">{record.mediaHash || record.imageHash || 'Pending'}</dd></div>
      <div><dt className="text-muted-foreground">Signing admin wallet</dt><dd className="mt-1 break-all font-mono">{record.signerPublicKey || '—'}</dd></div>
      <div><dt className="text-muted-foreground">Archived source {mediaLabel.toLowerCase()}</dt><dd className="mt-1 break-all font-mono">{archiveUri ? 'Stored' : '—'}</dd></div>
      <div><dt className="text-muted-foreground">Created / last updated</dt><dd className="mt-1">{formatDate(record.created_date)}<br />{formatDate(record.updated_date)}</dd></div>
    </dl>
    {record.totalSize > 0 && record.status !== 'success' && <div className="mt-4"><div className="mb-2 flex justify-between text-xs text-muted-foreground"><span>{(record.offset || 0).toLocaleString()} / {record.totalSize.toLocaleString()} bytes</span><span className="font-mono">{progress}%</span></div><Progress value={progress} /></div>}
    {record.errorMessage && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{record.errorMessage}</p>}
    <div className="mt-5 flex flex-wrap gap-3">{record.status === 'failed' && sourceUri ? <Button type="button" size="sm" onClick={() => onRetry(record)}><RotateCcw className="mr-2 h-4 w-4" />Retry background job</Button> : record.status !== 'success' ? <Button asChild size="sm"><Link to={`/admin/mint?mint=${encodeURIComponent(record.mint)}`}>{sourceUri ? 'View live progress' : 'Move to background'}</Link></Button> : null}<Button asChild size="sm" variant="outline"><a href={`https://solscan.io/token/${record.mint}`} target="_blank" rel="noreferrer">View on Solscan<ExternalLink className="ml-2 h-4 w-4" /></a></Button><Button type="button" size="sm" variant="outline" onClick={() => setEditing(value => !value)}><RefreshCw className="mr-2 h-4 w-4" />Re-upload metadata</Button></div>
    <InscriptionLog entries={record.events} title="Server inscription log" />
    <MintLogExport record={record} />
    {editing && <MetadataRepairForm record={record} onCancel={() => setEditing(false)} onSave={save} />}
  </article>;
}