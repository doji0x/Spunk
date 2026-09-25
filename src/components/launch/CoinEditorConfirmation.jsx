import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Image } from '@/components/ui/image';

export default function CoinEditorConfirmation({ saved }) {
  if (!saved) return null;
  return <section role="status" className="space-y-4 rounded-2xl border border-primary/30 bg-card p-5">
    <h2 className="flex items-center gap-2 font-semibold text-primary"><CheckCircle2 size={18} />{saved.cleared ? 'Original name and image restored' : 'Metadata updated'}</h2>
    <div className="flex items-center gap-3">{saved.imageUrl && <Image src={saved.imageUrl} alt={saved.name} className="h-16 w-16 rounded-lg" fittingType="fit" />}<p className="min-w-0 break-words font-medium">{saved.name} <span className="text-muted-foreground">({saved.symbol})</span></p></div>
    <div className="space-y-2">{Object.entries(saved.socials || {}).filter(([, url]) => url).map(([key, url]) => <a key={key} href={url} target="_blank" rel="noreferrer" className="block break-all text-xs text-primary underline">{key === 'twitter' ? 'X / Twitter' : key}: {url}</a>)}</div>
    <p className="text-xs leading-5 text-muted-foreground">Changes are off-chain. On-chain values and inscription bytes are unchanged. Third-party caches may take up to 24 hours or longer to refresh.</p>
  </section>;
}