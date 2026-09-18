import React, { useEffect, useState } from 'react';
import { Image } from '@/components/ui/image';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function PofMediaField({ id, label, file, onChange, disabled, cover = false }) {
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const audio = file && (file.type.startsWith('audio/') || /\.mp3$/i.test(file.name));
  return <div className="space-y-3 rounded-xl border border-border bg-background/50 p-4">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} type="file" accept={cover ? '.png,.jpg,.jpeg,.gif,.webp' : '.png,.jpg,.jpeg,.gif,.webp,.mp3'} onChange={event => onChange(event.target.files?.[0] || null)} disabled={disabled} required className="h-auto min-h-10 text-xs" />
    <p className="text-xs leading-5 text-muted-foreground">{cover ? 'Required for MP3s. The full cover image is inscribed on the same mint.' : 'PNG, JPEG, GIF, WebP or MP3. Images become the token artwork.'} Maximum 1 MB per file.</p>
    {file && <p className="break-all font-mono text-[10px] text-muted-foreground">{file.name} · {file.size.toLocaleString()} bytes</p>}
    {preview && (audio ? <audio controls src={preview} className="w-full" /> : <Image src={preview} alt={cover ? 'Selected cover artwork' : 'Selected NFT artwork'} fittingType="fit" className="h-40 w-full rounded-lg bg-muted" />)}
  </div>;
}