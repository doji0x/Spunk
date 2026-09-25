import React, { useEffect, useState } from 'react';
import { Image } from '@/components/ui/image';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function CoinEditorImage({ fields, file, setFile, update }) {
  const [localUrl, setLocalUrl] = useState('');
  useEffect(() => {
    if (!file) { setLocalUrl(''); return; }
    const url = URL.createObjectURL(file); setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const preview = localUrl || (/^https?:\/\//i.test(fields.imageUrl) ? fields.imageUrl : '');
  const choose = value => { setFile(value || null); };
  return <div className="space-y-4">
    <div className="flex items-center gap-4"><Image src="https://media.base44.com/images/public/6aa8d3c82020abebe308c467/83ead24ae_generated_c144565f.png" alt="Upload or use an image URL" className="h-14 w-14 shrink-0 rounded-lg" fittingType="fit" /><p className="text-xs leading-5 text-muted-foreground">Upload a replacement or paste an image URL. If both are provided, the file takes priority. Leave both empty to keep the current image.</p></div>
    {preview && <Image src={preview} alt="Coin artwork preview" className="h-36 w-36 rounded-xl border border-border bg-background" fittingType="fit" />}
    <label htmlFor="edit-image-file" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!event.currentTarget.closest('fieldset')?.disabled) choose(event.dataTransfer.files[0]); }} className="block cursor-pointer rounded-xl border border-dashed border-border bg-background/50 p-4 transition hover:border-primary/50">
      <span className="block text-sm font-medium">Upload or drop an image</span><span className="mt-1 block break-all text-xs text-muted-foreground">{file ? file.name : 'PNG, JPG, WebP or GIF · up to 5 MB'}</span>
      <Input id="edit-image-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { choose(event.target.files?.[0]); event.target.value = ''; }} className="mt-3 h-auto min-h-10 py-2 text-xs" />
    </label>
    {file && <Button type="button" size="sm" variant="ghost" onClick={() => choose(null)}>Remove selected file</Button>}
    <div className="space-y-2"><Label htmlFor="edit-image-url">Or paste an image URL</Label><Input id="edit-image-url" type="url" maxLength={2048} value={fields.imageUrl} onChange={event => update('imageUrl', event.target.value)} placeholder="https://example.com/coin.png" disabled={Boolean(file)} className="font-mono text-xs" /></div>
    <div className="space-y-2"><Label htmlFor="edit-image-type">URL image type</Label><select id="edit-image-type" value={fields.imageMime} disabled={Boolean(file)} onChange={event => update('imageMime', event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="image/png">PNG</option><option value="image/jpeg">JPG</option><option value="image/webp">WebP</option><option value="image/gif">GIF</option></select></div>
  </div>;
}