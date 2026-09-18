import React from 'react';
import { Archive, BadgeCheck, Palette } from 'lucide-react';
import InscribedCoinStory from '@/components/punks/InscribedCoinStory';

const principles = [
  {
    icon: Archive,
    label: 'PRESERVATION #1',
    title: 'The image stays in mint condition',
    text: 'The actual image bytes are inscribed directly on Solana—not stored behind an Arweave, IPFS, or external-host link. With no host to disappear and no URL to rot, the work remains preserved with its on-chain record.',
  },
  {
    icon: BadgeCheck,
    label: 'FOR COLLECTORS',
    title: 'Collect with proof, not promises',
    text: 'Collectors can verify the artwork itself, its provenance, and its permanent relationship to the NFT. That verifiable continuity protects confidence in authenticity and resale integrity over time.',
  },
  {
    icon: Palette,
    label: 'FOR ARTISTS',
    title: 'Keep the master. Expand the work.',
    text: 'Artists retain ownership of their master NFT while launching a token connected to the work on-chain. The token becomes part of the artwork’s ecosystem, creating a new path to earn from it without surrendering the original.',
  },
];

export default function CurationPreservation() {
  return <section aria-labelledby="curation-title" className="mt-16 border-t border-border pt-14 text-left">
    <p className="font-mono text-[10px] tracking-[0.24em] text-primary">CURATION · PRESERVATION · OWNERSHIP</p>
    <h2 id="curation-title" className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Designed to keep art in <span className="gold-text">mint condition.</span></h2>
    <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Curation starts with preserving the work itself. Image preservation is our number one priority because lasting art should not depend on a company, gateway, or storage subscription remaining online.</p>
    <div className="mt-7 grid gap-4 sm:grid-cols-3">
      {principles.map(({ icon: Icon, label, title, text }) => <article key={label} className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur-sm">
        <Icon className="h-5 w-5 text-primary" />
        <p className="mt-5 font-mono text-[9px] tracking-[0.18em] text-primary">{label}</p>
        <h3 className="mt-2 font-display text-base font-semibold leading-5">{title}</h3>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{text}</p>
      </article>)}
    </div>
    <InscribedCoinStory />
    <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-6">
      <p className="font-mono text-[9px] tracking-[0.18em] text-primary">THE WORK BEHIND EVERY INSCRIPTION</p>
      <h3 className="mt-2 font-display text-xl font-semibold">Preservation is a process—not a pointer.</h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Every image must be prepared as exact bytes, divided into safe on-chain writes, submitted across multiple Solana transactions, and confirmed piece by piece. The completed inscription is then reconstructed from the chain and checked against the original so collectors can verify that the artwork—not merely a link to it—was preserved correctly.</p>
      <div className="mt-5 grid gap-3 font-mono text-[9px] tracking-[0.12em] text-muted-foreground sm:grid-cols-4">
        <span>01 · PREPARE BYTES</span><span>02 · WRITE IN CHUNKS</span><span>03 · CONFIRM ON-CHAIN</span><span>04 · RECONSTRUCT + VERIFY</span>
      </div>
      <p className="mt-5 border-t border-primary/15 pt-5 text-sm leading-6 text-foreground"><strong className="text-primary">The original remains the original.</strong> Once an inscription is completed and finalized, that minted piece cannot be swapped out for a different work. It may be replicated into another mint, but every replica has its own distinct address and on-chain history—it can never replace the provenance of the first.</p>
    </div>
  </section>;
}