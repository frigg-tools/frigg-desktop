export const CERT_TRUST_WINDOW_MS = 600_000;

export function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}

export class CertTrustTracker {
  private readonly lastByIp = new Map<string, number>();

  recordDecryptedHttps(clientIp: string | undefined, at: number): void {
    if (clientIp === undefined || clientIp === '') return;
    const key = normalizeIp(clientIp);
    const previous = this.lastByIp.get(key);
    if (previous === undefined || at > previous) this.lastByIp.set(key, at);
  }

  lastDecryptedAt(clientIp: string | undefined): number | undefined {
    if (clientIp === undefined || clientIp === '') return undefined;
    return this.lastByIp.get(normalizeIp(clientIp));
  }

  isTrusted(clientIp: string | undefined, now: number, windowMs: number = CERT_TRUST_WINDOW_MS): boolean {
    const at = this.lastDecryptedAt(clientIp);
    return at !== undefined && now - at <= windowMs;
  }
}
