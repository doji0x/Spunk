import { verifyInscription } from '../../shared/verifyInscription.ts';

export default async function(req) {
  try {
    const { address } = await req.json();
    return Response.json(await verifyInscription(address));
  } catch {
    return Response.json({ status: 'error', message: 'Enter a valid Solana mint address or transaction signature.' });
  }
}