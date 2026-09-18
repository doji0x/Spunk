import React from 'react';
import { Loader2, MessageSquare } from 'lucide-react';
import SocialHeader from '@/components/social/SocialHeader';
import ProfileOnboarding from '@/components/social/ProfileOnboarding';
import PostComposer from '@/components/social/PostComposer';
import PostCard from '@/components/social/PostCard';
import { Button } from '@/components/ui/button';
import { usePhantomWallet } from '@/contexts/PhantomWalletContext';
import useSocialFeed from '@/hooks/useSocialFeed';

export default function Feed() {
  const { address, provider, connect, connecting } = usePhantomWallet(); const { posts, profiles, profile, loading, addPost, saveProfile } = useSocialFeed(address);
  return <div className="validate-surface min-h-screen pb-16"><SocialHeader /><main className="mx-auto max-w-2xl space-y-5 px-4 py-8"><div className="text-left"><p className="font-mono text-[9px] tracking-[0.2em] text-primary">GLOBAL PUBLIC FEED</p><h1 className="mt-2 font-display text-4xl font-bold">The work, <span className="gold-text">in public.</span></h1><p className="mt-2 text-sm text-muted-foreground">Artists and collectors sharing what deserves to last.</p></div>
    {!address && <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center"><p className="text-sm">Connect your wallet to create a profile and post.</p><Button onClick={connect} disabled={connecting} className="mt-4">Connect Phantom</Button></div>}
    {address && !loading && !profile && <ProfileOnboarding address={address} provider={provider} onCreated={saveProfile} />}{address && profile && <PostComposer address={address} provider={provider} onPosted={addPost} />}
    {loading ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div> : posts.length ? <div className="space-y-4">{posts.map(post => <PostCard key={post.id} post={post} profile={profiles[post.authorWallet]} />)}</div> : <div className="py-16 text-center text-muted-foreground"><MessageSquare className="mx-auto h-8 w-8" /><p className="mt-3 text-sm">No posts yet. The first word is yours.</p></div>}
  </main></div>;
}