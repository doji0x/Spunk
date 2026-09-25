export default async function(req: Request): Promise<Response> {
  return Response.json({ error: 'Atomic V1 launches have been retired. Use the create-only pump.fun launch.', enabled: false }, { status: 410 });
}