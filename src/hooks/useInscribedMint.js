import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

const percent = record => record?.totalSize ? Math.min(100, Math.round(((record.offset || 0) / record.totalSize) * 100)) : 0;

export default function useInscribedMint(userId, selectedMint = '') {
  const [state, setState] = useState({ busy: false, progress: 0, error: '', result: null, pending: null, activity: 'Ready', logs: [] });
  const trackedId = useRef('');
  const applyRecord = useCallback(record => {
    if (!record) return;
    trackedId.current = record.id;
    if (record.status === 'success') setState(current => ({ ...current, busy: false, pending: null, progress: 100, error: '', activity: 'Complete', result: { mint: record.mint, owner: record.owner, hash: record.imageHash } }));
    else setState(current => ({ ...current, busy: false, pending: record, progress: percent(record), error: record.status === 'failed' && record.imageUri ? record.errorMessage || 'Background inscription stopped.' : '', result: null, activity: !record.imageUri ? 'Original image required for background recovery' : record.status === 'failed' ? 'Paused — ready to retry' : 'Running safely in background' }));
  }, []);
  useEffect(() => {
    if (!userId || !selectedMint) return;
    base44.entities.MintRecord.filter({ mint: selectedMint }, '-created_date', 1).then(records => applyRecord(records[0]));
  }, [userId, selectedMint, applyRecord]);
  useEffect(() => {
    if (!userId) return;
    const poll = async () => { if (trackedId.current) applyRecord(await base44.entities.MintRecord.get(trackedId.current)); };
    const timer = window.setInterval(poll, 5000);
    return () => window.clearInterval(timer);
  }, [userId, applyRecord]);
  const start = async values => {
    if (!userId || state.busy) return;
    setState(current => ({ ...current, busy: true, error: '', result: null, activity: 'Uploading private source image' }));
    try {
      if (!values.file || values.file.size < 1 || values.file.size > 1024 * 1024) throw new Error('The image must be 1 MB or smaller.');
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file: values.file });
      const response = await base44.functions.invoke('mintInscribedNft', { action: 'startBackground', requestId: values.requestId || crypto.randomUUID(), mint: values.mint?.trim() || undefined, name: values.name, symbol: values.symbol, details: values.details, mimeType: values.file.type, totalSize: values.file.size, imageUri: file_uri });
      if (response.data?.error || !response.data?.job) throw new Error(response.data?.error || 'The background mint could not be queued.');
      applyRecord(response.data.job);
    } catch (error) { setState(current => ({ ...current, busy: false, error: error.response?.data?.error || error.message, activity: 'Queue submission failed' })); }
  };
  const resume = async () => {
    if (!state.pending || state.busy) return;
    setState(current => ({ ...current, busy: true, error: '', activity: 'Returning mint to background queue' }));
    try {
      const updated = await base44.entities.MintRecord.update(state.pending.id, { status: 'in_progress', errorMessage: '', processedAt: new Date().toISOString() });
      applyRecord(updated);
    } catch (error) { setState(current => ({ ...current, busy: false, error: error.message || 'The background job could not be retried.' })); }
  };
  return { ...state, start, resume };
}