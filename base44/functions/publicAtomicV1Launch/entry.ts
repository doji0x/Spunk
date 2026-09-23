import { createClientFromRequest } from 'npm:@base44/sdk@0.8.50';
import { secrets } from 'base44:runtime';
import { assertMainnet } from '../../shared/mintWallet.ts';
import { confirmAtomicV1Launch } from '../../shared/atomicV1Launcher.ts';
import { createUserAtomicV1Service, nativeConfig } from '../../shared/atomicV1UserLaunch.ts';
import { publicLaunch } from '../../shared/atomicV1NativeState.js';
import { base58Decode } from '../../shared/atomicV1Protocol.js';

export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const text = await req.text();
    if (text.length > 35000) return Response.json({ error: 'Request is too large.' }, { status: 413 });
    const body = JSON.parse(text), config = nativeConfig(secrets);
    if (body.action === 'config') return Response.json(config);
    const entities = base44.asServiceRole.entities;
    if (body.action === 'history') {
      const walletAddress = String(body.walletAddress || ''); base58Decode(walletAddress);
      const rows = await entities.AtomicV1Launch.filter({ walletAddress }, '-created_date', 100);
      return Response.json({ launches: rows.filter(row => row.nativeProtocol === 2 ? row.verifiedPayer || row.atomicV1Verified : row.transactionSignature).slice(0, 50).map(publicLaunch) });
    }
    const rpcUrl = secrets.get('SOLANA_RPC_URL');
    await assertMainnet(rpcUrl);
    // Existing launches remain readable. No legacy prepare/submit path is exposed.
    if (body.action === 'confirm' && !body.id) {
      const [launch] = await entities.AtomicV1Launch.filter({ requestId: String(body.requestId || '') });
      if (!launch || launch.nativeProtocol === 2) return Response.json({ error: 'Use the saved native launch recovery record.' }, { status: 404 });
      return Response.json({ launch: publicLaunch(await confirmAtomicV1Launch(entities, rpcUrl, launch)) });
    }
    return Response.json(await createUserAtomicV1Service(entities, rpcUrl).action(body, config));
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to complete the atomic launch.' }, { status: error.status || (error instanceof SyntaxError ? 400 : 500) });
  }
}
