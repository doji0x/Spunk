import React from 'react';
import { ShieldCheck, ShieldOff } from 'lucide-react';

const rows = [['Name', 'name'], ['Symbol', 'symbol'], ['Description', 'description'], ['Image URL', 'imageUrl'], ['Image type', 'imageMime']];

export default function MetadataOverrideStatus({ override, inscribed }) {
  const active = Boolean(override);
  return <div className={`rounded-xl border p-4 ${active ? 'border-primary/40 bg-primary/5' : 'border-border bg-background/50'}`}>
    <div className="flex flex-wrap items-center gap-2">
      {active ? <ShieldCheck className="h-4 w-4 text-primary" /> : <ShieldOff className="h-4 w-4 text-muted-foreground" />}
      <span className={`font-mono text-[10px] tracking-[0.25em] ${active ? 'text-primary' : 'text-muted-foreground'}`}>{active ? 'OVERRIDE ACTIVE' : 'NO OVERRIDE · SERVING INSCRIBED'}</span>
    </div>
    {active
      ? <>
          <p className="mt-2 text-[11px] text-muted-foreground">Set {new Date(override.created_date).toLocaleString()}{override.adminEmail ? ` by ${override.adminEmail}` : ''}</p>
          <dl className="mt-3 space-y-1.5">
            {rows.map(([label, key]) => <div key={key} className="flex flex-wrap gap-x-2 text-xs">
              <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
              <dd className={`min-w-0 flex-1 break-all ${override[key] ? '' : 'text-muted-foreground'}`}>{override[key] || 'inscribed value'}</dd>
            </div>)}
          </dl>
        </>
      : <dl className="mt-3 space-y-1.5">
          {[['Name', inscribed.name], ['Symbol', inscribed.symbol]].map(([label, value]) => <div key={label} className="flex flex-wrap gap-x-2 text-xs">
            <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 flex-1 break-all">{value || '—'}</dd>
          </div>)}
        </dl>}
  </div>;
}