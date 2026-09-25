import { useRef, useState } from 'react';
import { usePhantomWallet } from '@/contexts/PhantomWalletContext';
import { coinEditorCall, mimeFromUrl, editorImageTypes, saveCreatorCoin } from '@/lib/coinEditor';

export default function useCoinEditor() {
  const wallet = usePhantomWallet(), lock = useRef(false);
  const [launch, setLaunch] = useState(null), [fields, setFields] = useState({});
  const [file, setSelectedFile] = useState(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [stage, setStage] = useState(''), [saved, setSaved] = useState(null);
  const adopt = data => { setLaunch(data); setFields({ name: data.name, imageUrl: data.imageUrl, imageMime: editorImageTypes.includes(data.imageMime) ? data.imageMime : 'image/png', ...data.socials }); setSelectedFile(null); };
  async function run(task) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setSaved(null);
    try { await task(); }
    catch (reason) { setError(reason.response?.data?.error || reason.message || 'Unable to update this coin.'); }
    finally { lock.current = false; setBusy(false); setStage(''); }
  }
  const lookup = coinMint => run(async () => { setLaunch(null); setStage('Loading current metadata…'); adopt(await coinEditorCall({ action: 'lookup', coinMint: coinMint.trim() })); });
  const update = (key, value) => { setSaved(null); setFields(current => ({ ...current, [key]: value, ...(key === 'imageUrl' ? { imageMime: mimeFromUrl(value, current.imageMime) } : {}) })); };
  const setFile = value => { setSelectedFile(value); setSaved(null); };
  const save = clear => run(async () => {
    const data = await saveCreatorCoin({ wallet, launch, fields, file, clear, stage: setStage });
    adopt(data); setSaved(data);
  });
  return { wallet, launch, fields, file, setFile, busy, error, stage, saved, lookup, update,
    save: event => { event.preventDefault(); return save(false); },
    clear: () => { if (window.confirm('Restore the original inscribed name and image? Links, symbol and description will stay unchanged.')) return save(true); } };
}