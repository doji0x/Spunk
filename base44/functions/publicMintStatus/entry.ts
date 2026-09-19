import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function present(record, includeEvents = false) {
  return {
    id: record.id,
    mint: record.mint,
    requestId: record.requestId,
    name: record.name,
    symbol: record.symbol,
    status: record.status,
    errorMessage: record.status === 'failed' ? record.errorMessage || 'Background inscription stopped.' : '',
    totalSize: (record.totalSize || 0) + (record.coverSize || 0),
    offset: (record.offset || 0) + (record.coverOffset || 0),
    mediaType: record.mediaType || 'image',
    prepared: record.prepared !== false,
    submissionSource: record.pof ? 'manual' : 'agent',
    coverSize: record.coverSize || 0,
    coverOffset: record.coverOffset || 0,
    mediaHash: record.mediaHash || record.imageHash || '',
    destinationWallet: record.destinationWallet || '',
    updatedAt: record.processedAt || record.updated_date,
    ...(includeEvents ? { events: (Array.isArray(record.events) ? record.events : []).slice(-12).map(event => ({ at: event.at, message: event.message })) } : {})
  };
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const input = await req.json().catch(() => ({}));
    if (input.action === 'adminPof') {
      const user = await base44.auth.me().catch(() => null);
      if (user?.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
      const records = await base44.entities.MintRecord.filter({ pof: true, ...(input.recordId ? { id: String(input.recordId) } : {}) }, '-created_date', 1);
      return Response.json({ record: records[0] ? present(records[0], true) : null });
    }
    if (input.action === 'latestAgent') {
      const [requests, manual] = await Promise.all([
        base44.asServiceRole.entities.AgentInscriptionRequest.filter({ status: 'queued' }, '-created_date', 1),
        base44.asServiceRole.entities.MintRecord.filter({ pof: true }, '-created_date', 1)
      ]);
      const agent = requests[0] ? await base44.asServiceRole.entities.MintRecord.filter({ requestId: requests[0].requestId }, '-created_date', 1) : [];
      const latest = [manual[0], agent[0]].filter(Boolean).sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime())[0];
      return Response.json({ record: latest ? present(latest, true) : null });
    }
    const walletAddress = String(input.walletAddress || '').trim();
    if (!addressPattern.test(walletAddress)) return Response.json({ error: 'A valid wallet address is required.' }, { status: 400 });
    const records = await base44.asServiceRole.entities.MintRecord.filter({ destinationWallet: walletAddress }, '-created_date', 10);
    if (input.action === 'history') {
      return Response.json({ records: records.map(record => present(record)) });
    }
    if (input.action === 'retry') {
      const target = records.find(record => record.status === 'failed' && record.imageUri);
      if (!target) return Response.json({ error: 'No paused inscription is available to retry.' }, { status: 404 });
      const updated = await base44.asServiceRole.entities.MintRecord.update(target.id, { status: 'in_progress', errorMessage: '', processedAt: new Date().toISOString() });
      return Response.json({ record: present(updated) });
    }
    const active = records.find(record => record.status !== 'success');
    return Response.json({ record: active ? present(active) : null, latest: records[0] ? present(records[0]) : null });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to load inscription status.' }, { status: 500 });
  }
}