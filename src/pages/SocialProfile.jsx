import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Image } from '@/components/ui/image';
import PostCard from '@/components/social/PostCard';
import ProfileEditPanel from '@/components/social/ProfileEditPanel';
import ValidateBottomBar from '@/components/nav/ValidateBottomBar';
import WalletButton from '@/components/wallet/WalletButton';
import { usePhantomWallet } from '@/contexts/PhantomWalletContext';
import '@/pages/SocialProfile.css';

const DEFAULT_BANNER = 'https://media.base44.com/images/public/6aa8d3c82020abebe308c467/2f42eec2e_generated_460da2c9.jpg';

export default function SocialProfile() {
  const { wallet } = useParams(); const navigate = useNavigate(); const { address, provider } = usePhantomWallet();
  const [profile, setProfile] = useState(null); const [posts, setPosts] = useState([]); const [loading, setLoading] = useState(true); const [editing, setEditing] = useState(false);
  useEffect(() => { Promise.all([base44.entities.Profile.filter({ walletAddress: wallet }), base44.entities.Post.filter({ authorWallet: wallet }, '-created_date', 50)]).then(([profiles, rows]) => { setProfile(profiles[0] || null); setPosts(rows); setLoading(false); }); }, [wallet]);
  if (loading) return <div className="x-profile-loading"><Loader2 className="animate-spin" /></div>;
  const ownProfile = Boolean(profile && address === wallet); const name = profile?.displayName || 'Wallet profile';
  return <div className="x-profile-page"><header className="x-topbar"><button className="x-back" aria-label="Back" onClick={() => navigate(-1)}><ArrowLeft /></button><div className="x-topcopy"><div className="x-topname">{name}</div><div className="x-topcount">{posts.length} posts</div></div><div className="x-wallet"><WalletButton /></div></header>
    <main className="x-content"><section className="x-hero"><div className="x-banner"><Image src={profile?.bannerUrl || DEFAULT_BANNER} alt={`${name} banner`} className="h-full w-full" fittingType="fill" /></div><div className="x-identity"><div className={`x-avatar ${profile?.avatarUrl ? 'has-image' : ''}`}>{profile?.avatarUrl && <Image src={profile.avatarUrl} alt={name} className="h-full w-full" fittingType="fill" />}</div><div className="x-editrow">{ownProfile && <button className="x-edit" onClick={() => setEditing(true)}>Edit profile</button>}</div><div className="x-details"><div className="x-display">{name}</div><div className="x-handle">{profile ? `@${profile.handle}` : wallet}</div>{profile?.bio && <p className="x-bio">{profile.bio}</p>}<div className="x-meta"><span><Clock /><b>{posts.length}</b> posts</span></div></div><div className="x-tabs"><button className="x-tab">Posts</button><button className="x-tab">Replies</button><button className="x-tab">Highlights</button><button className="x-tab">Media</button></div></div></section>
      <section className="x-timeline">{posts.map(post => <PostCard key={post.id} post={post} profile={profile} variant="x-timeline" />)}{!posts.length && <p className="x-empty">No posts from this wallet yet.</p>}</section></main>
    {profile && <ProfileEditPanel open={editing} onClose={() => setEditing(false)} profile={profile} provider={provider} onSaved={setProfile} variant="x" />}<ValidateBottomBar variant="x" /></div>;
}