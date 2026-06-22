import { type SqlCommandKind, type SqlEngine } from '@frigg/shared';

export interface SqlAnalysis {
  kind: SqlCommandKind;
  destructive: boolean;
  effectiveSql: string;
  limited: boolean;
}

function stripNoise(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i++;
      while (i < sql.length) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      out += ' ';
      continue;
    }
    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      out += ' ';
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

export function hasMultipleStatements(sql: string): boolean {
  return (
    stripNoise(sql)
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part !== '').length > 1
  );
}

function stripLeading(sql: string): string {
  let s = sql.trim();
  while (true) {
    if (s.startsWith('(')) {
      s = s.slice(1).trimStart();
      continue;
    }
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
  const head = stripLeading(stripNoise(sql));
  const kind = classify(head);
  const destructive = isDestructive(head);
  const isPlainSelect = /^(select|with)\b/i.test(head) && !/\blimit\b/i.test(head);
  const trimmedNoSemi = sql.trim().replace(/;\s*$/, '');
  const effectiveSql = isPlainSelect ? `${trimmedNoSemi} LIMIT ${opts.rowLimit + 1}` : sql.trim();
  return { kind, destructive, effectiveSql, limited: isPlainSelect };
}
