import { describe, expect, it } from 'vitest';
import type { MockMatcher, MockRule } from '@frigg/shared';
import { globToRegex, pickRule, ruleMatches, type MatchInput } from '../src/mocks/matcher.ts';

let ruleSequence = 0;

function buildRule(
  matcher: Partial<MockMatcher> = {},
  overrides: Partial<Omit<MockRule, 'matcher'>> = {},
): MockRule {
  ruleSequence += 1;
  return {
    id: `rule-${ruleSequence}`,
    folderId: null,
    name: `rule ${ruleSequence}`,
    enabled: true,
    priority: 0,
    matcher: { pathPattern: '*', ...matcher },
    response: { statusCode: 200, headers: {}, body: '' },
    createdAt: ruleSequence,
    updatedAt: ruleSequence,
    hitCount: 0,
    ...overrides,
  };
}

function buildInput(overrides: Partial<MatchInput> = {}): MatchInput {
  return {
    method: 'GET',
    host: 'api.example.com',
    path: '/users',
    query: '',
    bodyText: '',
    ...overrides,
  };
}

describe('globToRegex', () => {
  it('matches everything with a lone star, including empty string and slashes', () => {
    const regex = globToRegex('*');
    expect(regex.test('')).toBe(true);
    expect(regex.test('anything')).toBe(true);
    expect(regex.test('a/b/c')).toBe(true);
    expect(regex.test('line1\nline2')).toBe(true);
  });

  it('lets a star span zero or more characters including slashes mid-pattern', () => {
    const regex = globToRegex('/api/*/users');
    expect(regex.test('/api//users')).toBe(true);
    expect(regex.test('/api/v1/users')).toBe(true);
    expect(regex.test('/api/v1/extra/users')).toBe(true);
    expect(regex.test('/api/v1/users/42')).toBe(false);
  });

  it('coalesces consecutive stars so matching stays linear (no catastrophic backtracking)', () => {
    const regex = globToRegex('**********x');
    const nonMatching = `${'a'.repeat(50)}`;
    const start = process.hrtime.bigint();
    expect(regex.test(nonMatching)).toBe(false);
    expect(regex.test(`${'a'.repeat(50)}x`)).toBe(true);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    expect(elapsedMs).toBeLessThan(50);
  });

  it('matches exactly one character with a question mark', () => {
    const regex = globToRegex('a?c');
    expect(regex.test('abc')).toBe(true);
    expect(regex.test('a/c')).toBe(true);
    expect(regex.test('ac')).toBe(false);
    expect(regex.test('abbc')).toBe(false);
  });

  it('requires one character for a lone question mark', () => {
    const regex = globToRegex('?');
    expect(regex.test('x')).toBe(true);
    expect(regex.test('')).toBe(false);
    expect(regex.test('xy')).toBe(false);
  });

  it('escapes regex special characters', () => {
    expect(globToRegex('a.b').test('a.b')).toBe(true);
    expect(globToRegex('a.b').test('aXb')).toBe(false);
    expect(globToRegex('(group)').test('(group)')).toBe(true);
    expect(globToRegex('price+tax').test('price+tax')).toBe(true);
    expect(globToRegex('price+tax').test('priceetax')).toBe(false);
    expect(globToRegex('[set]').test('[set]')).toBe(true);
    expect(globToRegex('[set]').test('s')).toBe(false);
    expect(globToRegex('a|b').test('a|b')).toBe(true);
    expect(globToRegex('a|b').test('a')).toBe(false);
    expect(globToRegex('a{2}').test('a{2}')).toBe(true);
    expect(globToRegex('a{2}').test('aa')).toBe(false);
    expect(globToRegex('a^b$c').test('a^b$c')).toBe(true);
    expect(globToRegex('back\\slash').test('back\\slash')).toBe(true);
  });

  it('anchors the pattern at both ends', () => {
    const regex = globToRegex('foo');
    expect(regex.test('foo')).toBe(true);
    expect(regex.test('xfoo')).toBe(false);
    expect(regex.test('foox')).toBe(false);
    expect(regex.test('foofoo')).toBe(false);
  });

  it('matches case-insensitively', () => {
    expect(globToRegex('API.Example.COM').test('api.example.com')).toBe(true);
    expect(globToRegex('*.example.com').test('CDN.EXAMPLE.COM')).toBe(true);
  });

  it('combines stars and question marks', () => {
    const regex = globToRegex('/v?/items/*');
    expect(regex.test('/v1/items/')).toBe(true);
    expect(regex.test('/v2/items/9/details')).toBe(true);
    expect(regex.test('/v10/items/9')).toBe(false);
  });
});

