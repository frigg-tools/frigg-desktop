import { run, type ExecResult } from '../lib/exec.ts';

export async function getMacProxyState(): Promise<{ enabled: boolean; service: string | null }> {
  const service = await detectActiveService();
  if (service === null) return { enabled: false, service: null };
  const result = await run('networksetup', ['-getwebproxy', service]);
  const enabled = result.ok && /^Enabled:\s*Yes/im.test(result.stdout);
  return { enabled, service };
}

export async function setMacProxy(enabled: boolean, port: number): Promise<{ ok: boolean; message: string }> {
  const service = await detectActiveService();
  if (service === null) {
    return {
      ok: false,
      message: 'No active network service found; configure the macOS proxy manually in System Settings.',
    };
  }
  const commands = enabled
    ? [
        ['-setwebproxy', service, '127.0.0.1', String(port)],
        ['-setsecurewebproxy', service, '127.0.0.1', String(port)],
      ]
    : [
        ['-setwebproxystate', service, 'off'],
        ['-setsecurewebproxystate', service, 'off'],
      ];
  for (const args of commands) {
    const result = await run('networksetup', args);
    if (!result.ok) {
      return { ok: false, message: `networksetup ${args[0]} failed on ${service}: ${commandFailure(result)}.` };
    }
  }
  return enabled
    ? { ok: true, message: `macOS HTTP and HTTPS proxy on ${service} set to 127.0.0.1:${port}.` }
    : { ok: true, message: `macOS HTTP and HTTPS proxy on ${service} disabled.` };
}

async function detectActiveService(): Promise<string | null> {
  const result = await run('networksetup', ['-listallnetworkservices']);
  if (!result.ok) return null;
  const services = result.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('*'));
  if (services.includes('Wi-Fi')) return 'Wi-Fi';
  return services[0] ?? null;
}

function commandFailure(result: ExecResult): string {
  const detail = result.stderr.trim() || result.stdout.trim();
  if (detail !== '') return detail;
  return result.code === null ? 'command timed out or could not start' : `exit code ${result.code}`;
}
