import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Groups stored Astra messages into one row per conversation so the owner can reopen any past thread.
export default function useAstraConversations() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await base44.entities.AstraMessage.list('-created_date', 1000);
    const byId = new Map();
    for (const row of rows) {
      const entry = byId.get(row.conversationId) || { id: row.conversationId, lastAt: row.created_date, turns: 0, activity: 0, replies: 0, repo: '', firstMessage: '' };
      if (row.role === 'user') { entry.turns += 1; entry.firstMessage = row.content; }
      if (row.role === 'assistant') entry.replies += 1;
      if (row.role === 'activity') entry.activity += 1;
      if (row.repo && !entry.repo) entry.repo = row.repo;
      byId.set(row.conversationId, entry);
    }
    setConversations([...byId.values()].filter(entry => entry.turns));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async id => {
    const rows = await base44.entities.AstraMessage.filter({ conversationId: id }, 'created_date', 500);
    await Promise.all(rows.map(row => base44.entities.AstraMessage.delete(row.id)));
    await load();
  };

  return { conversations, loading, reload: load, remove };
}