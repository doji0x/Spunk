import React from 'react';
import { Fingerprint, ShieldCheck, Image as ImageIcon } from 'lucide-react';

export default function InscribedLaunchGuide({ admin = false }) {
  const items = [
    { icon: Fingerprint, title: admin ? 'Mint a master NFT' : 'Start with an inscription', description: admin ? 'Mint a master NFT with artwork stored on Solana before launching a coin.' : 'Use an inscribed NFT as the source for your coin artwork.' },
    { icon: ShieldCheck, title: 'Verify the connection', description: 'Check the inscription and token linkage independently against on-chain data.' },
    { icon: ImageIcon, title: 'Artwork reveal', description: 'The coin metadata resolves to the on-chain inscription image as it becomes available.' }
  ];
  return <section className="mb-6" aria-label="Inscribed launch guide"><p className="mb-3 font-mono text-[10px] tracking-widest text-primary">INSCRIBED LAUNCH GUIDE</p><div className="grid gap-3 sm:grid-cols-3">{items.map(({ icon: Icon, title, description }) => <article key={title} className="rounded-xl border border-border bg-card p-4"><Icon size={18} className="mb-3 text-primary" /><h3 className="text-sm font-semibold">{title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p></article>)}</div></section>;
}