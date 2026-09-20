import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Every delegation Astra makes is stored as an activity row with toolName 'assignJob',
// holding the job brief, the worker's final report and how long the job took.
export default function useAstraJobLog() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const rows = await base44.entities.AstraMessage.filter({ role: 'activity', toolName: 'assignJob' }, '-created_date', 200);
    setJobs(rows.map(parseJob));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { jobs, loading, reload: load };
}

function parseJob(row) {
  const arrow = (row.detail || '').indexOf(' → ');
  return {
    id: row.id,
    conversationId: row.conversationId,
    repo: row.repo,
    at: row.created_date,
    durationMs: row.durationMs,
    failed: (row.content || '').includes('— failed:'),
    // "Assigning to FUNCTIONS ENGINEER: <job>" — the title is the crew role that ran it.
    role: (row.content || '').replace(/^Assigning to /, '').split(':')[0].trim(),
    job: arrow === -1 ? row.detail || '' : row.detail.slice(0, arrow),
    result: arrow === -1 ? '' : row.detail.slice(arrow + 3)
  };
}