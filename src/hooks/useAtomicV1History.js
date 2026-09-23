import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAtomicV1Wallet } from '@/contexts/AtomicV1WalletContext';

export default function useAtomicV1History() {
  const wallet = useAtomicV1Wallet();
  const [launches, setLaunches] = useState([]), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const revision = useRef(0);
  const reload = useCallback(async () => {
    const request = ++revision.current;
    if (!wallet.address) { setLaunches([]); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const { data } = await base44.functions.invoke('publicAtomicV1Launch', { action: 'history', walletAddress: wallet.address });
      if (request === revision.current) setLaunches(data.launches || []);
    } catch (reason) { if (request === revision.current) setError(reason.response?.data?.error || reason.message || 'Unable to read history.'); }
    finally { if (request === revision.current) setLoading(false); }
  }, [wallet.address]);
  useEffect(() => { setLaunches([]); reload(); return () => { revision.current++; }; }, [reload]);
  return { wallet, launches, loading, error, reload };
}