describe('ruleMatches', () => {
  it('treats undefined method as any', () => {
    const rule = buildRule({ method: undefined });
    expect(ruleMatches(rule, buildInput({ method: 'GET' }))).toBe(true);
    expect(ruleMatches(rule, buildInput({ method: 'DELETE' }))).toBe(true);
  });

  it('treats empty method as any', () => {
    const rule = buildRule({ method: '' });
    expect(ruleMatches(rule, buildInput({ method: 'POST' }))).toBe(true);
  });

  it('compares methods upper-cased', () => {
    const rule = buildRule({ method: 'post' });
    expect(ruleMatches(rule, buildInput({ method: 'POST' }))).toBe(true);
    expect(ruleMatches(rule, buildInput({ method: 'post' }))).toBe(true);
    expect(ruleMatches(rule, buildInput({ method: 'GET' }))).toBe(false);
  });

  it('treats undefined or empty host pattern as any host', () => {
    expect(ruleMatches(buildRule({ hostPattern: undefined }), buildInput({ host: 'a.b.c' }))).toBe(true);
    expect(ruleMatches(buildRule({ hostPattern: '' }), buildInput({ host: 'a.b.c' }))).toBe(true);
  });

  it('matches host patterns as globs, case-insensitively', () => {
    const rule = buildRule({ hostPattern: '*.example.com' });
    expect(ruleMatches(rule, buildInput({ host: 'api.example.com' }))).toBe(true);
    expect(ruleMatches(rule, buildInput({ host: 'API.EXAMPLE.COM' }))).toBe(true);
    expect(ruleMatches(rule, buildInput({ host: 'example.com' }))).toBe(false);
    expect(ruleMatches(rule, buildInput({ host: 'api.example.org' }))).toBe(false);
  });

  it('matches the path pattern against the path', () => {
    const rule = buildRule({ pathPattern: '/users/*' });
    expect(ruleMatches(rule, buildInput({ path: '/users/42' }))).toBe(true);
    expect(ruleMatches(rule, buildInput({ path: '/users/' }))).toBe(true);
    expect(ruleMatches(rule, buildInput({ path: '/accounts/42' }))).toBe(false);
  });

  it('ignores any query string embedded in the path', () => {
    const rule = buildRule({ pathPattern: '/users/42' });
    expect(ruleMatches(rule, buildInput({ path: '/users/42?page=2' }))).toBe(true);
    expect(ruleMatches(rule, buildInput({ path: '/users/42' }))).toBe(true);
  });

  it('requires the path pattern to match the full path', () => {
    const rule = buildRule({ pathPattern: '/users' });
    expect(ruleMatches(rule, buildInput({ path: '/users/42' }))).toBe(false);
  });

  it('checks queryContains as a raw substring of the query', () => {
    const rule = buildRule({ queryContains: 'page=2' });
    expect(ruleMatches(rule, buildInput({ query: 'limit=10&page=2' }))).toBe(true);
    expect(ruleMatches(rule, buildInput({ query: 'page=20' }))).toBe(true);
    expect(ruleMatches(rule, buildInput({ query: 'page=3' }))).toBe(false);
    expect(ruleMatches(rule, buildInput({ query: '' }))).toBe(false);
  });

  it('ignores the query when queryContains is undefined or empty', () => {
    expect(ruleMatches(buildRule({ queryContains: undefined }), buildInput({ query: 'a=1' }))).toBe(true);
    expect(ruleMatches(buildRule({ queryContains: '' }), buildInput({ query: '' }))).toBe(true);
  });

  it('ignores the body when bodyMatch is undefined or mode is none', () => {
    expect(ruleMatches(buildRule({ bodyMatch: undefined }), buildInput({ bodyText: 'whatever' }))).toBe(true);
    const noneRule = buildRule({ bodyMatch: { mode: 'none', value: 'must-not-apply' } });
    expect(ruleMatches(noneRule, buildInput({ bodyText: 'unrelated' }))).toBe(true);
  });

  it('checks bodyMatch contains as a substring', () => {
    const rule = buildRule({ bodyMatch: { mode: 'contains', value: '"id":7' } });
    expect(ruleMatches(rule, buildInput({ bodyText: '{"id":7,"name":"x"}' }))).toBe(true);
    expect(ruleMatches(rule, buildInput({ bodyText: '{"id":8}' }))).toBe(false);
  });

  it('checks bodyMatch exact as strict equality', () => {
    const rule = buildRule({ bodyMatch: { mode: 'exact', value: 'token=abc' } });
    expect(ruleMatches(rule, buildInput({ bodyText: 'token=abc' }))).toBe(true);
    expect(ruleMatches(rule, buildInput({ bodyText: 'token=abc ' }))).toBe(false);
    expect(ruleMatches(rule, buildInput({ bodyText: '' }))).toBe(false);
  });

  it('treats a missing bodyMatch value as empty string', () => {
    expect(ruleMatches(buildRule({ bodyMatch: { mode: 'contains' } }), buildInput({ bodyText: 'anything' }))).toBe(true);
    expect(ruleMatches(buildRule({ bodyMatch: { mode: 'exact' } }), buildInput({ bodyText: '' }))).toBe(true);
    expect(ruleMatches(buildRule({ bodyMatch: { mode: 'exact' } }), buildInput({ bodyText: 'x' }))).toBe(false);
  });

  it('requires every configured matcher field to pass', () => {
    const rule = buildRule({
      method: 'POST',
      hostPattern: 'api.*',
      pathPattern: '/login',
      queryContains: 'lang=en',
      bodyMatch: { mode: 'contains', value: 'user' },
    });
    const matching = buildInput({
      method: 'POST',
      host: 'api.service.io',
      path: '/login',
      query: 'lang=en&v=2',
      bodyText: '{"user":"g"}',
    });
    expect(ruleMatches(rule, matching)).toBe(true);
    expect(ruleMatches(rule, { ...matching, method: 'GET' })).toBe(false);
    expect(ruleMatches(rule, { ...matching, host: 'web.service.io' })).toBe(false);
    expect(ruleMatches(rule, { ...matching, path: '/logout' })).toBe(false);
    expect(ruleMatches(rule, { ...matching, query: 'lang=pt' })).toBe(false);
    expect(ruleMatches(rule, { ...matching, bodyText: '{}' })).toBe(false);
  });
});

