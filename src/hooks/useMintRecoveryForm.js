import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function useMintRecoveryForm(pending, initialMint = '') {
  const [values, setValues] = useState({ name: '', symbol: '', details: '', mint: initialMint, file: null, requestId: undefined });
  const [recovery, setRecovery] = useState({ loading: false, error: '' });
  const change = (field, value) => setValues(current => ({ ...current, [field]: value, ...(field === 'mint' ? { requestId: undefined } : {}) }));
  useEffect(() => {
    if (!pending && initialMint) setValues(current => ({ ...current, mint: initialMint }));
  }, [initialMint, Boolean(pending)]);
  useEffect(() => {
    if (!pending) return;
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[pending.mimeType] || 'png';
    setValues({ name: pending.name || '', symbol: pending.symbol || '', details: pending.details || '', mint: pending.mint || '', requestId: pending.requestId, file: new File([pending.bytes], pending.fileName || `recovered-image.${extension}`, { type: pending.mimeType }) });
    setRecovery({ loading: false, error: '' });
  }, [pending?.requestId, pending?.mint]);
  useEffect(() => {
    if (pending) return;
    const mint = values.mint.trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
      setRecovery({ loading: false, error: '' });
      return;
    }
    let cancelled = false;
    setRecovery({ loading: true, error: '' });
    const timer = setTimeout(async () => {
      try {
        const records = await base44.entities.MintRecord.filter({ mint }, '-created_date', 1);
        if (cancelled) return;
        const record = records[0];
        if (record) setValues(current => ({ ...current, name: record.name || '', symbol: record.symbol || '', details: record.description || '', requestId: record.requestId }));
        setRecovery({ loading: false, error: record ? '' : 'No saved details were found for this mint. Enter its original details and select the original image to recover it.' });
      } catch (error) {
        if (!cancelled) setRecovery({ loading: false, error: error.message || 'Could not load the saved mint details.' });
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [values.mint, Boolean(pending)]);
  return { values, change, recovery };
}