import type { DbQueryResult } from '@frigg/shared';
import { DB_ROW_LIMIT } from '@frigg/shared';
import { useT } from '../../i18n';

interface DatabaseResultsTableProps {
  result: DbQueryResult;
}

function DatabaseCell({ value }: { value: string | number | null }) {
  if (value === null) {
    return <span className="italic text-zinc-700">NULL</span>;
  }
  const text = String(value);
  return (
    <span className="block max-w-[28rem] truncate" title={text}>
      {text}
    </span>
  );
}

export default function DatabaseResultsTable({ result }: DatabaseResultsTableProps) {
  const t = useT();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-zinc-800/80 bg-zinc-950/60 px-4 py-1.5">
        <span className="font-mono text-[10px] tabular-nums text-zinc-500">
          {t('database.results.rowCount', { count: result.rowCount })}
        </span>
        {result.truncated ? (
          <span className="rounded border border-amber-500/30 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-amber-400">
            {t('database.results.truncated', { limit: DB_ROW_LIMIT })}
          </span>
        ) : null}
      </div>
      {result.rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="font-mono text-[13px] text-zinc-600">{t('database.results.empty')}</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse font-mono text-[12px]">
            <thead className="sticky top-0 z-10 bg-zinc-950">
              <tr>
                {result.columns.map((column) => (
                  <th
                    key={column}
                    className="border-b border-zinc-800 px-3 py-1.5 text-left font-semibold tracking-wide text-zinc-400 whitespace-nowrap"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-zinc-900/70 hover:bg-zinc-900/40">
                  {result.columns.map((column, columnIndex) => (
                    <td
                      key={column}
                      className="px-3 py-1 align-top text-zinc-300 tabular-nums"
                    >
                      <DatabaseCell value={row[columnIndex] ?? null} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
