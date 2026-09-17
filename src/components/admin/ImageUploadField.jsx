import React, { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const matchesType = (bytes, type) => {
  if (type === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (type === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === 'image/gif') return new TextDecoder().decode(bytes.slice(0, 6)).startsWith('GIF8');
  if (type === 'image/webp') return new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  return false;
};

export default function ImageUploadField({ disabled, onFileChange, restoredFile }) {
  const [preview, setPreview] = useState('');
  const [fileInfo, setFileInfo] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    if (!restoredFile) return;
    setError('');
    setFileInfo(restoredFile);
    setPreview(URL.createObjectURL(restoredFile));
  }, [restoredFile]);

  const selectFile = async event => {
    const file = event.target.files?.[0];
    setError(''); setFileInfo(null); onFileChange(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview('');
    if (!file) return;
    if (file.size > 1024 * 1024) return setError('The image must be 1 MB or smaller.');
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!matchesType(bytes, file.type)) return setError('The file contents do not match a supported PNG, JPEG, GIF, or WebP image.');
    const url = URL.createObjectURL(file);
    try { await new Promise((resolve, reject) => { const image = new window.Image(); image.onload = resolve; image.onerror = reject; image.src = url; }); }
    catch { URL.revokeObjectURL(url); return setError('This image cannot be decoded by the browser.'); }
    setPreview(url); setFileInfo(file); onFileChange(file);
  };

  return <div className="space-y-2"><Label htmlFor="image">Inscribed image</Label><Input id="image" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={selectFile} required disabled={disabled} />{error && <p className="text-xs text-destructive">{error}</p>}{preview && <div className="overflow-hidden rounded-lg border bg-muted"><Image src={preview} alt="Selected image preview" fittingType="fit" className="h-48 w-full" /><p className="flex items-center gap-2 border-t bg-card px-3 py-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-primary" />Validated · {fileInfo.name} · {(fileInfo.size / 1024).toFixed(1)} KB</p></div>}<p className="text-xs text-muted-foreground">PNG, JPEG, GIF, or WebP · 1 MB maximum.</p></div>;
}