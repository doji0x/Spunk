import React, { useState } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { formatSol } from '@/lib/bytes';

export default function SaleControls({ launch, vaultLamports, onChange }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const act = async action => {
    setBusy(action); setError('');
    try { await base44.functions.invoke('launchToken', { action, launchId: launch.id }); await onChange(); } catch (err) { setError(err.response?.data?.error || err.message); }
    setBusy('');
  };
  const remaining = launch.supply - (launch.soldTokens || 0);
  const publicUrl = `${window.location.origin}/launch/${launch.id}`;
  const stats = [['Price', formatSol(launch.priceLamports) + ' / token'], ['Sold', `${(launch.soldTokens || 0).toLocaleString()} of ${launch.supply.toLocaleString()}`], ['Proceeds recorded', formatSol(launch.proceedsLamports)], ['Vault balance', formatSol(vaultLamports)], ['Withdrawn', formatSol(launch.withdrawnLamports)]];
  return <section className="rounded-2xl border border-[#dce1d5] bg-white p-5 text-sm">
    <div className="mb-4 flex items-center justify-between"><p className="font-mono text-[10px] tracking-widest text-[#66834a]">FIXED-PRICE SALE</p><span className="font-mono text-[10px] uppercase tracking-wider text-[#7e8773]">{launch.status.replace('_', ' ')}</span></div>
    <dl className="space-y-1.5 text-xs">{stats.map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt className="text-[#7e8773]">{label}</dt><dd className="font-mono">{value}</dd></div>)}</dl>
    <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#f7f8f2] p-3"><span className="min-w-0 flex-1 truncate font-mono text-[10px]">{publicUrl}</span><button type="button" onClick={() => navigator.clipboard.writeText(publicUrl)} className="text-[#66834a]" aria-label="Copy public sale link"><Copy size={14} /></button></div>
    {error && <p className="mt-3 text-[#a54132]">{error}</p>}
    <div className="mt-4 grid gap-2 sm:grid-cols-3">
      {launch.status !== 'on_sale' && <Button type="button" disabled={Boolean(busy) || remaining <= 0} onClick={() => act('openSale')}>{busy === 'openSale' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Open sale'}</Button>}
      {launch.status === 'on_sale' && <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => act('closeSale')}>{busy === 'closeSale' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Close sale'}</Button>}
      <Button type="button" variant="outline" disabled={Boolean(busy) || vaultLamports <= 5000} onClick={() => act('withdraw')}>{busy === 'withdraw' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Withdraw proceeds'}</Button>
    </div>
  </section>;
}