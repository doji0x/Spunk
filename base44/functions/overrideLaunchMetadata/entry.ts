import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { findLaunch } from '../../shared/launchSocials.ts';
import { cleanOverride, overrideFields, activeOverride, deactivateOverrides } from '../../shared/launchMetadataOverride.ts';

const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const publicRecord = record => record && ({ id: record.id, action: record.action, isActive: record.isActive, name: record.name || '', symbol: record.symbol || '', description: record.description || '', imageUrl: record.imageUrl || '', imageMime: record.imageMime || '', previousValues: record.previousValues || {}, adminEmail: record.adminEmail || '', created_date: record.created_date });

// Admin-only: changes what the metadata endpoint serves, never the chain.
export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const entities = base44.asServiceRole.entities;
    const body = await req.json();
    const coinMint = String(body.coinMint || '').trim();
    if (!addressPattern.test(coinMint)) return Response.json({ error: 'Enter a valid coin mint address.' }, { status: 400 });

    const found = await findLaunch(entities, coinMint);
    if (!found) return Response.json({ error: 'No launch was found for that coin mint.' }, { status: 404 });
    const inscribedMint = found.record.inscribedMint || '';
    if (!inscribedMint) return Response.json({ error: 'Only inscribed launches can have their served metadata overridden.' }, { status: 422 });
    const history = await entities.LaunchMetadataOverride.filter({ coinMint }, '-created_date', 50);

    if (body.action === 'list') return Response.json({ coinMint, history: history.map(publicRecord) });

    if (body.action === 'lookup') {
      const active = history.find(record => record.isActive && record.action === 'set') || null;
      return Response.json({ coinMint, inscribedMint, source: found.source, status: found.record.status, inscribed: { name: found.record.name || '', symbol: found.record.symbol || '' }, override: publicRecord(active), history: history.map(publicRecord) });
    }

    if (body.action === 'clear') {
      const previous = await deactivateOverrides(entities, coinMint);
      if (!previous) return Response.json({ error: 'There is no active override to clear.' }, { status: 409 });
      await entities.LaunchMetadataOverride.create({ inscribedMint, coinMint, action: 'clear', isActive: false, previousValues: overrideFields(previous), adminEmail: user.email || '' });
      const refreshed = await entities.LaunchMetadataOverride.filter({ coinMint }, '-created_date', 50);
      return Response.json({ coinMint, override: null, history: refreshed.map(publicRecord) });
    }

    if (body.action !== 'set') return Response.json({ error: 'Invalid metadata override action.' }, { status: 400 });
    let fields;
    try { fields = cleanOverride(body); } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
    if (!Object.keys(overrideFields(fields)).length) return Response.json({ error: 'Fill in at least one field to override.' }, { status: 400 });
    const previous = await deactivateOverrides(entities, coinMint);
    const created = await entities.LaunchMetadataOverride.create({ inscribedMint, coinMint, ...fields, action: 'set', isActive: true, previousValues: previous ? overrideFields(previous) : { name: found.record.name || '', symbol: found.record.symbol || '' }, adminEmail: user.email || '' });
    const refreshed = await entities.LaunchMetadataOverride.filter({ coinMint }, '-created_date', 50);
    return Response.json({ coinMint, override: publicRecord(created), history: refreshed.map(publicRecord) });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to update the served metadata.' }, { status: 500 });
  }
}