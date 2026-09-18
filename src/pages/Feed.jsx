import React from 'react';
import { MessageSquare, Sparkles } from 'lucide-react';
import SocialHeader from '@/components/social/SocialHeader';
import ProfileOnboarding from '@/components/social/ProfileOnboarding';
import PostComposer from '@/components/social/PostComposer';
import PostCard from '@/components/social/PostCard';
import { Button } from '@/components/ui/button';
import { usePhantomWallet } from '@/contexts/PhantomWalletContext';
import useSocialFeed from '@/hooks/useSocialFeed';
import ValidateBottomBar from '@/components/nav/ValidateBottomBar';
import PostCardSkeleton from '@/components/social/PostCardSkeleton';

export default function Feed() {
  const { address, provider, connect, connecting } = usePhantomWallet(); const { posts, profiles, profile, loading, addPost, saveProfile } = useSocialFeed(address);
  return <div className="validate-surface min-h-screen pb-16"><SocialHeader /><main className="mx-auto max-w-2xl space-y-5 px-4 py-8"><div className="text-left"><p className="font-mono text-[9px] tracking-[0.2em] text-primary">GLOBAL PUBLIC FEED</p><h1 className="mt-2 font-display text-4xl font-bold">The work, <span className="gold-text">in public.</span></h1><p className="mt-2 text-sm text-muted-foreground">Artists and collectors sharing what deserves to last.</p></div>
    {!address && <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center"><p className="text-sm">Connect your wallet to create a profile and post.</p><Button onClick={connect} disabled={connecting} className="mt-4">Connect Phantom</Button></div>}
    {address && !loading && !profile && <ProfileOnboarding address={address} provider={provider} onCreated={saveProfile} />}{address && profile && <PostComposer address={address} provider={provider} onPosted={addPost} />}
    {loading ? <div className="space-y-4"><PostCardSkeleton /><PostCardSkeleton media={false} /><PostCardSkeleton /></div> : posts.length ? <div className="space-y-4">{posts.map(post => <PostCard key={post.id} post={post} profile={profiles[post.authorWallet]} />)}</div> : <div className="rounded-2xl border border-primary/20 bg-card/65 px-6 py-14 text-center shadow-[inset_0_1px_0_hsl(var(--primary)/0.12)] backdrop-blur-md"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary"><MessageSquare className="h-6 w-6" /></div><p className="mt-5 font-display text-xl font-semibold text-foreground">The feed is waiting.</p><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{address ? 'Be the first to share your work, process, or perspective.' : 'Connect your wallet to join the first conversation.'}</p>{address && <div className="mt-5 inline-flex items-center gap-2 font-mono text-[9px] tracking-[0.15em] text-primary"><Sparkles className="h-3.5 w-3.5" />YOUR FIRST POST STARTS ABOVE</div>}</div>}
  </main><ValidateBottomBar /></div>;
}