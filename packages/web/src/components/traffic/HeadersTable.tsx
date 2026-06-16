import { useT } from '../../i18n';
import { flattenHeaders } from './format';
import { highlightMatches } from './find';

export default function HeadersTable({
  headers,
  query,
}: {
  headers: Record<string, string | string[]>;
  query?: string;
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
            <span className="w-44 shrink-0 break-all text-zinc-500">
              {query ? highlightMatches(name, query) : name}
            </span>
            <span className="min-w-0 break-all text-zinc-300">
              {query ? highlightMatches(value, query) : value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
