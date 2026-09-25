import React, { useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Image } from '@/components/ui/image';

export default function NormalLaunchImageField({ file, setFile }) {
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <div className="space-y-4">
    <div className="flex items-center gap-4 rounded-xl border border-dashed border-border bg-background/50 p-4">
      {preview ? <Image src={preview} alt="Coin image preview" className="h-20 w-20 shrink-0 rounded-lg" fittingType="fit" /> : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40"><Upload size={22} className="text-muted-foreground" /></div>}
      <div className="min-w-0"><label htmlFor="coin-image" className="block text-sm font-medium">{file ? 'Selected coin image' : 'Choose your coin image'} <span className="text-primary">*</span></label><p className="mt-1 break-all text-xs leading-5 text-muted-foreground">{file ? file.name : 'This image will appear with your coin.'}</p></div>
    </div>
    <Input id="coin-image" type="file" required accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => setFile(e.target.files?.[0] || null)} aria-describedby="coin-image-help" className="h-auto min-h-11 w-full min-w-0 py-2.5 text-xs file:mr-3 file:text-foreground" />
    <p id="coin-image-help" className="text-xs text-muted-foreground">PNG, JPG, WebP or GIF · up to 5 MB</p>
  </div>;
}