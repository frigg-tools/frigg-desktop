import type { SqlEngine } from '@frigg/shared';
import { useT } from '../../i18n';

interface EngineBadgeProps {
  engine: SqlEngine;
}

const ENGINE_STYLES: Record<SqlEngine, string> = {
  mysql: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  mariadb: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  postgres: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
  sqlite: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
};

export default function EngineBadge({ engine }: EngineBadgeProps) {
  const t = useT();
  return (
    <span
      className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide ${ENGINE_STYLES[engine]}`}
    >
      {t(`sql.engine.${engine}`)}
    </span>
  );
}
