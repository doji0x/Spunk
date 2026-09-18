import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Image } from '@/components/ui/image';
import SocialHeader from '@/components/social/SocialHeader';
import PostCard from '@/components/social/PostCard';

export default function SocialProfile() {
  const { wallet } = useParams(); const [profile, setProfile] = useState(null); const [posts, setPosts] = useState([]); const [loading, setLoading] = useState(true);
  useEffect(() => { Promise.all([base44.entities.Profile.filter({ walletAddress: wallet }), base44.entities.Post.filter({ authorWallet: wallet }, '-created_date', 50)]).then(([profiles, rows]) => { setProfile(profiles[0] || null); setPosts(rows); setLoading(false); }); }, [wallet]);
  if (loading) return <div className="validate-surface flex min-h-screen items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  return <div className="validate-surface min-h-screen pb-16"><SocialHeader /><main className="mx-auto max-w-2xl px-4 py-8"><section className="rounded-2xl border border-border bg-card/75 p-6 text-left"><div className="flex h-20 w-20 overflow-hidden rounded-full bg-muted ring-2 ring-primary/30">{profile?.avatarUrl ? <Image src={profile.avatarUrl} alt={profile.displayName} className="h-full w-full" fittingType="fill" /> : <span className="m-auto text-xl text-primary">{(profile?.displayName || wallet).slice(0, 2).toUpperCase()}</span>}</div><h1 className="mt-4 font-display text-3xl font-bold">{profile?.displayName || 'Wallet profile'}</h1><p className="mt-1 font-mono text-[10px] text-primary">{profile ? `@${profile.handle}` : wallet}</p>{profile?.bio && <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">{profile.bio}</p>}<p className="mt-5 font-mono text-[9px] text-muted-foreground">{posts.length} {posts.length === 1 ? 'POST' : 'POSTS'}</p></section><div className="mt-5 space-y-4">{posts.map(post => <PostCard key={post.id} post={post} profile={profile} />)}{!posts.length && <p className="py-12 text-center text-sm text-muted-foreground">No posts from this wallet yet.</p>}</div></main></div>;
}