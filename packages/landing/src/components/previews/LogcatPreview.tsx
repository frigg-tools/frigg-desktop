import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { AppWindow, Live, prefersReduced } from './shared';

type Level = 'D' | 'I' | 'W' | 'E';

interface Line {
  id: number;
  level: Level;
  tag: string;
  msg: string;
  time: string;
}

const levelColor: Record<Level, string> = {
  D: 'text-sky-300 bg-sky-500/10 ring-sky-500/30',
  I: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/30',
  W: 'text-amber-300 bg-amber-500/10 ring-amber-500/30',
  E: 'text-rose-300 bg-rose-500/10 ring-rose-500/30',
};

const samples: Omit<Line, 'id'>[] = [
  { level: 'I', tag: 'OkHttp', msg: '--> GET /v2/feed (0-byte body)', time: '14:02:11.418' },
  { level: 'D', tag: 'AppViewModel', msg: 'state → Loading', time: '14:02:11.420' },
  { level: 'I', tag: 'OkHttp', msg: '<-- 200 /v2/feed (128ms)', time: '14:02:11.548' },
  { level: 'D', tag: 'FeedAdapter', msg: 'submitList(24 items)', time: '14:02:11.561' },
  { level: 'W', tag: 'Glide', msg: 'Load failed for hero@2x.webp, retrying', time: '14:02:11.604' },
  { level: 'E', tag: 'PaymentSdk', msg: 'charge failed: HTTP 500 ch_19x', time: '14:02:12.880' },
  { level: 'I', tag: 'Analytics', msg: 'track(screen_view, {name: feed})', time: '14:02:13.002' },
  { level: 'D', tag: 'AuthInterceptor', msg: 'refreshing access token', time: '14:02:13.110' },
];

const MAX = 9;

export default function LogcatPreview() {
  const { t } = useT();
  const seed = useRef(0);
  const cursor = useRef(0);
  const [lines, setLines] = useState<Line[]>(() => samples.map((s, i) => ({ ...s, id: i })));

  useEffect(() => {
    if (prefersReduced) return;
    seed.current = samples.length;
    cursor.current = 0;
    const id = window.setInterval(() => {
      const next = { ...samples[cursor.current], id: ++seed.current };
      cursor.current = (cursor.current + 1) % samples.length;
      setLines((prev) => [...prev, next].slice(-MAX));
    }, 1500);
    return () => window.clearInterval(id);
  }, []);

  return (
    <AppWindow
      title={
        <>
          <Live label={t.previews.logcat.title} />
          <span className="ml-1 rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[10px] normal-case tracking-normal text-zinc-400">
            com.acme.app
          </span>
        </>
      }
    >
      <div className="font-mono text-[12px] leading-relaxed">
        {lines.map((l, idx) => (
          <div
            key={l.id}
            className={`flex items-start gap-2.5 px-4 py-1.5 ${idx === lines.length - 1 && !prefersReduced ? 'row-arrive' : ''}`}
          >
            <span className="shrink-0 text-zinc-600">{l.time}</span>
            <span
              className={`mt-px shrink-0 rounded px-1 text-[10px] font-semibold ring-1 ${levelColor[l.level]}`}
            >
              {l.level}
            </span>
            <span className="shrink-0 text-teal-300/80">{l.tag}</span>
            <span className="min-w-0 flex-1 truncate text-zinc-300">{l.msg}</span>
          </div>
        ))}
      </div>
    </AppWindow>
  );
}
