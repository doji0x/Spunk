import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { settleAttempt } from '../../shared/pumpLaunch.ts';

// Scheduled: resolves every pending launch against the chain and records the outcome.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const rpcUrl = secrets.get('SOLANA_RPC_URL');
    const pending = await base44.asServiceRole.entities.LaunchAttempt.filter({ status: 'pending' }, '-created_date', 50);
    const results = [];
    for (const attempt of pending) {
      const settled = await settleAttempt(rpcUrl, attempt);
      if (settled.status !== attempt.status) await base44.asServiceRole.entities.LaunchAttempt.update(attempt.id, { ...settled, checkedAt: new Date().toISOString() });
      results.push({ coinMint: attempt.coinMint, status: settled.status });
    }
    return Response.json({ checked: results.length, results });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to confirm launches.' }, { status: 500 });
  }
}