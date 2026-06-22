import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultAndroidSdkRoot, parseAvdList } from '../src/devices/avd.ts';
import { mapAbi } from '../src/frida/frida-server-manager.ts';

describe('mapAbi', () => {
  it('maps device ABIs to frida-server release ABIs', () => {
    expect(mapAbi('arm64-v8a')).toBe('arm64');
    expect(mapAbi('armeabi-v7a')).toBe('arm');
    expect(mapAbi('x86_64')).toBe('x86_64');
    expect(mapAbi('x86')).toBe('x86');
  });

  it('returns null for unknown ABIs', () => {
    expect(mapAbi('mips')).toBeNull();
    expect(mapAbi('')).toBeNull();
  });
});

describe('defaultAndroidSdkRoot', () => {
  it('resolves the per-platform default SDK location', () => {
    expect(defaultAndroidSdkRoot('win32', 'C:\\Users\\dev')).toBe(
      join('C:\\Users\\dev', 'AppData', 'Local', 'Android', 'Sdk'),
    );
    expect(defaultAndroidSdkRoot('darwin', '/Users/dev')).toBe(
      join('/Users/dev', 'Library', 'Android', 'sdk'),
    );
    expect(defaultAndroidSdkRoot('linux', '/home/dev')).toBe(
      join('/home/dev', 'Android', 'Sdk'),
    );
  });
});

describe('parseAvdList', () => {
  it('returns the AVD names, one per line', () => {
    expect(parseAvdList('Pixel_7a_36\nsd_pentest_root\nIC_Play_10_-_29\n')).toEqual([
      'Pixel_7a_36',
      'sd_pentest_root',
      'IC_Play_10_-_29',
    ]);
  });

  it('drops blank lines and emulator warning/info lines', () => {
    const stdout = [
      'INFO    | Storing crashdata in: /tmp/x',
      '',
      'Pixel_7a_36',
      'Some warning with spaces',
      'Medium_Tablet',
    ].join('\n');
    expect(parseAvdList(stdout)).toEqual(['Pixel_7a_36', 'Medium_Tablet']);
  });
});
