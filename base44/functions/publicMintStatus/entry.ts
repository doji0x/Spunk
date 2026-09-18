import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function present(record) {
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
    imageHash: record.imageHash || '',
    destinationWallet: record.destinationWallet || '',
    updatedAt: record.processedAt || record.updated_date
  };
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const input = await req.json().catch(() => ({}));
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