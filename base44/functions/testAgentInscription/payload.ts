import { Buffer } from 'node:buffer';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { detectMediaMime } from '../../shared/mediaMime.ts';
import { isCompleteImage } from '../../shared/imageMime.ts';
import { rpcRequest } from '../../shared/mintWallet.ts';

function media(data, cover = false) {
  if (typeof data !== 'string' || data.length > 1398104 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('Select a media file no larger than 1 MB.');
  const bytes = Buffer.from(data, 'base64');
  const mime = detectMediaMime(bytes);
  if (!bytes.length || bytes.length > 1048576 || !mime || (cover && !mime.startsWith('image/'))) throw new Error('Use PNG, JPEG, GIF, WebP, or MP3; cover art must be an image.');
  if (mime.startsWith('image/') && !isCompleteImage(bytes, mime)) throw new Error('The image appears incomplete. Select a complete image file.');
  return { bytes, mime };
}

export async function pofPayload(input) {
  const name = String(input.name || '').trim();
  const symbol = String(input.symbol || '').trim().toUpperCase();
  const description = String(input.description || '').trim();
  if (!name || Buffer.byteLength(name) > 32 || !symbol || Buffer.byteLength(symbol) > 10 || !description || description.length > 1000) throw new Error('Use a name up to 32 UTF-8 bytes, symbol up to 10 UTF-8 bytes, and description up to 1,000 characters.');
  const destinationWallet = String(input.destinationWallet || '').trim();
  let destination;
  try { destination = new PublicKey(destinationWallet); } catch { throw new Error('Enter a valid Solana destination wallet.'); }
  if (!PublicKey.isOnCurve(destination.toBytes())) throw new Error('The destination must be a normal wallet, not a program address.');
  const source = media(input.data);
  const cover = source.mime === 'audio/mpeg' ? media(input.coverData, true) : null;
  const hash = async bytes => Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
  const submissionHash = await hash(Buffer.from(JSON.stringify({ name, symbol, description, destinationWallet, media: await hash(source.bytes), cover: cover ? await hash(cover.bytes) : '' })));
  return { name, symbol, description, destinationWallet, source, cover, submissionHash };
}

export async function pofEstimate(rpcUrl, sizes) {
  // Includes the master NFT, printed edition, token accounts, inscription metadata and media accounts.
  const accountSizes = [82, 82, 679, 679, 282, 282, 165, 165, 165, 1024, 4096, ...sizes];
  const rent = await Promise.all(accountSizes.map(size => rpcRequest(rpcUrl, 'getMinimumBalanceForRentExemption', [size])));
  const transactions = 20 + sizes.reduce((sum, size) => sum + Math.ceil(size / 800), 0);
  const estimateSol = (rent.reduce((sum, value) => sum + Number(value), 0) + transactions * 15000) / 1e9;
  return { estimateSol: Math.ceil(estimateSol * 1.15 * 1e6) / 1e6, totalBytes: sizes.reduce((sum, size) => sum + size, 0), transactions };
}