import React from 'react';

export default function PostCardSkeleton({ media = true }) {
  return <div aria-hidden="true" className="overflow-hidden rounded-2xl border border-border bg-card/65 backdrop-blur-md">
    <div className="flex gap-4 p-5">
      <div className="social-shimmer h-11 w-11 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-2"><div className="social-shimmer h-4 w-28 rounded-full" /><div className="social-shimmer h-3 w-20 rounded-full" /></div>
        <div className="social-shimmer h-3 w-full rounded-full" />
        <div className="social-shimmer h-3 w-4/5 rounded-full" />
        <div className="social-shimmer h-2.5 w-24 rounded-full" />
      </div>
    </div>
    {media && <div className="social-shimmer h-56 w-full border-t border-border" />}
  </div>;
}