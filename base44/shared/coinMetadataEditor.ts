import { findLaunch, readSocials, cleanSocials } from './launchSocials.ts';
import { activeOverride, overrideFields } from './launchMetadataOverride.ts';
import { solanaRpc } from './solanaServices.ts';
import { derive, decodeMetadata, inscriptionTag, programAddress } from './inscriptionMetadata.ts';
import { inscribedFields } from './inscribedFields.ts';
import { imageUri } from './pumpLaunch.ts';

export const coinAddressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function editorError(message, status = 400) { return Object.assign(new Error(message), { status }); }
const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export async function loadCoinEditor(entities, coinMint) {
  if (!coinAddressPattern.test(coinMint)) throw editorError('Enter a valid coin mint address.');
  const found = await findLaunch(entities, coinMint);
  if (!found) throw editorError('No launch was found for that coin mint.', 404);
  const row = found.record;
  const unsupportedReason = found.source !== 'public' || !found.owner
    ? 'This launch is not eligible for self-serve wallet editing.'
    : row.launchMode === 'normal' || !row.inscribedMint
      ? 'This coin was launched with a static metadata file. Changes here cannot update its on-chain URI, so editing is unavailable. No changes have been saved.' : '';
  const editable = row.status === 'confirmed' && !unsupportedReason;
  let original = { name: row.name || '', symbol: row.symbol || '', imageUrl: row.imageUrl || '', imageMime: 'image/png' }, active = null;
  if (editable) {
    const root = derive(row.inscribedMint), key = derive(root);
    const { value: [rootAccount, metaAccount] } = await solanaRpc('getMultipleAccounts', [[root, key], { encoding: 'base64', commitment: 'confirmed' }]);
    const metadata = decodeMetadata(metaAccount), tag = inscriptionTag(metadata);
    if (!rootAccount || rootAccount.owner !== programAddress || rootAccount.executable || rootAccount.space > 65536 || !metadata || metadata.inscriptionAccount !== root || !tag) throw editorError('The original inscription could not be read. Try again later.', 422);
    const fields = await inscribedFields(rootAccount, root, tag === 'image');
    const hasImage = tag !== 'audio' || metadata.associatedInscriptions?.some(entry => entry.tag === 'cover');
    original = { name: fields.name, symbol: fields.symbol, imageUrl: hasImage ? imageUri(row.inscribedMint) : '', imageMime: imageTypes.includes(fields.mediaMime) ? fields.mediaMime : 'image/png' };
    active = await activeOverride(entities, row.inscribedMint, coinMint);
  }
  const applied = overrideFields(active);
  const view = { coinMint, ownerWallet: found.owner || '', source: found.source, status: row.status, editable, unsupportedReason,
    name: applied.name || original.name, symbol: applied.symbol || original.symbol,
    imageUrl: applied.imageUrl || original.imageUrl, imageMime: applied.imageMime || original.imageMime,
    socials: readSocials(row), hasOverride: Boolean(applied.name || applied.imageUrl),
    revision: JSON.stringify([row.updated_date, active?.id || '', active?.updated_date || '']) };
  return { found, active, original, view };
}

export function cleanCreatorMetadata(data) {
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name || new TextEncoder().encode(name).length > 32) throw editorError('Enter a coin name of at most 32 UTF-8 bytes.');
  const imageUrl = typeof data.imageUrl === 'string' ? data.imageUrl.trim() : '';
  let imageMime = '';
  if (imageUrl) {
    if (imageUrl.length > 2048) throw editorError('Image URLs must be at most 2,048 characters.');
    let parsed;
    try { parsed = new URL(imageUrl); } catch { throw editorError('Enter a valid image URL.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw editorError('Image URLs must use HTTP or HTTPS without credentials.');
    const extension = parsed.pathname.split('.').pop().toLowerCase();
    imageMime = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' })[extension] || data.imageMime;
    if (!imageTypes.includes(imageMime)) throw editorError('Choose PNG, JPG, WebP or GIF as the image type.');
  }
  let socials;
  try { socials = cleanSocials(data); } catch (error) { throw editorError(error.message); }
  return { name, imageUrl, imageMime, socials };
}

export async function saveCoinEditor(entities, state, fields, walletAddress, cleared) {
  const { found, active, original, view } = state;
  const prior = overrideFields(active);
  // Keep admin-set symbol/description; this surface cannot edit or clear either.
  const retained = Object.fromEntries(['symbol', 'description'].filter(key => prior[key]).map(key => [key, prior[key]]));
  const changes = cleared ? retained : { ...prior, name: fields.name, ...(fields.imageUrl ? { imageUrl: fields.imageUrl, imageMime: fields.imageMime } : {}) };
  const records = await entities.LaunchMetadataOverride.filter({ coinMint: view.coinMint, isActive: true });
  const created = await entities.LaunchMetadataOverride.create({ inscribedMint: found.record.inscribedMint, coinMint: view.coinMint,
    ...changes, action: cleared ? 'clear' : 'set', isActive: false, actorWallet: walletAddress,
    previousValues: { ...prior, name: view.name, imageUrl: view.imageUrl, imageMime: view.imageMime } });
  let updated = found.record;
  if (!cleared) updated = await entities.PublicLaunchAttempt.update(found.record.id, { socials: fields.socials });
  // Retain a clear marker so another coin's inscription-level override cannot reappear.
  await entities.LaunchMetadataOverride.update(created.id, { isActive: true });
  for (const row of records) await entities.LaunchMetadataOverride.update(row.id, { isActive: false });
  const saved = await entities.LaunchMetadataOverride.get(created.id);
  return { ...view, name: cleared ? original.name : fields.name,
    imageUrl: cleared ? original.imageUrl : fields.imageUrl || view.imageUrl,
    imageMime: cleared ? original.imageMime : fields.imageMime || view.imageMime,
    socials: cleared ? view.socials : fields.socials, hasOverride: !cleared,
    revision: JSON.stringify([updated.updated_date, saved.id, saved.updated_date]), cleared };
}