import type { MockRule } from '@frigg/shared';

const REGEX_SPECIAL_CHARS = /[.+^${}()|[\]\\]/;

const compiledGlobCache = new Map<string, RegExp>();

export function globToRegex(pattern: string): RegExp {
  const cached = compiledGlobCache.get(pattern);
  if (cached) return cached;
  let source = '^';
  let prevWasStar = false;
  for (const char of pattern) {
    if (char === '*') {
      if (!prevWasStar) source += '[\\s\\S]*';
      prevWasStar = true;
      continue;
    }
    prevWasStar = false;
    if (char === '?') {
      source += '[\\s\\S]';
    } else if (REGEX_SPECIAL_CHARS.test(char)) {
      source += `\\${char}`;
    } else {
      source += char;
    }
  }
  const compiled = new RegExp(`${source}$`, 'i');
  if (compiledGlobCache.size > 1000) compiledGlobCache.clear();
  compiledGlobCache.set(pattern, compiled);
  return compiled;
}

export interface MatchInput {
  method: string;
  host: string;
  path: string;
  query: string;
  bodyText: string;
}

function stripQueryString(path: string): string {
  const queryStart = path.indexOf('?');
  return queryStart === -1 ? path : path.slice(0, queryStart);
}

export function ruleMatches(rule: MockRule, input: MatchInput): boolean {
  const matcher = rule.matcher;
  if (matcher.method && matcher.method.toUpperCase() !== input.method.toUpperCase()) {
    return false;
  }
  if (matcher.hostPattern && !globToRegex(matcher.hostPattern).test(input.host)) {
    return false;
  }
  if (!globToRegex(matcher.pathPattern).test(stripQueryString(input.path))) {
    return false;
  }
  if (matcher.queryContains && !input.query.includes(matcher.queryContains)) {
    return false;
  }
  const bodyMatch = matcher.bodyMatch;
  if (bodyMatch && bodyMatch.mode !== 'none') {
    const expected = bodyMatch.value ?? '';
    if (bodyMatch.mode === 'contains' && !input.bodyText.includes(expected)) {
      return false;
    }
    if (bodyMatch.mode === 'exact' && input.bodyText !== expected) {
      return false;
    }
  }
  return true;
}

export function pickRule(rules: MockRule[], input: MatchInput): MockRule | undefined {
  const candidates = rules
    .filter((rule) => rule.enabled)
    .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
  return candidates.find((rule) => ruleMatches(rule, input));
}
