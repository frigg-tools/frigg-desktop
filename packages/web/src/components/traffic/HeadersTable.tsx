import { useT } from '../../i18n';
import { flattenHeaders } from './format';

export default function HeadersTable({
  headers,
}: {
  headers: Record<string, string | string[]>;
}) {
  const t = useT();
  const entries = flattenHeaders(headers);
  if (entries.length === 0) {
    return <p className="px-4 text-xs text-zinc-600">{t('traffic.noHeaders')}</p>;
  }
  return (
    <div className="px-4">
      <div className="overflow-hidden rounded-md border border-zinc-800/80">
        {entries.map(([name, value], index) => (
          <div
            key={`${name}-${index}`}
            className={`flex gap-3 px-2.5 py-1.5 font-mono text-xs ${
              index % 2 === 1 ? 'bg-zinc-900/50' : ''
            }`}
          >
            <span className="w-44 shrink-0 break-all text-zinc-500">{name}</span>
            <span className="min-w-0 break-all text-zinc-300">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
