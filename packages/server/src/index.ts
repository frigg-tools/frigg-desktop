import { DEFAULT_API_PORT, DEFAULT_PROXY_PORT } from '@frigg/shared';
import { startFrigg } from './start.ts';

function portFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : fallback;
}

function printBanner(frigg: {
  apiPort: number;
  proxyPort: number;
  lanIp: string | null;
  fingerprint: string;
  webUiAvailable: boolean;
}): void {
  const proxyHost = frigg.lanIp ?? 'localhost';
  const uiLine = frigg.webUiAvailable
    ? `  UI           http://localhost:${frigg.apiPort}`
    : `  UI           http://localhost:${frigg.apiPort} (web build missing — run the web dev server)`;
  console.log(
    [
      '',
      '  Frigg is running',
      '',
      uiLine,
      `  Proxy        ${proxyHost}:${frigg.proxyPort}`,
      `  Setup page   http://${proxyHost}:${frigg.apiPort}/setup`,
      `  CA SHA-256   ${frigg.fingerprint}`,
      '',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const frigg = await startFrigg({
    proxyPort: portFromEnv('FRIGG_PROXY_PORT', DEFAULT_PROXY_PORT),
    apiPort: portFromEnv('FRIGG_API_PORT', DEFAULT_API_PORT),
  });
  printBanner(frigg);
  process.on('SIGINT', () => {
    void frigg.stop().then(() => process.exit(0));
  });
}

main().catch((error: NodeJS.ErrnoException & { port?: number }) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${error.port ?? ''} is already in use. Stop the other process or set FRIGG_API_PORT / FRIGG_PROXY_PORT.`,
    );
  } else {
    console.error(error);
  }
  process.exit(1);
});
