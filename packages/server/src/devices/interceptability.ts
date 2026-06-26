import type { InterceptionCheck, InterceptionReadiness } from '@frigg/shared';
import { st, type ServerLocale } from '../i18n.ts';
import { run } from '../lib/exec.ts';

export async function diagnoseInterception(
  serial: string,
  app: string,
  locale: ServerLocale,
  upstreamCertHosts: string[],
): Promise<InterceptionReadiness> {
  const checks: InterceptionCheck[] = [];

  const proxy = await run('adb', ['-s', serial, 'shell', 'settings', 'get', 'global', 'http_proxy']);
  const proxyValue = proxy.ok ? proxy.stdout.trim() : '';
  const proxyOk = proxyValue !== '' && proxyValue !== 'null' && proxyValue !== ':0';
  checks.push({
    id: 'proxy',
    ok: proxyOk,
    title: st(locale, 'diagnose.proxy.title'),
    detail: proxyOk
      ? st(locale, 'diagnose.proxy.ok', { value: proxyValue })
      : st(locale, 'diagnose.proxy.missing'),
  });

  const dump = await run('adb', ['-s', serial, 'shell', 'dumpsys', 'package', app]);
  const installed = dump.ok && /\b(versionName|codePath)=/.test(dump.stdout);
  if (!installed) {
    checks.push({
      id: 'installed',
      ok: false,
      title: st(locale, 'diagnose.installed.title'),
      detail: st(locale, 'diagnose.installed.missing', { app }),
    });
    return { serial, app, ready: false, checks };
  }

  const runAs = await run('adb', ['-s', serial, 'shell', 'run-as', app, 'true']);
  const debuggable = runAs.ok;
  checks.push({
    id: 'userCertTrust',
    ok: debuggable,
    title: st(locale, 'diagnose.trust.title'),
    detail: debuggable ? st(locale, 'diagnose.trust.debug') : st(locale, 'diagnose.trust.release'),
  });

  checks.push({
    id: 'mtls',
    ok: true,
    title: st(locale, 'diagnose.mtls.title'),
    detail:
      upstreamCertHosts.length > 0
        ? st(locale, 'diagnose.mtls.configured', { hosts: upstreamCertHosts.join(', ') })
        : st(locale, 'diagnose.mtls.none'),
  });

  return { serial, app, ready: checks.every((check) => check.ok), checks };
}
