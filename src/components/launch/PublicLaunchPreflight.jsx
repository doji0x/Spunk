import React from 'react';
import { CheckCircle2, TriangleAlert } from 'lucide-react';

// Shows what our RPC's simulation said about the prepared transaction, so a
// Phantom-side "simulation failed" can be compared against the server's view.
export default function PublicLaunchPreflight({ preflight }) {
  if (!preflight) return null;
  const Icon = preflight.ok ? CheckCircle2 : TriangleAlert;
  return <details className={`mt-4 rounded-2xl border p-4 text-left ${preflight.ok ? 'border-border bg-card/60' : 'border-destructive/40 bg-destructive/5'}`}>
    <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Icon className={`h-4 w-4 ${preflight.ok ? 'text-primary' : 'text-destructive'}`} />{preflight.ok ? `Server preflight passed · ${preflight.unitsConsumed.toLocaleString()} CU` : 'Server preflight failed'}</summary>
    {preflight.error && <p className="mt-3 break-all font-mono text-[10px] text-destructive">{preflight.error}</p>}
    {preflight.logs?.length > 0 && <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-background p-3 font-mono text-[10px] leading-4 text-muted-foreground">{preflight.logs.join('\n')}</pre>}
  </details>;
}