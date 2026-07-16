import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { AppWindow, Live, MethodChip, prefersReduced, statusColor, type Method } from './shared';

interface Row {
  id: number;
  method: Method;
  status: number;
  host: string;
  path: string;
  size: string;
  ms: number;
  mock: boolean;
}

const samples: Omit<Row, 'id'>[] = [
  { method: 'GET', status: 200, host: 'api.acme.dev', path: '/v2/feed?page=1', size: '14.2 kB', ms: 128, mock: false },
  { method: 'POST', status: 201, host: 'api.acme.dev', path: '/v2/orders', size: '512 B', ms: 243, mock: false },
  { method: 'GET', status: 200, host: 'cdn.acme.dev', path: '/img/hero@2x.webp', size: '88.1 kB', ms: 64, mock: false },
  { method: 'GET', status: 304, host: 'api.acme.dev', path: '/v2/profile/me', size: '0 B', ms: 41, mock: false },
  { method: 'POST', status: 200, host: 'auth.acme.dev', path: '/oauth/token', size: '1.1 kB', ms: 312, mock: false },
  { method: 'GET', status: 200, host: 'api.acme.dev', path: '/v2/flags', size: '2.4 kB', ms: 22, mock: true },
  { method: 'DELETE', status: 204, host: 'api.acme.dev', path: '/v2/cart/items/88', size: '0 B', ms: 97, mock: false },
  { method: 'GET', status: 500, host: 'pay.acme.dev', path: '/charges/ch_19x', size: '340 B', ms: 884, mock: false },
  { method: 'PATCH', status: 200, host: 'api.acme.dev', path: '/v2/settings', size: '764 B', ms: 156, mock: false },
  { method: 'GET', status: 200, host: 'api.acme.dev', path: '/v2/notifications', size: '6.8 kB', ms: 73, mock: true },
];

const MAX_ROWS = 8;

export default function TrafficPreview() {
  const { t } = useT();
  const seed = useRef(0);
  const cursor = useRef(0);
  const [rows, setRows] = useState<Row[]>(() => samples.slice(0, MAX_ROWS).map((s, i) => ({ ...s, id: i })));

  useEffect(() => {
    if (prefersReduced) return;
    seed.current = MAX_ROWS;
    cursor.current = MAX_ROWS % samples.length;
    const id = window.setInterval(() => {
      const next = { ...samples[cursor.current], id: ++seed.current };
      cursor.current = (cursor.current + 1) % samples.length;
      setRows((prev) => [next, ...prev].slice(0, MAX_ROWS));
    }, 1900);
    return () => window.clearInterval(id);
  }, []);

  return (
    <AppWindow title={<Live label={t.stream.label} />} port=":8888">
      <div className="divide-y divide-zinc-800/60 font-mono text-[12.5px]">
        {rows.map((r) => (
          <div
            key={r.id}
            className={`flex items-center gap-3 px-4 py-2.5 ${r.id >= MAX_ROWS && !prefersReduced ? 'row-arrive' : ''}`}
          >
            <span className="w-14">
              <MethodChip method={r.method} />
            </span>
            <span className={`w-9 shrink-0 tabular-nums ${statusColor(r.status)}`}>{r.status}</span>
            <span className="min-w-0 flex-1 truncate">
              <span className="text-zinc-500">{r.host}</span>
              <span className="text-zinc-300">{r.path}</span>
            </span>
            {r.mock && (
              <span className="hidden shrink-0 items-center gap-1 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-400/30 sm:flex">
                ⚡ MOCK
              </span>
            )}
            <span className="hidden w-16 shrink-0 text-right text-zinc-600 sm:block">{r.size}</span>
            <span className="w-12 shrink-0 text-right tabular-nums text-zinc-500">{r.ms}ms</span>
          </div>
        ))}
      </div>
    </AppWindow>
  );
}
