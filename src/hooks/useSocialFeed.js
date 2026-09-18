import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function useSocialFeed(address) {
  const [posts, setPosts] = useState([]); const [profiles, setProfiles] = useState({}); const [profile, setProfile] = useState(null); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); const [postRows, profileRows] = await Promise.all([base44.entities.Post.list('-created_date', 50), base44.entities.Profile.list('-created_date', 100)]); setPosts(postRows); setProfiles(Object.fromEntries(profileRows.map(item => [item.walletAddress, item]))); setProfile(address ? profileRows.find(item => item.walletAddress === address) || null : null); setLoading(false); }, [address]);
  useEffect(() => { load(); const unsubscribe = base44.entities.Post.subscribe(() => load()); return unsubscribe; }, [load]);
  const addPost = post => setPosts(current => [post, ...current.filter(item => item.id !== post.id)]);
  const saveProfile = item => { setProfile(item); setProfiles(current => ({ ...current, [item.walletAddress]: item })); };
  return { posts, profiles, profile, loading, addPost, saveProfile };
}