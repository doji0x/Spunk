import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const storageKey = 'astra-conversation-id';

export default function useAstraChat() {
  const [conversationId, setConversationId] = useState(() => localStorage.getItem(storageKey) || crypto.randomUUID());
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { localStorage.setItem(storageKey, conversationId); }, [conversationId]);

  const load = useCallback(async id => {
    const stored = await base44.entities.AstraMessage.filter({ conversationId: id }, 'created_date', 300);
    setMessages(stored);
  }, []);

  useEffect(() => { load(conversationId); }, [conversationId, load]);

  const send = async text => {
    setBusy(true);
    setError('');
    setMessages(current => [...current, { id: `local-${Date.now()}`, role: 'user', content: text }]);
    const response = await base44.functions.invoke('astraChat', { conversationId, message: text });
    if (response.data?.error) setError(response.data.error);
    await load(conversationId);
    setBusy(false);
  };

  const reset = () => setConversationId(crypto.randomUUID());

  return { messages, busy, error, send, reset, conversationId };
}