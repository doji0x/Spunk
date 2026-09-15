import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';

export default function AdminGate({ children }) {
  const [user, setUser] = useState();
  useEffect(() => { base44.auth.me().then(setUser); }, []);
  if (!user) return <div className="validate-surface flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#dce1d5] border-t-[#66834a]" /></div>;
  if (user.role !== 'admin') return <main className="validate-surface flex min-h-screen items-center justify-center px-5"><div className="max-w-md rounded-2xl border border-[#dce1d5] bg-white p-8 text-center"><h1 className="text-xl font-semibold">Admin access required</h1><p className="mt-2 text-sm text-[#7e8773]">The launchpad is restricted to administrator accounts.</p><Link to="/" className="mt-5 inline-block text-sm underline">Return home</Link></div></main>;
  return children;
}