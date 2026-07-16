import { describe, expect, it } from 'vitest';
import { CertTrustTracker } from '../src/devices/cert-trust-tracker.ts';

const WINDOW = 600_000;

describe('CertTrustTracker', () => {
  it('reports no trust and no timestamp for an unknown IP', () => {
    const tracker = new CertTrustTracker();
    expect(tracker.isTrusted('192.168.15.21', 1_000, WINDOW)).toBe(false);
    expect(tracker.lastDecryptedAt('192.168.15.21')).toBeUndefined();
  });

  it('trusts an IP that decrypted HTTPS within the window', () => {
    const tracker = new CertTrustTracker();
    tracker.recordDecryptedHttps('192.168.15.21', 1_000);
    expect(tracker.lastDecryptedAt('192.168.15.21')).toBe(1_000);
    expect(tracker.isTrusted('192.168.15.21', 1_000 + WINDOW - 1, WINDOW)).toBe(true);
  });

  it('stops trusting once the freshness window has elapsed', () => {
    const tracker = new CertTrustTracker();
    tracker.recordDecryptedHttps('192.168.15.21', 1_000);
    expect(tracker.isTrusted('192.168.15.21', 1_000 + WINDOW + 1, WINDOW)).toBe(false);
  });

  it('keeps the most recent decryption timestamp per IP', () => {
    const tracker = new CertTrustTracker();
    tracker.recordDecryptedHttps('192.168.15.21', 1_000);
    tracker.recordDecryptedHttps('192.168.15.21', 5_000);
    expect(tracker.lastDecryptedAt('192.168.15.21')).toBe(5_000);
  });

  it('tracks IPs independently', () => {
    const tracker = new CertTrustTracker();
    tracker.recordDecryptedHttps('192.168.15.21', 1_000);
    expect(tracker.lastDecryptedAt('192.168.15.99')).toBeUndefined();
    expect(tracker.isTrusted('192.168.15.99', 1_000, WINDOW)).toBe(false);
  });

  it('ignores an undefined client address', () => {
    const tracker = new CertTrustTracker();
    tracker.recordDecryptedHttps(undefined, 1_000);
    expect(tracker.lastDecryptedAt(undefined)).toBeUndefined();
  });

  it('normalizes IPv4-mapped IPv6 addresses so they match the plain device IP', () => {
    const tracker = new CertTrustTracker();
    tracker.recordDecryptedHttps('::ffff:192.168.15.21', 1_000);
    expect(tracker.lastDecryptedAt('192.168.15.21')).toBe(1_000);
    expect(tracker.isTrusted('192.168.15.21', 1_000, WINDOW)).toBe(true);
  });
});
