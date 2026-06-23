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

const READ_HEAD = /^(select|with|show|explain|pragma|describe|desc)\b/i;
const WRITE_WORDS = new Set(['insert', 'update', 'delete', 'replace', 'merge', 'upsert']);
const DDL_WORDS = new Set(['create', 'alter', 'drop', 'truncate', 'rename']);

function topLevelTokens(cleaned: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let word = '';
  const push = () => {
    if (word !== '') {
      tokens.push(word.toLowerCase());
      word = '';
    }
  };
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '(') {
      push();
      depth++;
      continue;
    }
    if (ch === ')') {
      push();
      if (depth > 0) depth--;
      continue;
    }
    if (depth === 0 && /[A-Za-z0-9_]/.test(ch)) {
      word += ch;
      continue;
    }
    push();
  }
  push();
  return tokens;
}

function classify(head: string, tokens: string[]): SqlCommandKind {
  if (/^with\b/i.test(head)) {
    if (tokens.some((token) => WRITE_WORDS.has(token))) return 'write';
    if (tokens.some((token) => DDL_WORDS.has(token))) return 'ddl';
    return 'read';
  }
  if (READ_HEAD.test(head)) return 'read';
  const first = tokens[0] ?? '';
  if (WRITE_WORDS.has(first)) return 'write';
  if (DDL_WORDS.has(first)) return 'ddl';
  return 'other';
}

function isDestructive(kind: SqlCommandKind, tokens: string[]): boolean {
  if (tokens.includes('drop') || tokens.includes('truncate')) return true;
  if (kind === 'write' && (tokens.includes('delete') || tokens.includes('update')) && !tokens.includes('where')) {
    return true;
  }
  return false;
}

export function analyzeSql(sql: string, opts: { engine: SqlEngine; rowLimit: number }): SqlAnalysis {
  const cleaned = stripNoise(sql);
  const head = stripLeading(cleaned);
  const tokens = topLevelTokens(cleaned);
  const kind = classify(head, tokens);
  const destructive = isDestructive(kind, tokens);
  const isPlainSelect = kind === 'read' && /^(select|with)\b/i.test(head) && !tokens.includes('limit');
  const trimmedNoSemi = sql.trim().replace(/;\s*$/, '');
  const effectiveSql = isPlainSelect ? `${trimmedNoSemi} LIMIT ${opts.rowLimit + 1}` : sql.trim();
  return { kind, destructive, effectiveSql, limited: isPlainSelect };
}
