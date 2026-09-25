// Off-chain served overrides: the metadata endpoint serves these instead of the inscribed
// values. The on-chain inscription is never touched, so VALIDATE's verifier still reports
// the inscribed truth — every change here is recorded as an audit row instead.
const overrideKeys = ['name', 'symbol', 'description', 'imageUrl', 'imageMime'];

function imageUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length > 300) throw new Error('The image URL must be 300 characters or less.');
  try { const url = new URL(text); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); return url.toString(); }
  catch { throw new Error('Enter a valid image URL.'); }
}

export function cleanOverride(source) {
  const text = (key, limit) => String(source?.[key] ?? '').trim().slice(0, limit);
  const mime = text('imageMime', 50);
  if (mime && !/^image\/[a-z0-9.+-]{1,20}$/.test(mime)) throw new Error('Enter a valid image type, for example image/png.');
  const fields = { name: text('name', 32), symbol: text('symbol', 10), description: text('description', 1000), imageUrl: imageUrl(source?.imageUrl), imageMime: mime };
  if (fields.imageMime && !fields.imageUrl) throw new Error('Add an image URL before setting an image type.');
  return fields;
}

// Only non-empty fields override; anything left blank keeps serving the inscribed value.
export function overrideFields(record) {
  const fields = {};
  for (const key of overrideKeys) if (record?.[key]) fields[key] = record[key];
  return fields;
}

export async function activeOverride(entities, inscribedMint, coinMint) {
  if (coinMint) {
    const [byCoin] = await entities.LaunchMetadataOverride.filter({ coinMint, isActive: true }, '-created_date', 1);
    if (byCoin) return byCoin;
  }
  if (!inscribedMint) return null;
  // Creator edits are coin-specific; never inherit another coin creator's override.
  const [byMint] = await entities.LaunchMetadataOverride.filter({ inscribedMint, isActive: true, $or: [{ actorWallet: { $exists: false } }, { actorWallet: '' }] });
  return byMint || null;
}

export async function deactivateOverrides(entities, coinMint) {
  const records = await entities.LaunchMetadataOverride.filter({ coinMint, isActive: true });
  for (const record of records) await entities.LaunchMetadataOverride.update(record.id, { isActive: false });
  return records[0] || null;
}