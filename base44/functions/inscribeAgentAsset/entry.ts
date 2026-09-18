import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { Buffer } from 'node:buffer';
import { detectMp3Mime } from '../../shared/mediaMime.ts';
import { rpcRequest } from '../../shared/mintWallet.ts';
import { enforceRateLimit, secretsMatch, sha256 } from './guard.ts';

const chunkBytes = 800;
const allowedFields = new Set(['type', 'data', 'name', 'symbol', 'description']);

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

async function estimateCostSol(rpcUrl, size) {
  const sizes = [82, 679, 1024, size];
  const rents = await Promise.all(sizes.map(bytes => rpcRequest(rpcUrl, 'getMinimumBalanceForRentExemption', [bytes])));
  const chunks = Math.ceil(size / chunkBytes);
  const transactionFees = (6 + chunks * 2) * 5000;
  return (rents.reduce((sum, value) => sum + Number(value || 0), 0) + transactionFees) / 1_000_000_000;
}

export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const expectedKey = secrets.get('AGENT_INSCRIBE_API_KEY');
    const authorization = req.headers.get('authorization') || '';
    const receivedKey = req.headers.get('x-api-key') || (authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
    if (!await secretsMatch(receivedKey, expectedKey)) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
    const input = await req.json();
    if (!input || typeof input !== 'object' || Object.keys(input).some(key => !allowedFields.has(key))) return Response.json({ error: 'Only type, data, name, symbol, and description are accepted.' }, { status: 400 });
    if (input.type !== 'audio') return Response.json({ error: 'Only audio inscriptions are accepted.' }, { status: 400 });
    const maxBytes = boundedInteger(secrets.get('AUDIO_MAX_BYTES'), 262144, 1, 1024 * 1024);
    const maxEncoded = Math.ceil(maxBytes / 3) * 4;
    if (typeof input.data !== 'string' || input.data.length > maxEncoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.data)) return Response.json({ error: `Provide a base64 MP3 no larger than ${maxBytes} bytes.` }, { status: 400 });
    const bytes = Buffer.from(input.data, 'base64');
    if (!bytes.length || bytes.length > maxBytes || detectMp3Mime(bytes) !== 'audio/mpeg') return Response.json({ error: 'The payload is not a supported MP3 file.' }, { status: 400 });
    if (secrets.get('AUDIO_SUPPORTED_MIMES').split(',').map(value => value.trim()).filter(Boolean).join(',') !== 'audio/mpeg') return Response.json({ error: 'Audio inscription is not enabled.' }, { status: 503 });
    const name = String(input.name || '').trim();
    const symbol = String(input.symbol || '').trim().toUpperCase();
    const description = String(input.description || '').trim();
    if (!name || name.length > 32 || !symbol || symbol.length > 10 || !description || description.length > 1000) return Response.json({ error: 'Use a name up to 32 characters, symbol up to 10, and description up to 1,000.' }, { status: 400 });
    const cost = await estimateCostSol(secrets.get('SOLANA_RPC_URL'), bytes.length);
    const maxCost = Math.max(0, Number(secrets.get('AUDIO_MAX_COST_SOL')) || 0.1);
    if (cost > maxCost) return Response.json({ error: 'The estimated inscription cost exceeds the configured cap.' }, { status: 413 });
    const base44 = createClientFromRequest(req);
    const requestId = crypto.randomUUID();
    const credentialHash = await sha256(receivedKey);
    const perMinute = boundedInteger(secrets.get('AUDIO_RATE_PER_MINUTE'), 1, 1, 60);
    const perDay = boundedInteger(secrets.get('AUDIO_RATE_PER_DAY'), 10, 1, 100);
    const rate = await enforceRateLimit(base44, req, credentialHash, requestId, perMinute, perDay);
    if (rate.limited) return Response.json({ error: 'Rate limit exceeded.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfter) } });
    const upload = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file: new File([bytes], `${requestId}.mp3`, { type: 'audio/mpeg' }) });
    const response = await base44.functions.invoke('mintInscribedNft', {
      action: 'startBackground', agentRequest: true, internalAuthorization: secrets.get('INSCRIPTION_API_KEY'), requestId,
      name, symbol, details: description, totalSize: bytes.length, mimeType: 'audio/mpeg', sourceUri: upload.file_uri,
      firstChunk: bytes.subarray(0, chunkBytes).toString('base64')
    });
    if (response.data?.error || !response.data?.mint) {
      await base44.asServiceRole.entities.AgentInscriptionRequest.update(rate.record.id, { status: 'failed' });
      return Response.json({ error: response.data?.error || 'The inscription could not be queued.' }, { status: 502 });
    }
    await base44.asServiceRole.entities.AgentInscriptionRequest.update(rate.record.id, { status: 'queued' });
    return Response.json({ mint: response.data.mint, requestId, status: 'in_progress' }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to queue the audio inscription.' }, { status: 500 });
  }
}