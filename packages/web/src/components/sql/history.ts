const HISTORY_KEY = 'frigg-sql-history';
const MAX_HISTORY = 50;

export function getSqlHistory(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

export function recordSqlHistory(sql: string): void {
  const trimmed = sql.trim();
  if (trimmed === '') return;
  try {
    const next = [trimmed, ...getSqlHistory().filter((entry) => entry !== trimmed)].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    return;
  }
}
