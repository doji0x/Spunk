const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function parseRecipients(value, holderReward) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) throw new Error('Use no more than 10 fee recipients.');
  if (holderReward && value.length) throw new Error('Choose either holder rewards or a custom creator-fee split, not both.');
  const recipients = value.map(item => ({ type: item.type, value: String(item.value || '').trim(), shareBps: Number(item.shareBps) }));
  if (recipients.length && recipients.reduce((sum, item) => sum + item.shareBps, 0) !== 10000) throw new Error('Fee recipient shares must total exactly 100%.');
  const seen = new Set();
  for (const item of recipients) {
    if (!Number.isInteger(item.shareBps) || item.shareBps < 1 || item.shareBps > 10000) throw new Error('Every fee recipient needs a positive share.');
    if (item.type === 'creator') item.value = 'Creator';
    if (item.type === 'wallet' && !addressPattern.test(item.value)) throw new Error('Enter a valid Solana wallet recipient.');
    if (item.type === 'github' && !/^\d{1,20}$/.test(item.value)) throw new Error('GitHub recipients require a numeric GitHub user ID.');
    if (!['creator', 'wallet', 'github'].includes(item.type) || seen.has(`${item.type}:${item.value}`)) throw new Error('Fee recipients must be unique creator, wallet, or GitHub recipients.');
    seen.add(`${item.type}:${item.value}`);
  }
  return recipients;
}