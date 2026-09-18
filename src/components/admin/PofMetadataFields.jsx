import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function PofMetadataFields({ values, onChange, disabled }) {
  const field = key => ({ value: values[key], onChange: event => onChange(key, event.target.value), disabled, required: true });
  return <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
      <div className="space-y-2"><Label htmlFor="pof-name">NFT name</Label><Input id="pof-name" maxLength={32} placeholder="Proof of Fart" {...field('name')} /></div>
      <div className="space-y-2"><Label htmlFor="pof-symbol">Symbol</Label><Input id="pof-symbol" maxLength={10} placeholder="POF" className="font-mono" {...field('symbol')} /></div>
    </div>
    <div className="space-y-2"><Label htmlFor="pof-description">Description</Label><Textarea id="pof-description" maxLength={1000} rows={4} placeholder="Describe this one-of-one inscription…" {...field('description')} /><p className="text-right text-[10px] text-muted-foreground">{values.description.length} / 1,000</p></div>
    <div className="space-y-2"><Label htmlFor="pof-destination">Destination wallet</Label><Input id="pof-destination" className="font-mono text-xs" placeholder="Solana wallet address" {...field('destinationWallet')} /><p className="text-xs leading-5 text-muted-foreground">Receives the NFT after all media is verified on-chain. Signing uses the dedicated admin wallet.</p></div>
  </div>;
}