import React from 'react';
import { ArrowRight, Gem, PartyPopper } from 'lucide-react';

export default function InscribedLaunchGuide({ admin = false }) {
  const items = [
    {
      icon: Gem,
      title: admin ? 'One master NFT' : 'Use your own inscription',
      text: admin
        ? 'Each mint created here is one single master NFT—not an NFT collection.'
        : 'Launch from a unique inscribed NFT or an inscribed NFT collection you hold or control.',
    },
    {
      icon: ArrowRight,
      title: 'Directional verification',
      text: 'The token launch is connected to its inscription for true, directional verification on-chain.',
    },
    {
      icon: PartyPopper,
      title: 'Create a reveal party',
      text: 'Mint the master NFT first, launch the token, then inscribe the final artwork after launch for an on-chain reveal.',
    },
  ];

  return <section aria-label="Inscribed token launch options" className="mb-7 grid gap-3 sm:grid-cols-3">
    {items.map(({ icon: Icon, title, text }) => <div key={title} className="rounded-2xl border border-border bg-card/70 p-4">
      <Icon className="mb-3 h-5 w-5 text-primary" />
      <h3 className="font-display text-sm font-semibold">{title}</h3>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{text}</p>
    </div>)}
  </section>;
}