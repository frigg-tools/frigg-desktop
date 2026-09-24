import { describe, expect, it } from 'vitest';
import { automationRequestAllowed } from './access.ts';

const ports = { configuredUiPort: 5173, apiPort: 4848 };

describe('automationRequestAllowed', () => {
  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])(
    'allows loopback caller %s with a local API host and no Origin',
    (remoteAddress) => {
      expect(automationRequestAllowed({ remoteAddress, host: 'localhost:4848', ...ports })).toBe(true);
    },
  );

  it('allows the local web UI origin through a local API host', () => {
    expect(automationRequestAllowed({
      remoteAddress: '::ffff:127.0.0.1',
      host: '127.0.0.1:4848',
      origin: 'http://localhost:5173',
      ...ports,
    })).toBe(true);
  });

  it('allows same-origin calls made by the web development proxy', () => {
    expect(automationRequestAllowed({
      remoteAddress: '127.0.0.1',
      host: 'localhost:5173',
      origin: 'http://localhost:5173',
      ...ports,
    })).toBe(true);
  });

  it.each([
    { remoteAddress: '192.168.1.20', host: 'localhost:4848' },
    { remoteAddress: '127.0.0.1', host: 'frigg.example:4848' },
    { remoteAddress: '127.0.0.1', host: 'localhost:9999' },
    { remoteAddress: '127.0.0.1', host: 'localhost:4848', origin: 'https://attacker.example' },
    { remoteAddress: '127.0.0.1', host: 'localhost:4848', origin: 'null' },
  ])('rejects non-local or mismatched request metadata %#', (request) => {
    expect(automationRequestAllowed({ ...request, ...ports })).toBe(false);
  });

  it('does not treat forwarded headers as a loopback identity', () => {
    expect(automationRequestAllowed({
      remoteAddress: '203.0.113.10',
      host: 'localhost:4848',
      forwardedFor: '127.0.0.1',
      ...ports,
    })).toBe(false);
  });
});
