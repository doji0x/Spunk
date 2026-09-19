import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, AudioLines, TriangleAlert } from 'lucide-react';

const functionsBaseUrl = 'https://solvalidate.base44.app/functions';

export function inscriptionAudioUrl(mint) {
  return `${functionsBaseUrl}/inscriptionMetadata?mint=${mint}&asset=audio`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export default function InscriptionAudioPlayer({ src, label, partial }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setDuration(0);
    setFailed(false);
  }, [src]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setFailed(true);
      }
    } else {
      audio.pause();
    }
  };

  const percent = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  return <div className="w-full max-w-xl">
    <div className="flex items-center gap-4 rounded-2xl border border-primary/30 bg-background px-4 py-3">
      <button type="button" onClick={toggle} aria-label={playing ? 'Pause on-chain audio' : 'Play on-chain audio'} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90">
        {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
          <AudioLines size={12} />{partial ? 'Partial on-chain audio' : 'On-chain audio'}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatTime(progress)} / {formatTime(duration)}</span>
    </div>
    {failed && <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground"><TriangleAlert size={12} className="shrink-0" />Playback is unavailable in this browser, but the audio bytes are verified on-chain.</p>}
    <audio
      ref={audioRef}
      src={src}
      preload="metadata"
      aria-label={label}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => { setPlaying(false); setProgress(0); }}
      onTimeUpdate={event => setProgress(event.currentTarget.currentTime)}
      onLoadedMetadata={event => setDuration(event.currentTarget.duration)}
      onError={() => setFailed(true)}
      className="hidden"
    />
  </div>;
}