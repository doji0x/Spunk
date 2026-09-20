import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

const storageKey = 'astra-conversation-id';

export default function useAstraChat() {
  // A ?conversation= link from the history page reopens that exact thread, so Astra regains its full memory of it.
  const [conversationId, setConversationId] = useState(() => new URLSearchParams(window.location.search).get('conversation') || localStorage.getItem(storageKey) || crypto.randomUUID());
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [auditIssues, setAuditIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [auditAction, setAuditAction] = useState(false);
  const runRef = useRef(null);
  const activeIdRef = useRef(conversationId);
  const loadSequence = useRef(0);
  const auditRunning = auditIssues.some(issue => issue.runStatus === 'running');
  const working = busy || auditRunning;

  useEffect(() => { localStorage.setItem(storageKey, conversationId); }, [conversationId]);

  const load = useCallback(async id => {
    const sequence = ++loadSequence.current;
    const [stored, issues] = await Promise.all([
      base44.entities.AstraMessage.filter({ conversationId: id }, '-created_date', 300),
      base44.entities.AstraAuditIssue.filter({ conversationId: id }, '-created_date', 300)
    ]);
    if (activeIdRef.current !== id || sequence !== loadSequence.current) return;
    setMessages(stored.reverse());
    setAuditIssues(issues.reverse());
    setLoading(false);
  }, []);

  // Astra writes each tool step as it runs, so polling while busy streams progress into the chat.
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => { load(conversationId); }, 2000);
    return () => clearInterval(timer);
  }, [working, conversationId, load]);

  useEffect(() => {
    activeIdRef.current = conversationId;
    setLoading(true);
    load(conversationId).catch(requestError => { setError(requestError.message); setLoading(false); });
    const unsubscribe = base44.entities.AstraAuditIssue.subscribe(event => {
      if (!event.data?.conversationId || event.data.conversationId === conversationId) load(conversationId);
    });
    return unsubscribe;
  }, [conversationId, load]);

  const send = async (text, decisionPayload = null) => {
    if (runRef.current || working || loading) return;
    setAuditAction(!!decisionPayload);
    // A paused reply is abandoned by the chat: its run id stops matching, so the late answer is ignored.
    const runId = crypto.randomUUID();
    runRef.current = runId;
    setBusy(true);
    setError('');
    setMessages(current => [...current, { id: `local-${Date.now()}`, role: 'user', content: text, turn: Math.max(0, ...current.map(item => item.turn || 0)) + 1 }]);
    try {
      const response = await base44.functions.invoke('astraChat', { conversationId, ...(decisionPayload || { message: text }) });
      if (runRef.current !== runId) return;
      if (response.data?.error) setError(response.data.error);
    } catch (requestError) {
      if (runRef.current !== runId) return;
      // A rejected request throws, so read the server's explanation instead of leaking an AxiosError.
      setError(requestError.response?.data?.error || requestError.message || 'Astra could not complete that request.');
    }
    if (runRef.current !== runId) return;
    try { await load(conversationId); }
    catch (requestError) { setError(requestError.message); }
    finally { runRef.current = null; setBusy(false); setAuditAction(false); }
  };

  // Stops waiting on the current reply so the conversation stays readable and editable.
  const pause = () => { runRef.current = null; setBusy(false); load(conversationId); };

  const editMessage = async (id, content) => {
    await base44.entities.AstraMessage.update(id, { content });
    await load(conversationId);
  };

  const deleteMessage = async id => {
    await base44.entities.AstraMessage.delete(id);
    await load(conversationId);
  };

  const open = id => {
    if (working || runRef.current) return;
    activeIdRef.current = id;
    setMessages([]); setAuditIssues([]); setError(''); setLoading(true);
    setConversationId(id);
  };
  const reset = () => open(crypto.randomUUID());
  const decideAudit = (issueId, decision) => send(decision === 'approve' ? 'Approve this fix plan and run it.' : decision === 'reject' ? 'Reject this fix plan and propose a revised plan.' : 'Retry the audit follow-up.', { issueId, decision });

  return { messages, auditIssues, loading, busy: working, error, send, reset, open, conversationId, pause: auditAction || auditRunning ? undefined : pause, decideAudit, editMessage, deleteMessage };
}