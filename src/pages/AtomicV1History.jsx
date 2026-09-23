import React from 'react';
import { Link } from 'react-router-dom';
import AtomicV1WalletSelector from '@/components/atomic/AtomicV1WalletSelector';
import AtomicV1HistoryCard from '@/components/atomic/AtomicV1HistoryCard';
import useAtomicV1History from '@/hooks/useAtomicV1History';

export default function AtomicV1History() {
  const { wallet, launches, loading, error, reload } = useAtomicV1History();
  return <div className="validate-surface min-h-screen text-foreground"><main className="mx-auto max-w-2xl space-y-5 px-4 py-9 pb-24">
    <Link to="/atomic-v1" className="text-sm text-primary">Back to Atomic V1 launch</Link>
    <h1 className="text-xl font-semibold">My Atomic V1 launches</h1>
    <AtomicV1WalletSelector />
    {!wallet.address && <p>Connect the wallet used for your launch.</p>}
    {wallet.address && <button type="button" onClick={reload} disabled={loading} className="text-sm text-primary">{loading ? 'Loading...' : 'Refresh history'}</button>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {wallet.address && !loading && !launches.length && <p className="text-sm text-muted-foreground">No authorized launches found. An interrupted unsigned draft is available on the launch page in its original browser.</p>}
    {launches.map(launch => <AtomicV1HistoryCard key={launch.id || launch.requestId} launch={launch} />)}
  </main></div>;
}
