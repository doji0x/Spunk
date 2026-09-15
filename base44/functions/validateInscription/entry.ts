import { verifyAllInscriptions } from '../../shared/verifyAllInscriptions.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const { address } = await req.json();
    return Response.json(await verifyAllInscriptions(address));
  } catch {
    return Response.json({ status: 'error', message: 'Enter a valid Solana mint address or transaction signature.' });
  }
}