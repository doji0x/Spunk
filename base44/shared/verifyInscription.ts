import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { solanaRpc, indexedAsset } from './solanaServices.ts';
import { programAddress, derive, linkedMint, resolveIndexedMint, decodeMetadata, associatedAddress, inscriptionTag } from './inscriptionMetadata.ts';
import { isCompleteImage } from './imageMime.ts';
import { detectMediaMime, mediaTypeForMime } from './mediaMime.ts';

export async function verifyInscription(address) {
  try {
    if (typeof address !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(address)) return { status: 'error', message: 'Enter a valid Solana mint address or transaction signature.' };
    const tokenPrograms = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];
    const getAccounts = async (keys, sliced = false) => keys.length ? (await solanaRpc('getMultipleAccounts', [keys, { encoding: 'base64', commitment: 'finalized', ...(sliced ? { dataSlice: { offset: 0, length: 166 } } : {}) }])).value : [];
    let candidates = [address];
    let transaction = null;
    if (address.length > 44) {
      transaction = await solanaRpc('getTransaction', [address, { encoding: 'jsonParsed', commitment: 'finalized', maxSupportedTransactionVersion: 1 }]);
      if (!transaction) return { status: 'unknown', message: 'Transaction not found on Solana mainnet. It may be unfinalized or unavailable from this node.' };
      if (transaction.meta?.err) return { status: 'invalid', reason: 'This transaction failed and did not commit an inscription.' };
      candidates = [...new Set(transaction.transaction.message.accountKeys.map(k => typeof k === 'string' ? k : k.pubkey))];
      if (candidates.length > 100) return { status: 'unknown', message: 'This transaction contains too many accounts for a single check. Paste its token mint address instead.' };
    } else {
      try { new PublicKey(address); } catch { return { status: 'error', message: 'This is not a valid Solana address.' }; }
    }
    const heads = await getAccounts(candidates, true);
    const isMint = a => {
      if (!a || a.executable || !tokenPrograms.includes(a.owner)) return false;
      const bytes = Buffer.from(a.data[0], 'base64');
      return bytes.length >= 82 && bytes[45] === 1 && (a.space === 82 || (bytes.length > 165 && bytes[165] === 1));
    };
    let mints = candidates.filter((key, i) => isMint(heads[i]));
    if (transaction) {
      const linkedKeys = candidates.filter((key, i) => {
        const a = heads[i];
        return a && !a.executable && a.owner === programAddress && a.space <= 65536 && [1, 2].includes(Buffer.from(a.data[0], 'base64')[0]);
      });
      if (linkedKeys.length > 20) return { status: 'unknown', message: 'This transaction includes many inscriptions. Paste the specific token mint address instead.' };
      const accounts = await getAccounts(linkedKeys);
      let discovered = linkedKeys.map((key, i) => linkedMint(key, accounts[i])).filter(Boolean);
      if (!mints.length && !discovered.length) {
        if (linkedKeys.length > 3) return { status: 'unknown', message: 'This transaction references several older inscriptions. Paste a specific mint address instead.' };
        discovered = (await Promise.all(linkedKeys.map((key, i) => resolveIndexedMint(key, accounts[i])))).filter(Boolean);
      }
      const extra = [...new Set(discovered)].filter(m => !mints.includes(m));
      const extraHeads = await getAccounts(extra, true);
      mints = [...mints, ...extra.filter((m, i) => isMint(extraHeads[i]))];
    }
    if (mints.length > 20) return { status: 'unknown', message: 'Several tokens are involved. Paste the specific token mint address to verify it.' };
    const roots = mints.map(derive);
    const metadataKeys = roots.map(derive);
    const metadataAccounts = await getAccounts(metadataKeys);
    const findings = [];
    for (let i = 0; i < mints.length; i++) {
      const metadata = decodeMetadata(metadataAccounts[i]);
      if (!metadata || metadata.inscriptionAccount !== roots[i]) continue;
      // Earlier mint inscriptions omit the optional mint field. Their canonical mint-derived PDAs still prove linkage.
      if (metadata.mint?.__option === 'Some' ? metadata.mint.value !== mints[i] : metadata.key !== 2) continue;
      const tag = inscriptionTag(metadata);
      if (!tag) continue;
      findings.push({ mint: mints[i], root: roots[i], metadata: metadataKeys[i], tag, imageAccount: associatedAddress(metadataKeys[i], tag), immutable: metadata.updateAuthorities.length === 0, updateAuthorities: metadata.updateAuthorities.map(a => a.toString()) });
    }
    if (!findings.length) return { status: 'invalid', reason: 'No token-linked media inscription was found under the supported Metaplex standard. Other inscription protocols are not checked.' };
    if (findings.length > 1) return { status: 'unknown', message: 'This transaction includes more than one inscribed token. Paste the specific token mint address to choose which asset to verify.' };
    const found = findings[0];
    const [rootHead, imageHead] = await getAccounts([found.root, found.imageAccount], true);
    if (!rootHead || !imageHead || rootHead.owner !== programAddress || imageHead.owner !== programAddress || rootHead.executable || imageHead.executable) return { status: 'invalid', reason: 'The linked on-chain media or inscription account no longer exists.' };
    if (imageHead.space > 5 * 1024 * 1024) return { status: 'unknown', message: 'An inscription exists, but its media exceeds this viewer’s 5 MB limit.' };
    const [rootAccount, image] = await getAccounts([found.root, found.imageAccount]);
    if (!image || image.owner !== programAddress) throw new Error('The media account changed during verification. Please try again.');
    const bytes = Buffer.from(image.data[0], 'base64');
    const mime = detectMediaMime(bytes);
    if (!mime || (found.tag === 'audio' && mime !== 'audio/mpeg')) return { status: 'unknown', message: 'The tagged inscription bytes are not a supported PNG, JPEG, GIF, WebP, or MP3 asset.' };
    const mediaType = mediaTypeForMime(mime);
    let expectedSize = bytes.length;
    try {
      const rootFields = JSON.parse(Buffer.from(rootAccount.data[0], 'base64').toString().replace(/\0+$/, '').trim());
      expectedSize = Number(rootFields.mediaSize || rootFields.imageSize) || bytes.length;
    } catch { /* Legacy metadata may not declare the expected size. */ }
    const partial = mediaType === 'audio' ? bytes.length < expectedSize : !isCompleteImage(bytes, mime);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const indexer = await indexedAsset(found.mint);
    const dataUri = `data:${mime};base64,${bytes.toString('base64')}`;
    return { status: 'valid', ...found, image: dataUri, dataUri, mediaType, mime, bytes: bytes.length, partial, hash: Buffer.from(digest).toString('hex'), checkedAt: new Date().toISOString(), standard: 'Metaplex Inscription', indexer };
  } catch (error) {
    return { status: 'unknown', message: error.message || 'Unable to verify this address right now.' };
  }
}