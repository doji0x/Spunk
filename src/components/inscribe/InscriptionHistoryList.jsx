import React from 'react';
import { History, Loader2 } from 'lucide-react';
import InscriptionHistoryCard from './InscriptionHistoryCard';
import useInscriptionHistory from '@/hooks/useInscriptionHistory';

export default function InscriptionHistoryList({ walletAddress }) {
  const { loading, records, error } = useInscriptionHistory(walletAddress);
  if (!walletAddress) return <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">Connect your wallet to see the inscriptions it has created.</p>;
  if (loading && !records.length) return <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading your inscriptions…</div>;
  if (error) return <p role="alert" className="rounded-2xl border border-border bg-card p-5 text-sm text-destructive">{error}</p>;
  if (!records.length) return <div className="rounded-2xl border border-border bg-card p-5 text-center text-sm text-muted-foreground"><History className="mx-auto mb-2 h-5 w-5" />No inscriptions yet. Your work in progress will appear here.</div>;
  return <ul className="space-y-3">{records.map(record => <InscriptionHistoryCard key={record.id} record={record} />)}</ul>;
}