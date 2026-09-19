import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { assertMainnet } from '../../shared/mintWallet.ts';
import { cleanAtomicV1Input, atomicV1InputError, readAtomicV1Image, runAtomicV1Launch, confirmAtomicV1Launch } from '../../shared/atomicV1Launcher.ts';

export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const body = await req.json();
    const rpcUrl = secrets.get('SOLANA_RPC_URL');
    await assertMainnet(rpcUrl);

    if (body.action === 'confirm') {
      const [launch] = await base44.entities.AtomicV1Launch.filter({ requestId: String(body.requestId || '') });
      if (!launch) return Response.json({ error: 'Atomic V1 launch not found.' }, { status: 404 });
      return Response.json({ launch: await confirmAtomicV1Launch(base44.entities, rpcUrl, launch) });
    }
    if (!['size', 'launch'].includes(body.action)) return Response.json({ error: 'Invalid Atomic V1 action.' }, { status: 400 });

    const input = cleanAtomicV1Input(body);
    const inputError = atomicV1InputError(input);
    if (inputError) return Response.json({ error: inputError }, { status: 400 });
    const image = readAtomicV1Image(body.imageBase64);
    if (image.error) return Response.json({ error: image.error, imageBytes: image.imageBytesCount, maxImageBytes: image.maxImageBytes }, { status: image.status });

    const outcome = await runAtomicV1Launch({ entities: base44.entities, rpcUrl, body, input, imageBytes: image.imageBytes, imageMime: image.imageMime, ownerId: user.id, action: body.action });
    if (outcome.error) return Response.json({ error: outcome.error, size: outcome.size, logs: outcome.logs }, { status: outcome.status });
    return Response.json(outcome);
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to complete the Atomic V1 launch.' }, { status: 500 });
  }
}