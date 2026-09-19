import React from 'react';
import { AlertTriangle } from 'lucide-react';

export const maxAtomicImageBytes = 7500;

export default function AtomicV1ImageLimitNotice({ file }) {
  if (!file) return null;
  const over = file.size - maxAtomicImageBytes;
  return <div className={`rounded-2xl border p-4 ${over > 0 ? 'border-destructive/60 bg-destructive/5' : 'border-border bg-card'}`}>
    <p className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className={`h-4 w-4 ${over > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />Image size check</p>
    <dl className="mt-3 grid grid-cols-2 gap-3 font-mono text-xs"><div><dt className="text-muted-foreground">Your file</dt><dd className="mt-1">{file.size.toLocaleString()} bytes</dd></div><div><dt className="text-muted-foreground">Maximum</dt><dd className="mt-1">{maxAtomicImageBytes.toLocaleString()} bytes</dd></div></dl>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">{over > 0
      ? `Shrink this image by at least ${over.toLocaleString()} bytes — reduce its pixel dimensions or export it as a smaller PNG or WebP — then upload it again.`
      : 'This file is within the limit. If the size still cannot be calculated, check the coin name and ticker above.'}</p>
  </div>;
}