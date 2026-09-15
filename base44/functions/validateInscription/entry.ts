import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { getInscriptionMetadataAccountDataSerializer } from 'npm:@metaplex-foundation/mpl-inscription@0.8.1';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const rpcUrl = secrets.get('SOLANA_RPC_URL');
    if (!rpcUrl) throw new Error('The private Solana RPC is not configured.');
    const { address } = await req.json();
    if (typeof address !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(address)) return Response.json({ status: 'error', message: 'Enter a valid Solana mint address or transaction signature.' });
    const program = new PublicKey('1NSCRfGeyo7wPUazGbaPBUsTM49e1k2aXewHGARfzSo');
    const tokenPrograms = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];
    const rpc = async (method, params) => {
      const response = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(18000) });
      if (!response.ok) throw new Error('Solana is unavailable or rate-limiting requests. Please try again shortly.');
      const body = await response.json();
      if (body.error) throw new Error('Solana could not complete this lookup. Please try again shortly.');
      return body.result;
    };
    const derive = key => PublicKey.findProgramAddressSync([Buffer.from('Inscription'), program.toBuffer(), new PublicKey(key).toBuffer()], program)[0].toBase58();
    const getAccounts = async (keys, sliced = false) => keys.length ? (await rpc('getMultipleAccounts', [keys, { encoding: 'base64', commitment: 'finalized', ...(sliced ? { dataSlice: { offset: 0, length: 166 } } : {}) }])).value : [];
    let candidates = [address];
    let transaction = null;
    if (address.length > 44) {
      transaction = await rpc('getTransaction', [address, { encoding: 'jsonParsed', commitment: 'finalized', maxSupportedTransactionVersion: 0 }]);
      if (!transaction) return Response.json({ status: 'unknown', message: 'Transaction not found on Solana mainnet. It may be unfinalized or unavailable from this node.' });
      if (transaction.meta?.err) return Response.json({ status: 'invalid', reason: 'This transaction failed and did not commit an inscription.' });
      candidates = [...new Set(transaction.transaction.message.accountKeys.map(k => typeof k === 'string' ? k : k.pubkey))];
      if (candidates.length > 100) return Response.json({ status: 'unknown', message: 'This transaction contains too many accounts for a single check. Paste its token mint address instead.' });
    } else {
      try { new PublicKey(address); } catch { return Response.json({ status: 'error', message: 'This is not a valid Solana address.' }); }
    }
    const heads = await getAccounts(candidates, true);
    const isMint = a => {
      if (!a || a.executable || !tokenPrograms.includes(a.owner)) return false;
      const bytes = Buffer.from(a.data[0], 'base64');
      return bytes.length >= 82 && bytes[45] === 1 && (a.space === 82 || (bytes.length > 165 && bytes[165] === 1));
    };
    let mints = candidates.filter((key, i) => isMint(heads[i]));
    if (transaction) {
      // Image-write transactions may include the metadata PDA but omit the mint.
      const linkedKeys = candidates.filter((key, i) => {
        const a = heads[i];
        return a && !a.executable && a.owner === program.toBase58() && a.space <= 65536 && [1, 2].includes(Buffer.from(a.data[0], 'base64')[0]);
      });
      if (linkedKeys.length > 20) return Response.json({ status: 'unknown', message: 'This transaction includes many inscriptions. Paste the specific token mint address instead.' });
      const linkedAccounts = await getAccounts(linkedKeys);
      const discovered = [];
      for (let i = 0; i < linkedKeys.length; i++) {
        const account = linkedAccounts[i];
        if (!account || account.owner !== program.toBase58()) continue;
        const [metadata] = getInscriptionMetadataAccountDataSerializer().deserialize(Buffer.from(account.data[0], 'base64'));
        const mint = metadata.mint?.__option === 'Some' ? metadata.mint.value : null;
        if (mint && metadata.inscriptionAccount === derive(mint) && derive(derive(mint)) === linkedKeys[i]) discovered.push(mint);
      }
      const extra = [...new Set(discovered)].filter(m => !mints.includes(m));
      const extraHeads = await getAccounts(extra, true);
      mints = [...mints, ...extra.filter((m, i) => isMint(extraHeads[i]))];
    }
    if (mints.length > 20) return Response.json({ status: 'unknown', message: 'Several tokens are involved. Paste the specific token mint address to verify it.' });
    const roots = mints.map(derive);
    const metadataKeys = roots.map(derive);
    const metadataAccounts = await getAccounts(metadataKeys);
    const findings = [];
    for (let i = 0; i < mints.length; i++) {
      const account = metadataAccounts[i];
      if (!account || account.owner !== program.toBase58() || account.executable) continue;
      const [metadata] = getInscriptionMetadataAccountDataSerializer().deserialize(Buffer.from(account.data[0], 'base64'));
      if (![1, 2].includes(metadata.key) || metadata.inscriptionAccount !== roots[i] || metadata.mint?.__option !== 'Some' || metadata.mint.value !== mints[i]) continue;
      if (!metadata.associatedInscriptions.some(a => a.tag === 'image')) continue;
      const imageAccount = PublicKey.findProgramAddressSync([Buffer.from('Inscription'), Buffer.from('Association'), Buffer.from('image'), new PublicKey(metadataKeys[i]).toBuffer()], program)[0].toBase58();
      findings.push({ mint: mints[i], root: roots[i], metadata: metadataKeys[i], imageAccount, immutable: metadata.updateAuthorities.length === 0 });
    }
    if (!findings.length) return Response.json({ status: 'invalid', reason: 'No token-linked image inscription was found under the supported Metaplex standard. Other inscription protocols are not checked.' });
    if (findings.length > 1) return Response.json({ status: 'unknown', message: 'This transaction includes more than one inscribed token. Paste the specific token mint address to choose which image to verify.' });
    const found = findings[0];
    const [rootHead, imageHead] = await getAccounts([found.root, found.imageAccount], true);
    if (!rootHead || !imageHead || rootHead.owner !== program.toBase58() || imageHead.owner !== program.toBase58() || rootHead.executable || imageHead.executable) return Response.json({ status: 'invalid', reason: 'The linked on-chain image or inscription account no longer exists.' });
    if (imageHead.space > 5 * 1024 * 1024) return Response.json({ status: 'unknown', message: 'An inscription exists, but its image exceeds this viewer’s 5 MB limit.' });
    const [image] = await getAccounts([found.imageAccount]);
    if (!image || image.owner !== program.toBase58()) throw new Error('The image account changed during verification. Please try again.');
    const bytes = Buffer.from(image.data[0], 'base64');
    const hex = bytes.subarray(0, 12).toString('hex');
    const mime = hex.startsWith('89504e470d0a1a0a') ? 'image/png' : hex.startsWith('ffd8ff') ? 'image/jpeg' : /^474946383[79]61/.test(hex) ? 'image/gif' : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null;
    if (!mime) return Response.json({ status: 'unknown', message: 'An image-tagged inscription exists, but its bytes are not a supported PNG, JPEG, GIF, or WebP image.' });
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Response.json({ status: 'valid', ...found, image: `data:${mime};base64,${bytes.toString('base64')}`, mime, bytes: bytes.length, hash: Buffer.from(digest).toString('hex'), checkedAt: new Date().toISOString(), standard: 'Metaplex Inscription' });
  } catch (error) {
    return Response.json({ status: 'unknown', message: error.name === 'TimeoutError' ? 'Solana took too long to respond. Please try again.' : error.message || 'Unable to verify this address right now.' });
  }
}