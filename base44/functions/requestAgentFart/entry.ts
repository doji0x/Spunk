import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';

const agentEndpoint = 'https://solvalidate.base44.app/functions/inscribeAgentAsset';

export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const input = await req.json().catch(() => ({}));
    if (input.confirm !== true) return Response.json({ error: 'Confirm the request to spend admin-wallet SOL.' }, { status: 400 });
    if (typeof input.data !== 'string' || !input.data) return Response.json({ error: 'Select an MP3 to send to the agent.' }, { status: 400 });
    // Forwarded to the real agent endpoint so the request passes the same audio-only,
    // rate, and cost guards an autonomous Fly Brain submission would.
    const response = await fetch(agentEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': secrets.get('AGENT_INSCRIBE_API_KEY') },
      body: JSON.stringify({ type: 'audio', data: input.data, name: String(input.name || '').trim(), symbol: String(input.symbol || '').trim().toUpperCase(), description: String(input.description || '').trim() })
    });
    const result = await response.json().catch(() => ({ error: 'The agent endpoint returned an unreadable response.' }));
    return Response.json(result, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to reach the agent endpoint.' }, { status: 500 });
  }
}