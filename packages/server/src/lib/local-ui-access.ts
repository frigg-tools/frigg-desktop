import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';

export interface LocalUiRequestMetadata {
  remoteAddress?: string;
  host?: string;
  origin?: string;
  configuredUiPort: number;
  apiPort: number;
  /** Deliberately ignored: forwarded headers do not establish caller identity. */
  forwardedFor?: string;
}

export interface LocalUiAccessPorts {
  configuredUiPort: number;
  apiPort: () => number;
}

function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('::ffff:')) return isLoopback(normalized.slice('::ffff:'.length));
  if (isIP(normalized) !== 4) return false;
  return normalized.split('.')[0] === '127';
}

function allowedHostNames(port: number): string[] {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return [];
  return [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`];
}

function allowedHosts(metadata: LocalUiRequestMetadata): Set<string> {
  return new Set([...allowedHostNames(metadata.apiPort), ...allowedHostNames(metadata.configuredUiPort)]);
}

function originIsAllowed(origin: string, hosts: Set<string>): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:' &&
      parsed.username === '' && parsed.password === '' &&
      (parsed.pathname === '' || parsed.pathname === '/') && parsed.search === '' && parsed.hash === '' &&
      hosts.has(parsed.host.toLowerCase());
  } catch {
    return false;
  }
}

export function localUiRequestAllowed(metadata: LocalUiRequestMetadata): boolean {
  if (!isLoopback(metadata.remoteAddress)) return false;
  const hosts = allowedHosts(metadata);
  if (!metadata.host || !hosts.has(metadata.host.toLowerCase())) return false;
  if (metadata.origin === undefined || metadata.origin === '') return true;
  return originIsAllowed(metadata.origin, hosts);
}

export function localUiAccessMiddleware(
  ports: LocalUiAccessPorts,
  denialMessage = 'This route is available only to the local Frigg UI and loopback tools.',
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const allowed = localUiRequestAllowed({
      remoteAddress: req.socket.remoteAddress,
      host: req.get('host'),
      origin: req.get('origin'),
      configuredUiPort: ports.configuredUiPort,
      apiPort: ports.apiPort(),
    });
    if (!allowed) {
      res.status(403).json({ error: denialMessage });
      return;
    }
    next();
  };
}
