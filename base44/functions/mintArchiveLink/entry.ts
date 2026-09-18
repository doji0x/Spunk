import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const input = await req.json().catch(() => ({}));
    const recordId = String(input.recordId || '').trim();
    if (!recordId || recordId.length > 64) return Response.json({ error: 'A mint record is required.' }, { status: 400 });
    const record = await base44.asServiceRole.entities.MintRecord.get(recordId).catch(() => null);
    const fileUri = record?.archivedImageUri || record?.imageUri;
    if (!fileUri) return Response.json({ error: 'No archived source image is stored for this mint.' }, { status: 404 });
    const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri, expires_in: 300 });
    return Response.json({ signed_url: signed.signed_url, archived: Boolean(record.archivedImageUri) });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to create the archive link.' }, { status: 500 });
  }
}