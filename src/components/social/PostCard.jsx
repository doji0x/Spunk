import React from 'react';
import { Link } from 'react-router-dom';
import { Image } from '@/components/ui/image';

const short = value => `${value.slice(0, 4)}…${value.slice(-4)}`;
export default function PostCard({ post, profile }) {
  const name = profile?.displayName || short(post.authorWallet); const handle = profile?.handle ? `@${profile.handle}` : short(post.authorWallet);
  return <article className="group overflow-hidden rounded-2xl border border-border bg-card/65 text-left shadow-sm backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5 hover:ring-1 hover:ring-primary/30">
    <div className="flex gap-4 p-5"><Link to={`/profile/${post.authorWallet}`} className="flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">{profile?.avatarUrl ? <Image src={profile.avatarUrl} alt={name} className="h-full w-full" fittingType="fill" /> : <span className="m-auto font-display text-xs text-primary">{name.slice(0, 2).toUpperCase()}</span>}</Link><div className="min-w-0 flex-1"><Link to={`/profile/${post.authorWallet}`} className="flex flex-wrap items-baseline gap-x-2"><strong className="truncate font-display text-base font-semibold tracking-tight text-foreground">{name}</strong><span className="font-mono text-[10px] text-muted-foreground">{handle}</span></Link><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/90">{post.text}</p><time className="mt-4 block font-mono text-[10px] text-muted-foreground/80">{new Date(post.created_date).toLocaleString()}</time></div></div>
    {post.mediaUrl && <Image src={post.mediaUrl} alt={`Media posted by ${name}`} className="max-h-[560px] w-full border-t border-border object-cover" fittingType="fit" />}
  </article>;
}