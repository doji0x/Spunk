import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

const storageKey = 'astra-conversation-id';

export default function useAstraChat() {
  const [conversationId, setConversationId] = useState(() => localStorage.getItem(storageKey) || crypto.randomUUID());
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const runRef = useRef(null);

  useEffect(() => { localStorage.setItem(storageKey, conversationId); }, [conversationId]);

  const load = useCallback(async id => {
    const stored = await base44.entities.AstraMessage.filter({ conversationId: id }, 'created_date', 300);
    setMessages(stored);
  }, []);

  // Astra writes each tool step as it runs, so polling while busy streams progress into the chat.
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => { load(conversationId); }, 2000);
    return () => clearInterval(timer);
  }, [busy, conversationId, load]);

  useEffect(() => { load(conversationId); }, [conversationId, load]);

  const send = async text => {
    // A paused reply is abandoned by the chat: its run id stops matching, so the late answer is ignored.
    const runId = crypto.randomUUID();
    runRef.current = runId;
    setBusy(true);
    setError('');
    setMessages(current => [...current, { id: `local-${Date.now()}`, role: 'user', content: text, turn: current.filter(item => item.role === 'user').length + 1 }]);
    try {
      const response = await base44.functions.invoke('astraChat', { conversationId, message: text });
      if (runRef.current !== runId) return;
      if (response.data?.error) setError(response.data.error);
    } catch (requestError) {
      if (runRef.current !== runId) return;
      // A rejected request throws, so read the server's explanation instead of leaking an AxiosError.
      setError(requestError.response?.data?.error || requestError.message || 'Astra could not complete that request.');
    }
    if (runRef.current !== runId) return;
    await load(conversationId);
    setBusy(false);
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

  const reset = () => setConversationId(crypto.randomUUID());

  return { messages, busy, error, send, reset, conversationId, pause, editMessage, deleteMessage };
}