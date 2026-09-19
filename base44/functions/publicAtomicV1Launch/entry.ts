import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { assertMainnet } from '../../shared/mintWallet.ts';
import { cleanAtomicV1Input, atomicV1InputError, readAtomicV1Image, runAtomicV1Launch, confirmAtomicV1Launch, addressPattern } from '../../shared/atomicV1Launcher.ts';

// Public Atomic V1 launches: anyone with a connected Phantom wallet can create a coin whose
// image bytes live inside the launch transaction. Phantom cannot sign version-1 transactions,
// so the app's launch wallet signs and pays, and the requesting wallet is recorded on the launch.
export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const rpcUrl = secrets.get('SOLANA_RPC_URL');
    await assertMainnet(rpcUrl);
    const entities = base44.asServiceRole.entities;

    if (body.action === 'confirm') {
      const [launch] = await entities.AtomicV1Launch.filter({ requestId: String(body.requestId || '') });
      if (!launch) return Response.json({ error: 'Atomic V1 launch not found.' }, { status: 404 });
      return Response.json({ launch: await confirmAtomicV1Launch(entities, rpcUrl, launch) });
    }
    if (!['size', 'launch'].includes(body.action)) return Response.json({ error: 'Invalid Atomic V1 action.' }, { status: 400 });

    const walletAddress = String(body.walletAddress || '');
    if (!addressPattern.test(walletAddress)) return Response.json({ error: 'Connect a Solana wallet before launching.' }, { status: 400 });
    // Public launches are create-only: the app wallet pays, so a first buy would credit the wrong wallet.
    const input = { ...cleanAtomicV1Input(body), firstBuyAmount: '' };
    const inputError = atomicV1InputError(input);
    if (inputError) return Response.json({ error: inputError }, { status: 400 });
    const image = readAtomicV1Image(body.imageBase64);
    if (image.error) return Response.json({ error: image.error, imageBytes: image.imageBytesCount, maxImageBytes: image.maxImageBytes }, { status: image.status });

    if (body.action === 'launch') {
      const recent = await entities.AtomicV1Launch.filter({ walletAddress });
      const lastHour = recent.filter(launch => Date.now() - new Date(launch.created_date).getTime() < 3_600_000);
      if (lastHour.length >= 3) return Response.json({ error: 'You have reached the limit of 3 atomic V1 launches per hour. Try again later.' }, { status: 429 });
    }

    const outcome = await runAtomicV1Launch({ entities, rpcUrl, body, input, imageBytes: image.imageBytes, imageMime: image.imageMime, ownerId: walletAddress, action: body.action, creatorAddress: walletAddress, extraRecord: { walletAddress } });
    if (outcome.error) return Response.json({ error: outcome.error, size: outcome.size }, { status: outcome.status });
    return Response.json({ launch: outcome.launch, size: outcome.size });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to complete the Atomic V1 launch.' }, { status: 500 });
  }
}