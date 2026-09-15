import { heliusRpc, solanaRpc } from '../../shared/solanaServices.ts';
import { resolveIndexedMint, decodeMetadata, programAddress } from '../../shared/inscriptionMetadata.ts';
import { verifyInscription } from '../../shared/verifyInscription.ts';

export default async function(req) {
  try {
    const { cursor = null } = await req.json();
    if (cursor !== null && (typeof cursor !== 'object' || ![1, 2].includes(cursor.kind) || (cursor.key !== null && (typeof cursor.key !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(cursor.key))))) return Response.json({ status: 'error', message: 'Invalid search cursor. Start a new search.' });
    const genesis = await solanaRpc('getGenesisHash', []);
    if (genesis !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d') return Response.json({ status: 'unknown', message: 'The private RPC must connect to Solana mainnet for this search.' });
    const kind = cursor?.kind || 2;
    const page = await heliusRpc('getProgramAccountsV2', [programAddress, { encoding: 'base64', commitment: 'finalized', limit: 100, dataSlice: { offset: 0, length: 4096 }, filters: [{ memcmp: { offset: 0, bytes: kind === 2 ? '3' : '2' } }], ...(cursor?.key ? { paginationKey: cursor.key } : {}) }]);
    if (!Array.isArray(page?.accounts)) throw new Error('Helius did not return a supported discovery response.');
    const imageAccounts = page.accounts.filter(({ account }) => decodeMetadata(account)?.associatedInscriptions.some(a => a.tag === 'image')).slice(0, 3);
    const candidates = [...new Set((await Promise.all(imageAccounts.map(({ pubkey, account }) => resolveIndexedMint(pubkey, account)))).filter(Boolean))];
    const items = [];
    let unverified = 0;
    for (let i = 0; i < candidates.length; i += 3) {
      const batch = await Promise.all(candidates.slice(i, i + 3).map(verifyInscription));
      for (const result of batch) {
        if (result.status === 'valid' && items.length < 3) items.push({ mint: result.mint, name: result.indexer?.name || '', image: result.image, hash: result.hash, checkedAt: result.checkedAt });
        else if (result.status === 'unknown') unverified++;
      }
      if (items.length >= 3) break;
    }
    const next = page.paginationKey ? { kind, key: page.paginationKey } : kind === 2 ? { kind: 1, key: null } : null;
    return Response.json({ status: 'success', items, cursor: next, scanned: page.accounts.length, unverified });
  } catch (error) {
    return Response.json({ status: 'unknown', message: error.message || 'Unable to discover examples right now.' });
  }
}