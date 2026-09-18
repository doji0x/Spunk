import { base44 } from '@/api/base44Client';

export async function runWalletAction(provider, action, data) {
  const message = JSON.stringify({ action, timestamp: Date.now(), data });
  const signed = await provider.signMessage(new TextEncoder().encode(message), 'utf8');
  const signature = btoa(String.fromCharCode(...signed.signature));
  const response = await base44.functions.invoke('socialWallet', { message, signature });
  return response.data;
}

export async function uploadSocialMedia(file) {
  if (!file) return '';
  const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
  return file_url;
}