import React, { useEffect, useState } from 'react';
import { ArrowLeft, Database } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import MintRecordCard from '@/components/admin/MintRecordCard';

export default function AdminMints() {
  const [user, setUser] = useState();
  const [records, setRecords] = useState();
  useEffect(() => { base44.auth.me().then(current => { setUser(current); if (current.role === 'admin') base44.entities.MintRecord.list('-created_date', 100).then(setRecords); }); }, []);
  const updateMetadata = async (record, values) => {
    const response = await base44.functions.invoke('mintInscribedNft', { action: 'updateMetadata', mint: record.mint, ...values });
    if (response.data.error) throw new Error(response.data.error);
    const updated = await base44.entities.MintRecord.update(record.id, { ...values, symbol: values.symbol.toUpperCase(), errorMessage: '' });
    setRecords(current => current.map(item => item.id === record.id ? updated : item));
  };
  if (!user || (user.role === 'admin' && !records)) return <div className="validate-surface flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-launch-border border-t-launch-brand" /></div>;
  if (user.role !== 'admin') return <main className="validate-surface flex min-h-screen items-center justify-center px-5"><p>Admin access required.</p></main>;
  return <main className="validate-surface min-h-screen px-5 py-10 text-foreground"><div className="mx-auto max-w-3xl">
    <Link to="/admin/mint" className="mb-8 inline-flex items-center gap-2 text-sm text-launch-brand"><ArrowLeft size={16} />Back to mint console</Link>
    <div className="mb-7 flex items-start gap-3"><span className="rounded-full bg-secondary p-2 text-launch-brand"><Database size={20} /></span><div><p className="font-mono text-[10px] tracking-widest text-launch-brand">ADMIN · MINT HISTORY</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Recent mints</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Audit completed and interrupted mints, or re-upload their on-chain metadata.</p></div></div>
    {!records.length ? <div className="rounded-2xl border border-launch-border bg-card p-8 text-center text-sm text-muted-foreground">No mints have been logged yet.</div> : <div className="space-y-4">{records.map(record => <MintRecordCard key={record.id} record={record} onSave={updateMetadata} />)}</div>}
  </div></main>;
}