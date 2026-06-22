import { type SqlCommandKind, type SqlEngine } from '@frigg/shared';

export interface SqlAnalysis {
  kind: SqlCommandKind;
  destructive: boolean;
  effectiveSql: string;
  limited: boolean;
}

function stripLeading(sql: string): string {
  let s = sql.trim();
  while (true) {
    if (s.startsWith('--')) { const nl = s.indexOf('\n'); s = nl === -1 ? '' : s.slice(nl + 1).trimStart(); continue; }
    if (s.startsWith('/*')) { const end = s.indexOf('*/'); s = end === -1 ? '' : s.slice(end + 2).trimStart(); continue; }
    if (s.startsWith('(')) { s = s.slice(1).trimStart(); continue; }
    return s;
  }
}

const READ = /^(select|with|show|explain|pragma|describe|desc)\b/i;
const WRITE = /^(insert|update|delete|replace|merge|upsert)\b/i;
const DDL = /^(create|alter|drop|truncate|rename)\b/i;

function classify(head: string): SqlCommandKind {
  if (READ.test(head)) return 'read';
  if (WRITE.test(head)) return 'write';
  if (DDL.test(head)) return 'ddl';
  return 'other';
}

function isDestructive(head: string): boolean {
  if (/^(drop|truncate)\b/i.test(head)) return true;
  if (/^(update|delete)\b/i.test(head) && !/\bwhere\b/i.test(head)) return true;
  return false;
}

export function analyzeSql(sql: string, opts: { engine: SqlEngine; rowLimit: number }): SqlAnalysis {
  const head = stripLeading(sql);
  const kind = classify(head);
  const destructive = isDestructive(head);
  const isPlainSelect = /^(select|with)\b/i.test(head) && !/\blimit\b/i.test(head);
  const trimmedNoSemi = sql.trim().replace(/;\s*$/, '');
  const effectiveSql = isPlainSelect ? `${trimmedNoSemi} LIMIT ${opts.rowLimit + 1}` : sql.trim();
  return { kind, destructive, effectiveSql, limited: isPlainSelect };
}
