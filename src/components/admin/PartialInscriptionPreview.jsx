import React, { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Image } from '@/components/ui/image';

export default function PartialInscriptionPreview({ pending }) {
  const bytes = pending?.bytes;
  const imageUrl = useMemo(() => {
    if (!bytes?.length) return '';
    return URL.createObjectURL(new Blob([bytes], { type: pending.mimeType }));
  }, [bytes, pending?.mimeType]);

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  if (!imageUrl) return null;
  const revealed = Math.min(100, Math.max(0, ((pending.offset || 0) / bytes.length) * 100));

  return <div className="mt-4">
    <p className="mb-2 text-xs text-muted-foreground">Revealing on-chain image…</p>
    <div className="proof-image flex min-h-40 items-center justify-center overflow-hidden rounded-xl border border-launch-border p-4">
      <motion.div className="flex w-full items-center justify-center" animate={{ clipPath: `inset(0 0 ${100 - revealed}% 0)` }} transition={{ duration: 0.35, ease: 'easeOut' }}>
        <Image src={imageUrl} alt="Image progressively revealed as inscription chunks confirm" className="max-h-72 max-w-full rounded-xl" fittingType="fit" />
      </motion.div>
    </div>
  </div>;
}