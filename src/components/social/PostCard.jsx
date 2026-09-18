import React from 'react';
import { Link } from 'react-router-dom';
import { Image } from '@/components/ui/image';

const short = value => `${value.slice(0, 4)}…${value.slice(-4)}`;
export default function PostCard({ post, profile, variant }) {
  const name = profile?.displayName || short(post.authorWallet); const handle = profile?.handle ? `@${profile.handle}` : short(post.authorWallet);
  if (variant === 'x-timeline') return <article className="x-post"><Link to={`/profile/${post.authorWallet}`} className={`x-postavatar ${profile?.avatarUrl ? 'has-image' : ''}`}>{profile?.avatarUrl && <Image src={profile.avatarUrl} alt={name} className="h-full w-full" fittingType="fill" />}</Link><div className="x-postbody"><Link to={`/profile/${post.authorWallet}`} className="x-postline"><span className="x-postname">{name}</span><span className="x-posthandle">{handle}</span><time className="x-posttime">· {new Date(post.created_date).toLocaleDateString()}</time></Link><p className="x-posttext">{post.text}</p>{post.mediaUrl && <Image src={post.mediaUrl} alt={`Media posted by ${name}`} className="x-postmedia" fittingType="fit" />}</div></article>;
  return <article className="overflow-hidden rounded-2xl border border-border bg-card/70 text-left backdrop-blur-sm">
    <div className="flex gap-3 p-4"><Link to={`/profile/${post.authorWallet}`} className="flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">{profile?.avatarUrl ? <Image src={profile.avatarUrl} alt={name} className="h-full w-full" fittingType="fill" /> : <span className="m-auto font-display text-xs text-primary">{name.slice(0, 2).toUpperCase()}</span>}</Link><div className="min-w-0 flex-1"><Link to={`/profile/${post.authorWallet}`} className="flex flex-wrap items-baseline gap-x-2"><strong className="truncate text-sm">{name}</strong><span className="font-mono text-[9px] text-muted-foreground">{handle}</span></Link><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{post.text}</p><time className="mt-3 block font-mono text-[9px] text-muted-foreground">{new Date(post.created_date).toLocaleString()}</time></div></div>
    {post.mediaUrl && <Image src={post.mediaUrl} alt={`Media posted by ${name}`} className="max-h-[560px] w-full border-t border-border object-cover" fittingType="fit" />}
  </article>;
}