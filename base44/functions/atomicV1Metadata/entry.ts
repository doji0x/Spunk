import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

const headers = { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=600' };
export default async function(req: Request): Promise<Response> {
  try {
    const mint = (new URL(req.url).searchParams.get('mint') || '').trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return Response.json({ error: 'Invalid mint.' }, { status: 400, headers });
    const base44 = createClientFromRequest(req);
    const rows = await base44.asServiceRole.entities.AtomicV1Launch.filter({ coinMint: mint }, '-created_date', 100);
    // A mint-authorized preview is not an on-chain verification claim. Never
    // allow a preview to replace metadata from a verified finalized launch.
    const launch = rows.find(row => row.status === 'confirmed' && row.atomicV1Verified) ||
      rows.find(row => row.nativeProtocol === 2 && row.metadataAuthorized && ['prepared', 'submitting', 'unknown', 'pending'].includes(row.status)) ||
      rows.find(row => row.nativeProtocol !== 2 && !row.walletAddress);
    if (!launch) return Response.json({ error: 'Atomic V1 launch metadata is not ready.' }, { status: 404, headers: { ...headers, 'cache-control': 'no-store' } });
    const socials = Object.fromEntries(Object.entries({ website: launch.socials?.website || '', twitter: launch.socials?.twitter || '', github: launch.socials?.github || '' }).filter(([, value]) => value));
    return Response.json({ ...socials, name: launch.name, symbol: launch.symbol, description: launch.description || 'Atomic VALIDATE-v1 image launch on Pump.fun.', image: launch.imageUrl, showName: true, createdOn: 'https://pump.fun', properties: { category: 'image', files: [{ uri: launch.imageUrl, type: launch.imageMime }] } }, { headers: launch.atomicV1Verified ? headers : { ...headers, 'cache-control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to serve Atomic V1 metadata.' }, { status: 500, headers: { ...headers, 'cache-control': 'no-store' } });
  }
}
