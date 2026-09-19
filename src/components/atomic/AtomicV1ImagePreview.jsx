import React, { useEffect, useState } from 'react';
import { FileImage, Hash, ImageIcon } from 'lucide-react';

const panels = [
  { key: 'inscription', icon: Hash, title: 'Transaction inscription', note: 'Embedded unchanged inside the V1 launch transaction.' },
  { key: 'metadata', icon: ImageIcon, title: 'Pump metadata image', note: 'Served to Pump.fun from the same uploaded bytes.' }
];

export default function AtomicV1ImagePreview({ file, size }) {
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <div className="grid gap-3 sm:grid-cols-2">{panels.map(panel => {
    const Icon = panel.icon;
    return <div key={panel.key} className="rounded-2xl border border-border bg-card p-3">
      <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-primary"><Icon className="h-3 w-3" />{panel.title}</p>
      <div className="proof-image mt-2 flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-border">
        {preview
          ? <img src={preview} alt={`${panel.title} preview`} className="h-full w-full object-contain [image-rendering:pixelated]" />
          : <span className="flex flex-col items-center gap-1.5 px-3 text-center text-[11px] text-muted-foreground"><FileImage className="h-5 w-5" />Awaiting image</span>}
      </div>
      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{panel.note}</p>
      {size?.imageSha256 && <p className="mt-1.5 truncate font-mono text-[10px] text-muted-foreground">{size.imageSha256}</p>}
    </div>;
  })}</div>;
}