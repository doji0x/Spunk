import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function useInscriptionHistory(walletAddress) {
  const [state, setState] = useState({ loading: false, records: [], error: '' });

  const load = useCallback(async () => {
    if (!walletAddress) { setState({ loading: false, records: [], error: '' }); return; }
    setState(current => ({ ...current, loading: true, error: '' }));
    try {
      const { data } = await base44.functions.invoke('publicMintStatus', { walletAddress, action: 'history' });
      if (data?.error) throw new Error(data.error);
      setState({ loading: false, records: data?.records || [], error: '' });
    } catch (error) {
      setState({ loading: false, records: [], error: error.response?.data?.error || error.message || 'Unable to load your inscriptions.' });
    }
  }, [walletAddress]);

  useEffect(() => {
    load();
    if (!walletAddress) return;
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [walletAddress, load]);

  return { ...state, reload: load };
}