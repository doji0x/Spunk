import React, { useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

export default function AgentTestButton({ onQueued }) {
  const { user } = useAuth();
  const [pending, setPending] = useState(false);
  const [response, setResponse] = useState(null);
  const locked = useRef(false);
  const submit = async () => {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setResponse(null);
    try {
      const result = await base44.functions.invoke('testAgentInscription', { confirm: true });
      setResponse(result.data);
      if (result.data?.response?.mint) onQueued();
    } catch (error) {
      setResponse(error.response?.data || error.data || { error: error.message || 'Submission failed.' });
    } finally {
      locked.current = false;
      setPending(false);
    }
  };
  if (user?.role !== 'admin') return null;
  return <section className="mt-8 rounded-2xl border border-primary/20 bg-card p-5">
    <p className="font-mono text-[10px] tracking-widest text-primary">ADMIN TEST</p>
    <p className="my-3 text-xs leading-5 text-muted-foreground">Submit a tiny synthetic MP3 through the agent endpoint. Each press creates a real Solana inscription and spends admin-wallet SOL, subject to existing rate and cost limits. This tests the pipeline, not autonomous Fly Brain activity.</p>
    <Button onClick={submit} disabled={pending}>{pending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}{pending ? 'Submitting test…' : 'Send test fart'}</Button>
    {pending && <p role="status" className="mt-3 text-xs text-muted-foreground">Preparing the on-chain mint; please wait for the response before trying again.</p>}
    {response && <div className="mt-4" aria-live="polite"><p className="mb-2 text-xs text-muted-foreground">{response.response?.mint ? 'Queued — follow the live progress below.' : 'Submission response'}</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-muted p-3 font-mono text-[11px]">{JSON.stringify(response, null, 2)}</pre></div>}
  </section>;
}