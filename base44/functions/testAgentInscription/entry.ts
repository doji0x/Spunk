import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { sampleMp3 } from './sample.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const input = await req.json().catch(() => ({}));
    if (input.confirm !== true) return Response.json({ error: 'Confirm the real inscription to spend admin-wallet SOL.' }, { status: 400 });
    const key = secrets.get('AGENT_INSCRIBE_API_KEY');
    if (!key) return Response.json({ error: 'The agent credential is not configured.' }, { status: 503 });
    const result = await base44.functions.fetch('/inscribeAgentAsset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ type: 'audio', data: sampleMp3, name: 'Proof of Fart Test', symbol: 'POFTEST', description: 'Admin-triggered pipeline test: a tiny synthetic MP3 sound inscribed through the Fly Brain agent endpoint. Not an autonomous agent submission.' })
    });
    const text = await result.text();
    let response;
    try { response = JSON.parse(text); } catch { response = { error: text || 'The agent endpoint returned an empty response.' }; }
    return Response.json({ httpStatus: result.status, response }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    // Do not return a request/config object: it can contain the server-only credential.
    const response = error.response?.data;
    return Response.json({ httpStatus: error.response?.status || 500, response: { error: typeof response?.error === 'string' ? response.error : error.message || 'Unable to submit the test inscription.' } }, { status: 500 });
  }
}