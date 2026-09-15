import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { encodeBase64, sha256Hex } from '@/lib/bytes';

const idle = { busy: false, progress: 0, stage: '', error: '' };
const message = error => error.response?.data?.error || error.message || 'The launch stopped. Resume this launch instead of creating another.';

// Drives one launch end-to-end: prepare → chunked writes → chain verify → Token-2022 launch.
// Every server step is idempotent, so calling run() again simply continues where the chain left off.
export default function useTokenLaunch(launch, onChange) {
  const [state, setState] = useState(idle);
  const invoke = async payload => (await base44.functions.invoke('launchToken', { launchId: launch.id, ...payload })).data;
  const run = async file => {
    setState({ ...idle, busy: true, stage: 'Preparing inscription accounts' });
    try {
      if (launch.status === 'preparing') {
        if (!file) throw new Error('Select the launch image to continue writing its bytes.');
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (await sha256Hex(bytes) !== launch.imageHash) throw new Error('This file does not match the image recorded for the launch.');
        const prepared = await invoke({ action: 'prepare' });
        let offset = Math.min(Math.floor(prepared.writtenBytes / prepared.batchBytes) * prepared.batchBytes, bytes.length);
        while (offset < bytes.length) {
          const batch = bytes.slice(offset, offset + prepared.batchBytes);
          const data = await invoke({ action: 'append', offset, totalSize: bytes.length, mimeType: file.type, data: encodeBase64(batch) });
          offset = data.nextOffset;
          setState(current => ({ ...current, stage: 'Writing image bytes on-chain', progress: Math.round(offset / bytes.length * 90) }));
        }
        setState(current => ({ ...current, stage: 'Reading bytes back from chain', progress: 92 }));
        await invoke({ action: 'verify' });
        await onChange();
      }
      setState(current => ({ ...current, stage: 'Creating Token-2022 mint and binding fields', progress: 95 }));
      await invoke({ action: 'launch' });
      await onChange();
      setState({ ...idle, progress: 100 });
    } catch (error) {
      await onChange();
      setState(current => ({ ...current, busy: false, error: message(error) }));
    }
  };
  return { ...state, run };
}