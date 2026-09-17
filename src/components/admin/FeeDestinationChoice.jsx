import React from 'react';
import { Check } from 'lucide-react';

const choices = [
  { id: 'creator', title: 'Creator only', note: 'Default · 100% of creator fees go to the creator.' },
  { id: 'split', title: 'Custom split', note: 'Divide 100% between the creator and approved recipients.' },
  { id: 'holders', title: 'Holder rewards', note: 'Permanent · 100% uses pump.fun’s holder rewards program.' },
];

export default function FeeDestinationChoice({ value, holderRewardEnabled, disabled, onChange }) {
  return <fieldset className="space-y-2">
    <legend className="text-sm font-medium">Who receives creator fees?</legend>
    <div className="grid gap-2 sm:grid-cols-3">{choices.map(choice => {
      const unavailable = choice.id === 'holders' && !holderRewardEnabled;
      const selected = value === choice.id;
      return <button key={choice.id} type="button" disabled={disabled || unavailable} onClick={() => onChange(choice.id)} className={`relative rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-launch-brand bg-launch-brand/10' : 'border-launch-border bg-background'}`}>
        {selected && <Check size={15} className="absolute right-3 top-3 text-launch-brand" />}
        <span className="block pr-5 text-sm font-medium">{choice.title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{choice.note}</span>
      </button>;
    })}</div>
  </fieldset>;
}