import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { usePhantomWallet } from '@/contexts/PhantomWalletContext';

export default function useAtomicV1History() {
  const wallet = usePhantomWallet();
  const [launches, setLaunches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!wallet.address) { setLaunches([]); return; }
    setLoading(true); setError('');
    try {
      const { data } = await base44.functions.invoke('publicAtomicV1Launch', { action: 'history', walletAddress: wallet.address });
      setLaunches(data.launches || []);
    } catch (reason) {
      setError(reason.response?.data?.error || reason.message || 'Unable to load your launches.');
    } finally { setLoading(false); }
  }, [wallet.address]);

  useEffect(() => { load(); }, [load]);
  return { wallet, launches, loading, error, reload: load };
}