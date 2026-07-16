import { deriveProxyState } from '@frigg/shared';
import { describe, expect, it } from 'vitest';
import { parseWlan0Ip } from '../src/devices/android.ts';

describe('parseWlan0Ip', () => {
  it('extracts the IPv4 address from `ip -o -f inet addr show wlan0` output', () => {
    const raw =
      '30: wlan0    inet 192.168.15.21/24 brd 192.168.15.255 scope global wlan0\\       valid_lft forever preferred_lft forever';
    expect(parseWlan0Ip(raw)).toBe('192.168.15.21');
  });

  it('returns undefined when there is no inet line', () => {
    expect(parseWlan0Ip('30: wlan0    inet6 fe80::1/64 scope link')).toBeUndefined();
  });

  it('returns undefined for empty output', () => {
    expect(parseWlan0Ip('')).toBeUndefined();
  });
});

describe('deriveProxyState', () => {
  const friggAddr = '192.168.15.5:8888';

  it('is "frigg" when the device proxy points at this Frigg', () => {
    expect(deriveProxyState('192.168.15.5:8888', friggAddr)).toBe('frigg');
  });

  it('is "other" when the proxy points somewhere else', () => {
    expect(deriveProxyState('10.0.0.9:8080', friggAddr)).toBe('other');
  });

  it('is "off" for empty, null, or :0', () => {
    expect(deriveProxyState('', friggAddr)).toBe('off');
    expect(deriveProxyState(undefined, friggAddr)).toBe('off');
    expect(deriveProxyState(':0', friggAddr)).toBe('off');
    expect(deriveProxyState('null', friggAddr)).toBe('off');
  });

  it('is "other" when Frigg has no known address (cannot confirm a match)', () => {
    expect(deriveProxyState('192.168.15.5:8888', null)).toBe('other');
  });
});
