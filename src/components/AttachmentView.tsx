import { useMemo, useRef, useState } from 'react';
import { formatBytes, useFileUrl } from '../data/attachments';
import type { Attachment } from '../data/types';
import { Icon } from './Icon';

/** Renders one message attachment: photo, video, audio player or file card. */
export function AttachmentView({ file }: { file: Attachment }) {
  const { url, missing } = useFileUrl(file.id);
  if (missing) return <div className="att-missing small">File no longer available</div>;
  if (!url) return <div className={`att-loading att-${file.kind}`} />;

  switch (file.kind) {
    case 'image':
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="att-image">
          <img src={url} alt={file.name} loading="lazy" />
        </a>
      );
    case 'video':
      return <video className="att-video" src={url} controls preload="metadata" playsInline />;
    case 'audio':
      return <AudioPlayer url={url} file={file} />;
    default:
      return (
        <a href={url} download={file.name} className="att-file">
          <span className="att-file-icon"><Icon name="file" size={20} /></span>
          <span className="att-meta">
            <strong>{file.name}</strong>
            <span>{formatBytes(file.size)}</span>
          </span>
          <Icon name="download" size={18} />
        </a>
      );
  }
}

const BARS = 36;

function AudioPlayer({ url, file }: { url: string; file: Attachment }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // A stable, decorative waveform derived from the file id.
  const heights = useMemo(() => {
    let h = [...file.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    return Array.from({ length: BARS }, (_, i) => {
      h = (h * 1103515245 + 12345) >>> 0;
      const env = Math.sin((i / BARS) * Math.PI) * 0.6 + 0.4;
      return Math.round((0.25 + ((h >>> 16) % 1000) / 1000 * 0.75) * env * 100);
    });
  }, [file.id]);

  const progress = duration ? time / duration : 0;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const toggle = () => {
    const a = audio.current!;
    if (a.paused) a.play();
    else a.pause();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audio.current!;
    if (!duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * duration;
  };

  return (
    <div className="att-audio">
      <audio
        ref={audio}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
      <button className="att-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        <Icon name={playing ? 'pause' : 'play'} size={16} filled={!playing} />
      </button>
      <div className="att-audio-main">
        <div className="att-wave" onClick={seek} role="slider" aria-label="Seek" aria-valuenow={Math.round(progress * 100)} tabIndex={0}
          onKeyDown={(e) => {
            const a = audio.current!;
            if (e.key === 'ArrowRight') a.currentTime = Math.min(duration, a.currentTime + 5);
            if (e.key === 'ArrowLeft') a.currentTime = Math.max(0, a.currentTime - 5);
          }}>
          {heights.map((h, i) => (
            <i key={i} style={{ height: `${h}%` }} className={i / BARS < progress ? 'is-played' : ''} />
          ))}
        </div>
        <div className="att-audio-meta">
          <span className="att-name">{file.name}</span>
          <span>{duration ? `${fmt(time)} / ${fmt(duration)}` : formatBytes(file.size)}</span>
        </div>
      </div>
      <a href={url} download={file.name} className="att-dl" aria-label={`Download ${file.name}`}>
        <Icon name="download" size={16} />
      </a>
    </div>
  );
}
