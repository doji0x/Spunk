import React, { useState } from 'react';
import { FlaskConical, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ProbeReport from '@/components/launchpad/ProbeReport';

export default function DevnetProbePanel({ launch, env, onChange }) {
  const [sol, setSol] = useState('0.5');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const run = (action, payload = {}) => async () => {
    setBusy(action); setError(''); setResult(null);
    try {
      const { data } = await base44.functions.invoke('pumpProbe', { action, launchId: launch.id, ...payload });
      setResult({ action, data });
      onChange();
    } catch (err) { setError(err.response?.data?.error || err.message); }
    setBusy('');
  };

  const curveDone = result?.data?.curve?.complete;
  return <section className="rounded-2xl border border-[#c8a23c] bg-[#fdf6e3] p-6">
    <div className="flex items-center gap-2"><FlaskConical size={16} className="text-[#8a6d1f]" /><p className="font-mono text-[10px] tracking-widest text-[#8a6d1f]">DEVNET PROBE ONLY</p></div>
    <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#3f3413]">pump.fun layer probe</h2>
    <p className="mt-1 text-sm leading-6 text-[#6b5822]">Probe wallet {env.wallet?.slice(0, 8)}… · {(env.balance / 1e9).toFixed(3)} devnet SOL. Every action below spends devnet SOL only.</p>

    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={Boolean(busy)} onClick={run('airdrop', { sol: 2 })}>{busy === 'airdrop' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Airdrop 2 SOL</Button>
        {!launch.pumpMint && <Button disabled={Boolean(busy) || launch.status === 'preparing'} onClick={run('create', { initialBuySol: 0.1 })}>{busy === 'create' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create holder-rewards coin</Button>}
      </div>

      {launch.pumpMint && <>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-2"><Label htmlFor="probeSol">Buy amount (SOL)</Label><Input id="probeSol" className="w-32 bg-white" type="number" min={0.001} step="any" value={sol} onChange={event => setSol(event.target.value)} /></div>
          <Button variant="outline" disabled={Boolean(busy)} onClick={run('buy', { sol: Number(sol) })}>{busy === 'buy' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Buy on curve</Button>
          <Button variant="outline" disabled={Boolean(busy)} onClick={run('graduate')}>{busy === 'graduate' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Migrate to PumpSwap</Button>
          <Button variant="outline" disabled={Boolean(busy)} onClick={run('report')}>{busy === 'report' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Probe report</Button>
        </div>
        {curveDone && <p className="text-sm text-[#4f6b33]">The bonding curve is complete — migrate it to PumpSwap next.</p>}
      </>}

      {launch.status === 'preparing' && !launch.pumpMint && <p className="text-sm text-[#8a6d1f]">Inscribe and verify the companion image first — the binding JSON needs the inscription addresses.</p>}
      {error && <p className="text-sm text-[#a54132]">{error}</p>}
      {result && <ProbeReport action={result.action} data={result.data} />}
    </div>
  </section>;
}