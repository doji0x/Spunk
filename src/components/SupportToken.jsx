import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

const address = '6A4mSvzKpgdVPcAs64wTi6iyqPiW2kCxduh1VhiApump';

export default function SupportToken() {
  const [copied, setCopied] = useState(false);
  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return <button type="button" onClick={copyAddress} title={address} className="flex basis-full flex-col items-center gap-1 border-t border-[#dce1d5] pt-4 text-center hover:text-[#52683f]">
    <span className="font-medium text-[#657456]">Support token · Creator fees support this work</span>
    <span className="flex max-w-full items-center gap-1.5 font-mono text-[9px]"><span className="break-all">{address}</span>{copied ? <Check className="shrink-0" size={12} /> : <Copy className="shrink-0" size={12} />}</span>
    <span className="sr-only" aria-live="polite">{copied ? 'Address copied' : ''}</span>
  </button>;
}