const encoder = new TextEncoder();

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function secretsMatch(received, expected) {
  if (!received || !expected) return false;
  const [left, right] = await Promise.all([sha256(received), sha256(expected)]);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
}

export async function enforceRateLimit(base44, req, credentialHash, requestId, perMinute, perDay) {
  const sourceIp = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ipHash = await sha256(sourceIp);
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const [credentialMinute, ipMinute, credentialDay] = await Promise.all([
    base44.asServiceRole.entities.AgentInscriptionRequest.filter({ credentialHash, created_date: { $gte: minuteAgo } }, '-created_date', perMinute + 1),
    base44.asServiceRole.entities.AgentInscriptionRequest.filter({ ipHash, created_date: { $gte: minuteAgo } }, '-created_date', perMinute + 1),
    base44.asServiceRole.entities.AgentInscriptionRequest.filter({ credentialHash, created_date: { $gte: dayAgo } }, '-created_date', perDay + 1)
  ]);
  if (credentialMinute.length >= perMinute || ipMinute.length >= perMinute) return { limited: true, retryAfter: 60 };
  if (credentialDay.length >= perDay) return { limited: true, retryAfter: 86400 };
  const record = await base44.asServiceRole.entities.AgentInscriptionRequest.create({ credentialHash, ipHash, requestId, status: 'accepted' });
  return { limited: false, record };
}