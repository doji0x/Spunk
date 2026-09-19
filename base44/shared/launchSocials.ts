// Social links live off-chain: the on-chain metadata uri stays under Metaplex's 200-byte
// cap, so editing links after a launch is a plain record update with no transaction.
export function socialUrl(value, label) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length > 200) throw new Error(`${label} must be 200 characters or less.`);
  try { const url = new URL(text); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); return url.toString(); }
  catch { throw new Error(`Enter a valid ${label} URL.`); }
}

export function cleanSocials(source) {
  return { website: socialUrl(source?.website, 'website'), twitter: socialUrl(source?.twitter, 'X / Twitter'), github: socialUrl(source?.github, 'GitHub') };
}

export function readSocials(record) {
  const socials = record?.socials || {};
  return { website: socials.website || '', twitter: socials.twitter || '', github: socials.github || '' };
}

// A coin mint can belong to a public launch, an admin launch, or an Atomic V1 launch.
// `owner` is the wallet allowed to edit its links with a signature.
export async function findLaunch(entities, coinMint) {
  const [publicAttempt] = await entities.PublicLaunchAttempt.filter({ coinMint });
  if (publicAttempt) return { entity: 'PublicLaunchAttempt', record: publicAttempt, owner: publicAttempt.walletAddress, source: 'public' };
  const [adminAttempt] = await entities.LaunchAttempt.filter({ coinMint });
  if (adminAttempt) return { entity: 'LaunchAttempt', record: adminAttempt, owner: '', source: 'admin' };
  const [atomic] = await entities.AtomicV1Launch.filter({ coinMint });
  if (atomic) return { entity: 'AtomicV1Launch', record: atomic, owner: '', source: 'atomic_v1' };
  return null;
}