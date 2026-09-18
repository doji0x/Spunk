import React from 'react';

export default function ProfileHeaderSkeleton() {
  return <section aria-hidden="true" className="overflow-hidden border-b border-border bg-card/65 backdrop-blur-md">
    <div className="social-shimmer h-44 w-full sm:h-56" />
    <div className="relative px-5 pb-6 pt-16">
      <div className="social-shimmer absolute -top-12 h-24 w-24 rounded-full border-4 border-card" />
      <div className="social-shimmer h-6 w-44 rounded-full" />
      <div className="social-shimmer mt-3 h-3 w-28 rounded-full" />
      <div className="social-shimmer mt-5 h-3 w-3/4 rounded-full" />
      <div className="social-shimmer mt-3 h-3 w-1/2 rounded-full" />
      <div className="social-shimmer mt-5 h-2.5 w-16 rounded-full" />
    </div>
  </section>;
}