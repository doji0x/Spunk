import React, { useState } from 'react';
import { Archive, Download } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const download = (name, type, content) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  URL.revokeObjectURL(url);
};

const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;

export default function MintLogExport({ record }) {
  const [busy, setBusy] = useState(false);
  const events = Array.isArray(record.events) ? record.events : [];
  const payload = { mint: record.mint, name: record.name, symbol: record.symbol, status: record.status, signerPublicKey: record.signerPublicKey || '', signerSecretName: record.signerSecretName || '', imageHash: record.imageHash || '', archivedImageUri: record.archivedImageUri || '', totalSize: record.totalSize || 0, offset: record.offset || 0, errorMessage: record.errorMessage || '', events };
  const exportJson = () => download(`${record.mint}-log.json`, 'application/json', JSON.stringify(payload, null, 2));
  const exportCsv = () => {
    const header = ['at', 'message', 'details', 'mint', 'signerPublicKey', 'status'];
    const rows = events.length ? events : [{ at: record.updated_date, message: 'No events recorded', details: '' }];
    const body = rows.map(entry => [entry.at, entry.message, entry.details, record.mint, record.signerPublicKey || '', record.status].map(csvCell).join(','));
    download(`${record.mint}-log.csv`, 'text/csv', [header.join(','), ...body].join('\n'));
  };
  const openArchive = async () => {
    setBusy(true);
    try {
      const response = await base44.functions.invoke('mintArchiveLink', { recordId: record.id });
      if (response.data?.signed_url) window.open(response.data.signed_url, '_blank', 'noreferrer');
    } finally { setBusy(false); }
  };
  return <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
    <Button type="button" size="sm" variant="outline" onClick={exportJson}><Download className="mr-2 h-4 w-4" />Export log (JSON)</Button>
    <Button type="button" size="sm" variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export log (CSV)</Button>
    {(record.archivedImageUri || record.imageUri) && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={openArchive}><Archive className="mr-2 h-4 w-4" />{record.archivedImageUri ? 'Download archived image' : 'Download source image'}</Button>}
  </div>;
}