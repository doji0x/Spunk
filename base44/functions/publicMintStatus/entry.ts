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
    totalSize: record.totalSize || 0,
    offset: record.offset || 0,
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
    if (input.action === 'latestAgent') {
      const requests = await base44.asServiceRole.entities.AgentInscriptionRequest.filter({ status: 'queued' }, '-created_date', 10);
      const latestRequest = requests[0];
      if (!latestRequest) return Response.json({ record: null });
      const records = await base44.asServiceRole.entities.MintRecord.filter({ requestId: latestRequest.requestId }, '-created_date', 1);
      return Response.json({ record: records[0] ? present(records[0], true) : null });
    }
    const walletAddress = String(input.walletAddress || '').trim();
    if (!addressPattern.test(walletAddress)) return Response.json({ error: 'A valid wallet address is required.' }, { status: 400 });
    const records = await base44.asServiceRole.entities.MintRecord.filter({ destinationWallet: walletAddress }, '-created_date', 10);
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