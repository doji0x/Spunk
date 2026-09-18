import React from 'react';

export default function FlyIcon({ className = '' }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path d="M10.2 9.3C8.8 5.6 5.9 4.2 3.8 5.5c-1.8 1.1-.8 4.4 2.2 5.5M13.8 9.3c1.4-3.7 4.3-5.1 6.4-3.8 1.8 1.1.8 4.4-2.2 5.5M9.2 12.8c-3.4-.4-5.8 1-5.9 3.1-.1 2.1 3.5 2.8 6.2.8M14.8 12.8c3.4-.4 5.8 1 5.9 3.1.1 2.1-3.5 2.8-6.2.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9.5 10.2c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5v5.1c0 2-1.1 3.7-2.5 3.7s-2.5-1.7-2.5-3.7v-5.1Z" fill="currentColor" />
    <path d="M8.2 6.6 6.8 4.9M15.8 6.6l1.4-1.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
}