import { describe, expect, it } from 'vitest';
import { parseAndroidLogcatLine } from '../src/logcat/parse-android.ts';
import { parseIosLogLine } from '../src/logcat/parse-ios.ts';

describe('parseAndroidLogcatLine', () => {
  it('parses a verbose threadtime line', () => {
    const entry = parseAndroidLogcatLine('06-12 10:11:12.345  1234  5678 V ActivityManager: started');
    expect(entry).not.toBeNull();
    expect(entry?.level).toBe('V');
    expect(entry?.tag).toBe('ActivityManager');
    expect(entry?.pid).toBe(1234);
    expect(entry?.message).toBe('started');
    expect(entry?.raw).toBe('06-12 10:11:12.345  1234  5678 V ActivityManager: started');
  });

  it('maps every supported level token', () => {
    const levels: Array<['V' | 'D' | 'I' | 'W' | 'E' | 'F', string]> = [
      ['V', 'V'],
      ['D', 'D'],
      ['I', 'I'],
      ['W', 'W'],
      ['E', 'E'],
      ['F', 'F'],
    ];
    for (const [token, expected] of levels) {
      const entry = parseAndroidLogcatLine(`01-02 03:04:05.006  10  20 ${token} Tag: msg`);
      expect(entry?.level).toBe(expected);
    }
  });

  it('preserves colons inside the message', () => {
    const entry = parseAndroidLogcatLine('06-12 10:11:12.345  1234  5678 I OkHttp: GET https://api.example.com:443/v1');
    expect(entry?.tag).toBe('OkHttp');
    expect(entry?.message).toBe('GET https://api.example.com:443/v1');
  });

  it('tolerates extra spacing between columns', () => {
    const entry = parseAndroidLogcatLine('06-12 10:11:12.345    999    111   W   MyTag :  spaced message ');
    expect(entry).not.toBeNull();
    expect(entry?.level).toBe('W');
    expect(entry?.tag).toBe('MyTag');
    expect(entry?.pid).toBe(999);
    expect(entry?.message).toBe(' spaced message ');
  });

  it('computes a timestamp in the current year', () => {
    const entry = parseAndroidLogcatLine('06-12 10:11:12.345  1234  5678 I Tag: ok');
    expect(entry).not.toBeNull();
    const date = new Date(entry!.timestamp);
    expect(date.getFullYear()).toBe(new Date().getFullYear());
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(12);
  });

  it('returns null for the beginning-of separator lines', () => {
    expect(parseAndroidLogcatLine('--------- beginning of main')).toBeNull();
    expect(parseAndroidLogcatLine('--------- beginning of system')).toBeNull();
  });

  it('returns null for unrelated lines', () => {
    expect(parseAndroidLogcatLine('')).toBeNull();
    expect(parseAndroidLogcatLine('not a logcat line at all')).toBeNull();
  });
});

describe('parseIosLogLine', () => {
  it('extracts level and process from a compact line', () => {
    const entry = parseIosLogLine('10:11:12.345678 0x1a2b Error  0x0  501  MyApp: connection failed');
    expect(entry).not.toBeNull();
    expect(entry?.level).toBe('E');
    expect(entry?.raw).toBe('10:11:12.345678 0x1a2b Error  0x0  501  MyApp: connection failed');
  });

  it('maps the default type to info', () => {
    const entry = parseIosLogLine('10:11:12.345678 0x1a2b Default  0x0  501  daemon: heartbeat');
    expect(entry?.level).toBe('I');
  });

  it('skips header and blank lines', () => {
    expect(parseIosLogLine('')).toBeNull();
    expect(parseIosLogLine('Filtering the log data using "process CONTAINS \\"MyApp\\""')).toBeNull();
    expect(parseIosLogLine('Timestamp               Thread     Type')).toBeNull();
  });

  it('falls back to an info entry for unstructured lines', () => {
    const entry = parseIosLogLine('some freeform diagnostic text');
    expect(entry).not.toBeNull();
    expect(entry?.level).toBe('I');
    expect(entry?.message).toBe('some freeform diagnostic text');
  });
});