describe('pickRule', () => {
  it('returns undefined for an empty list or when nothing matches', () => {
    expect(pickRule([], buildInput())).toBeUndefined();
    const rule = buildRule({ pathPattern: '/other' });
    expect(pickRule([rule], buildInput({ path: '/users' }))).toBeUndefined();
  });

  it('skips disabled rules even when they match', () => {
    const disabled = buildRule({}, { enabled: false, priority: 100 });
    const enabled = buildRule({}, { priority: 0 });
    expect(pickRule([disabled, enabled], buildInput())?.id).toBe(enabled.id);
    expect(pickRule([disabled], buildInput())).toBeUndefined();
  });

  it('prefers higher priority regardless of array order', () => {
    const low = buildRule({}, { priority: 1 });
    const high = buildRule({}, { priority: 10 });
    expect(pickRule([low, high], buildInput())?.id).toBe(high.id);
    expect(pickRule([high, low], buildInput())?.id).toBe(high.id);
  });

  it('breaks priority ties by older createdAt first', () => {
    const older = buildRule({}, { priority: 5, createdAt: 100 });
    const newer = buildRule({}, { priority: 5, createdAt: 200 });
    expect(pickRule([newer, older], buildInput())?.id).toBe(older.id);
    expect(pickRule([older, newer], buildInput())?.id).toBe(older.id);
  });

  it('falls through non-matching high-priority rules to a matching lower one', () => {
    const highNonMatching = buildRule({ pathPattern: '/other' }, { priority: 100 });
    const lowMatching = buildRule({ pathPattern: '/users' }, { priority: 1 });
    expect(pickRule([highNonMatching, lowMatching], buildInput({ path: '/users' }))?.id).toBe(lowMatching.id);
  });

  it('does not mutate the input array', () => {
    const first = buildRule({}, { priority: 1 });
    const second = buildRule({}, { priority: 10 });
    const rules = [first, second];
    pickRule(rules, buildInput());
    expect(rules[0]).toBe(first);
    expect(rules[1]).toBe(second);
  });
});
