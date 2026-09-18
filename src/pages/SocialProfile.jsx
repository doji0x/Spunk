import React, { useEffect, useState } from 'react';
import { Edit3, Loader2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Image } from '@/components/ui/image';
import SocialHeader from '@/components/social/SocialHeader';
import PostCard from '@/components/social/PostCard';
import ProfileEditPanel from '@/components/social/ProfileEditPanel';
import ValidateBottomBar from '@/components/nav/ValidateBottomBar';
import { Button } from '@/components/ui/button';
import { usePhantomWallet } from '@/contexts/PhantomWalletContext';

export default function SocialProfile() {
  const { wallet } = useParams(); const { address, provider } = usePhantomWallet(); const [profile, setProfile] = useState(null); const [posts, setPosts] = useState([]); const [loading, setLoading] = useState(true); const [editing, setEditing] = useState(false);
  useEffect(() => { Promise.all([base44.entities.Profile.filter({ walletAddress: wallet }), base44.entities.Post.filter({ authorWallet: wallet }, '-created_date', 50)]).then(([profiles, rows]) => { setProfile(profiles[0] || null); setPosts(rows); setLoading(false); }); }, [wallet]);
  if (loading) return <div className="validate-surface flex min-h-screen items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  const ownProfile = Boolean(profile && address === wallet);
  return <div className="validate-surface min-h-screen pb-24"><SocialHeader /><main className="mx-auto max-w-2xl"><section className="border-b border-border bg-card/60 text-left"><div className="h-44 bg-muted sm:h-56">{profile?.bannerUrl && <Image src={profile.bannerUrl} alt={`${profile.displayName} banner`} className="h-full w-full" fittingType="fill" />}</div><div className="relative px-5 pb-5"><div className="absolute -top-12 flex h-24 w-24 overflow-hidden rounded-full border-4 border-card bg-muted">{profile?.avatarUrl ? <Image src={profile.avatarUrl} alt={profile.displayName} className="h-full w-full" fittingType="fill" /> : <span className="m-auto text-2xl text-primary">{(profile?.displayName || wallet).slice(0, 2).toUpperCase()}</span>}</div>{ownProfile && <div className="flex justify-end pt-3"><Button variant="outline" size="sm" onClick={() => setEditing(true)}><Edit3 />Edit profile</Button></div>}<div className={ownProfile ? 'mt-8' : 'pt-16'}><h1 className="font-display text-2xl font-bold">{profile?.displayName || 'Wallet profile'}</h1><p className="mt-1 font-mono text-[10px] text-muted-foreground">{profile ? `@${profile.handle}` : wallet}</p>{profile?.bio && <p className="mt-4 max-w-lg text-sm leading-6">{profile.bio}</p>}<p className="mt-4 font-mono text-[9px] text-muted-foreground"><span className="font-semibold text-foreground">{posts.length}</span> {posts.length === 1 ? 'POST' : 'POSTS'}</p></div></div></section><div className="space-y-4 px-4 py-5">{posts.map(post => <PostCard key={post.id} post={post} profile={profile} />)}{!posts.length && <p className="py-12 text-center text-sm text-muted-foreground">No posts from this wallet yet.</p>}</div></main>{profile && <ProfileEditPanel open={editing} onClose={() => setEditing(false)} profile={profile} provider={provider} onSaved={setProfile} />}<ValidateBottomBar /></div>;
}