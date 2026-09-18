import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { pofPayload, pofEstimate } from './payload.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const input = await req.json().catch(() => ({}));
    if (!['quote', 'submit'].includes(input.action)) return Response.json({ error: 'Choose quote or submit. No inscription was created.' }, { status: 400 });
    let payload;
    try { payload = await pofPayload(input); } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
    const { name, symbol, description, destinationWallet, source, cover, submissionHash } = payload;
    if (input.action === 'quote') {
      const quote = await pofEstimate(secrets.get('SOLANA_RPC_URL'), [source.bytes.length, ...(cover ? [cover.bytes.length] : [])]);
      return Response.json({ ...quote, mediaMime: source.mime, hasCover: Boolean(cover), submissionHash }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (input.confirm !== true) return Response.json({ error: 'Confirm the real inscription to spend admin-wallet SOL.' }, { status: 400 });
    if (!/^[0-9a-f-]{36}$/i.test(input.requestId || '')) return Response.json({ error: 'A recovery identifier is required.' }, { status: 400 });
    if (input.quoteHash !== submissionHash) return Response.json({ error: 'Review a new estimate after changing the form.' }, { status: 400 });
    const saved = (await base44.entities.MintRecord.filter({ requestId: input.requestId }))[0];
    if (saved) {
      if (!saved.pof || saved.submissionHash !== submissionHash) return Response.json({ error: 'This recovery identifier belongs to a different submission.' }, { status: 409 });
      return Response.json({ mint: saved.mint, requestId: saved.requestId, recordId: saved.id, status: saved.status });
    }
    const upload = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file: new File([source.bytes], `${input.requestId}-media`, { type: source.mime }) });
    const sourceUri = String(upload?.file_uri || '').trim();
    if (!sourceUri.startsWith('mp/private/')) throw new Error('The uploaded media did not return a valid private source reference.');
    const coverUpload = cover ? await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file: new File([cover.bytes], `${input.requestId}-cover`, { type: cover.mime }) }) : null;
    const coverSourceUri = String(coverUpload?.file_uri || '').trim();
    if (cover && !coverSourceUri.startsWith('mp/private/')) throw new Error('The uploaded cover did not return a valid private source reference.');
    const result = await base44.functions.invoke('mintInscribedNft', {
      action: 'startBackground', deferPreparation: true, requestId: input.requestId, name, symbol, details: description,
      totalSize: source.bytes.length, mimeType: source.mime, sourceUri, destinationWallet, submissionHash,
      coverSourceUri, coverSize: cover?.bytes.length || 0, coverMime: cover?.mime || ''
    });
    if (result.data?.error || !result.data?.job?.id) throw new Error(result.data?.error || 'The inscription could not be queued.');
    return Response.json({ mint: result.data.mint, requestId: input.requestId, recordId: result.data.job.id, status: result.data.job.status }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    // Do not return a request/config object: it can contain the server-only credential.
    const response = error.response?.data;
    return Response.json({ error: typeof response?.error === 'string' ? response.error : error.message || 'Unable to submit the POF inscription.' }, { status: 500 });
  }
}