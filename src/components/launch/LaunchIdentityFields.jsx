import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function LaunchIdentityFields({ input, setInput, locked }) {
  const change = (key, value) => setInput(current => ({ ...current, [key]: value }));
  return <section className="space-y-4 p-5 sm:p-6">
    <h2 className="font-heading font-semibold">Coin details</h2>
    <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
      <div className="space-y-2"><Label htmlFor="coin-name">Coin name *</Label><Input id="coin-name" required disabled={locked} maxLength={32} value={input.name} onChange={event => change('name', event.target.value)} placeholder="Your coin name" className="h-11 bg-background/50" /></div>
      <div className="space-y-2"><Label htmlFor="coin-symbol">Ticker *</Label><Input id="coin-symbol" required disabled={locked} maxLength={10} value={input.symbol} onChange={event => change('symbol', event.target.value.toUpperCase())} placeholder="COIN" className="h-11 bg-background/50 font-mono" /></div>
    </div>
    <div className="space-y-2"><Label htmlFor="coin-description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="coin-description" disabled={locked} maxLength={2000} value={input.description} onChange={event => change('description', event.target.value)} placeholder="Tell people what your coin is about." className="min-h-24 bg-background/50" /></div>
  </section>;
}