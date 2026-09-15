import { heliusRpc, solanaRpc } from '../../shared/solanaServices.ts';
import { resolveIndexedMint, decodeMetadata, programAddress } from '../../shared/inscriptionMetadata.ts';
import { verifyInscription } from '../../shared/verifyInscription.ts';
import { libreplexProgramAddress, v3Discriminator, decodeLibreplexAccount, deriveLibreplexAccounts, verifyLibreplexMint } from '../../shared/verifyLibreplex.ts';
import bs58 from 'npm:bs58@6.0.0';
import { Buffer } from 'node:buffer';

function validKey(value) {
  return value === null || (typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(value));
}

export default async function(req: Request): Promise<Response> {
  try {
    const { cursor = null } = await req.json();
    if (cursor !== null && (typeof cursor !== 'object' || !validKey(cursor.metaplexKey ?? null) || !validKey(cursor.libreplexKey ?? null) || ![1, 2].includes(cursor.metaplexKind ?? 2))) return Response.json({ status: 'error', message: 'Invalid search cursor. Start a new search.' });
    const genesis = await solanaRpc('getGenesisHash', []);
    if (genesis !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d') return Response.json({ status: 'unknown', message: 'The private RPC must connect to Solana mainnet for this search.' });
    const kind = cursor?.metaplexKind || 2;
    const [metaplexPage, libreplexPage] = await Promise.all([
      heliusRpc('getProgramAccountsV2', [programAddress, { encoding: 'base64', commitment: 'finalized', limit: 100, dataSlice: { offset: 0, length: 4096 }, filters: [{ memcmp: { offset: 0, bytes: kind === 2 ? '3' : '2' } }], ...(cursor?.metaplexKey ? { paginationKey: cursor.metaplexKey } : {}) }]),
      heliusRpc('getProgramAccountsV2', [libreplexProgramAddress, { encoding: 'base64', commitment: 'finalized', limit: 100, dataSlice: { offset: 0, length: 512 }, filters: [{ memcmp: { offset: 0, bytes: bs58.encode(v3Discriminator) } }, { memcmp: { offset: 120, bytes: bs58.encode(Buffer.from('image/')) } }], ...(cursor?.libreplexKey ? { paginationKey: cursor.libreplexKey } : {}) }])
    ]);
    if (!Array.isArray(metaplexPage?.accounts) || !Array.isArray(libreplexPage?.accounts)) throw new Error('Helius did not return a supported discovery response.');

    const imageAccounts = metaplexPage.accounts.filter(({ account }) => decodeMetadata(account)?.associatedInscriptions.some(item => item.tag === 'image')).slice(0, 3);
    const metaplexCandidates = [...new Set((await Promise.all(imageAccounts.map(({ pubkey, account }) => resolveIndexedMint(pubkey, account)))).filter(Boolean))];
    const libreplexCandidates = [...new Set(libreplexPage.accounts.map(({ pubkey, account }) => {
      const decoded = decodeLibreplexAccount(account);
      if (!decoded?.contentType.toLowerCase().startsWith('image/')) return null;
      const derived = deriveLibreplexAccounts(decoded.root);
      return pubkey === derived.v3 || pubkey === derived.legacy ? decoded.root : null;
    }).filter(Boolean))].slice(0, 6);

    const [metaplexResults, libreplexResults] = await Promise.all([
      Promise.all(metaplexCandidates.slice(0, 3).map(verifyInscription)),
      Promise.all(libreplexCandidates.map(verifyLibreplexMint))
    ]);
    const results = [...libreplexResults, ...metaplexResults];
    const items = results.filter(result => result.status === 'valid').slice(0, 3).map(result => ({ mint: result.mint, name: result.indexer?.name || '', image: result.image, hash: result.hash, checkedAt: result.checkedAt, standard: result.standard.replace(' Inscription', '') }));
    const unverified = results.filter(result => result.status === 'unknown').length;

    let metaplexKind = kind;
    let metaplexKey = metaplexPage.paginationKey || null;
    if (!metaplexKey && kind === 2) { metaplexKind = 1; metaplexKey = null; }
    const hasMoreMetaplex = Boolean(metaplexPage.paginationKey) || kind === 2;
    const hasMoreLibreplex = Boolean(libreplexPage.paginationKey);
    const next = hasMoreMetaplex || hasMoreLibreplex ? { metaplexKind, metaplexKey, libreplexKey: libreplexPage.paginationKey || null } : null;
    return Response.json({ status: 'success', items, cursor: next, scanned: metaplexPage.accounts.length + libreplexPage.accounts.length, unverified });
  } catch (error) {
    return Response.json({ status: 'unknown', message: error.message || 'Unable to discover examples right now.' });
  }
}