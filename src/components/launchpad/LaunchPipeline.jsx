import React, { useState } from 'react';
import { Check, Circle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import ImageUploadField from '@/components/admin/ImageUploadField';

const launchedStates = ['launched', 'on_sale', 'closed'];

export default function LaunchPipeline({ launch, writtenBytes, runner, onRun }) {
  const [file, setFile] = useState(null);
  const inscribed = launch.status !== 'preparing';
  const launched = launchedStates.includes(launch.status);
  const steps = [
    ['Inscribe image bytes on-chain (800-byte V1 chunks)', inscribed],
    ['Read back and verify SHA-256 against the upload', inscribed],
    ['Create Token-2022 mint · write binding fields · mint supply · revoke authorities', launched]
  ];
  const needsFile = !inscribed && !runner.busy;
  return <section className="rounded-2xl border border-[#dce1d5] bg-white p-5 text-sm">
    <p className="mb-4 font-mono text-[10px] tracking-widest text-[#66834a]">PIPELINE</p>
    <ol className="space-y-3">{steps.map(([label, done], index) => <li key={label} className="flex items-start gap-3"><span className={done ? 'mt-0.5 rounded-full bg-[#c2f486] p-1' : 'mt-0.5 rounded-full bg-[#f3f4ef] p-1 text-[#8b9185]'}>{done ? <Check size={12} /> : runner.busy && steps.slice(0, index).every(step => step[1]) ? <Loader2 size={12} className="animate-spin" /> : <Circle size={12} />}</span><span className={done ? '' : 'text-[#7e8773]'}>{label}</span></li>)}</ol>
    {runner.busy && <div className="mt-5"><div className="mb-2 flex justify-between text-xs"><span>{runner.stage}</span><span className="font-mono">{runner.progress}%</span></div><Progress value={runner.progress} /></div>}
    {runner.error && <p className="mt-4 text-[#a54132]">{runner.error}</p>}
    {!launched && !runner.busy && <div className="mt-5 space-y-4">
      {needsFile && <><p className="text-xs text-[#7e8773]">{writtenBytes ? `${writtenBytes.toLocaleString()} of ${launch.imageSize.toLocaleString()} bytes are already on-chain. Select the same image to resume from that offset.` : 'Select the same image to start writing its bytes on-chain.'}</p><ImageUploadField disabled={false} onFileChange={setFile} /></>}
      <Button type="button" className="w-full" disabled={needsFile && !file} onClick={() => onRun(file)}>{!inscribed ? (writtenBytes ? 'Resume inscription' : 'Start inscription') : 'Launch Token-2022 mint'}</Button>
    </div>}
    {launched && !runner.busy && <p className="mt-4 text-xs text-[#66834a]">Launch complete. Mint, freeze, and metadata update authorities are removed; the binding fields are immutable.</p>}
  </section>;
}