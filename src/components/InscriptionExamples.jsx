import React, { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function InscriptionExamples({ onValidate, disabled }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [message, setMessage] = useState('');
  const [searched, setSearched] = useState(false);
  const discover = async () => {
    setLoading(true); setMessage('');
    try {
      const { data } = await base44.functions.invoke('findInscriptionExamples', { cursor });
      if (data.status !== 'success') { setMessage(data.message || 'Discovery is unavailable.'); return; }
      const decoded = await Promise.all(data.items.map(async item => {
        const image = new window.Image(); image.src = item.image;
        try { await image.decode(); return item; } catch { return null; }
      }));
      const verified = decoded.filter(Boolean);
      setItems(previous => [...new Map([...previous, ...verified].map(item => [item.mint, item])).values()]);
      setCursor(data.cursor); setSearched(true);
      setMessage(verified.length ? 'These Metaplex and LibrePlex images passed on-chain verification and decoding. Select a mint to check all three standards.' : data.cursor ? 'No displayable image found in this batch. Search the next batch.' : 'No displayable examples found in this search. This does not prove that none exist.');
    } catch { setMessage('Discovery is unavailable. Please try again.'); }
    finally { setLoading(false); }
  };
  return <section className="mt-4 rounded-xl border border-border bg-card p-4 text-left text-xs">
    <button type="button" disabled={loading || disabled} onClick={discover} className="flex items-center gap-2 font-medium text-foreground disabled:opacity-50">{loading && <LoaderCircle size={14} className="animate-spin" />}{loading ? 'Finding verified images…' : cursor ? 'Search next batch' : searched ? 'Search again' : 'Find real test mints'}</button>
    <p className="mt-2 text-muted-foreground">Helius discovery · Metaplex and LibrePlex images verified through the private RPC.</p>
    {message && <p aria-live="polite" className="mt-3 text-muted-foreground">{message}</p>}
    <ul className="mt-2 space-y-2">{items.map(item => <li key={item.mint}><button type="button" disabled={loading || disabled} onClick={() => onValidate(item.mint)} className="w-full break-all rounded-md border border-border p-3 text-left font-mono hover:bg-muted disabled:opacity-50">{item.name && <span className="mb-1 block font-body">{item.name}</span>}{item.mint}<span className="mt-1 block font-body text-muted-foreground">{item.standard || 'Verified'} image · Validate all standards</span></button></li>)}</ul>
  </section>;
}