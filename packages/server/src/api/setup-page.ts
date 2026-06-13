import { st, type ServerLocale } from '../i18n.ts';

export function setupPageHtml(opts: {
  lanIp: string | null;
  proxyPort: number;
  apiPort: number;
  fingerprint: string;
  qrDataUrl: string;
  locale: ServerLocale;
}): string {
  const { locale } = opts;
  const proxyHost = opts.lanIp ?? 'this-computer-ip';
  const proxyAddress = `${proxyHost}:${opts.proxyPort}`;
  const lanIpNote = opts.lanIp === null ? `<p class="warn">${st(locale, 'setup.lanIpNote')}</p>` : '';
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${st(locale, 'setup.title')}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #09090b;
    color: #e4e4e7;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.6;
  }
  .wrap { max-width: 720px; margin: 0 auto; padding: 48px 20px 80px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
  h1 { font-size: 40px; letter-spacing: -0.02em; }
  h1 .accent { color: #34d399; }
  .tagline { color: #a1a1aa; margin-top: 4px; }
  .qr { background: #fafafa; border-radius: 12px; padding: 8px; line-height: 0; }
  .qr img { width: 148px; height: 148px; display: block; }
  .qr-caption { color: #71717a; font-size: 12px; text-align: center; margin-top: 6px; }
  .proxy-banner {
    margin-top: 32px;
    background: #18181b;
    border: 1px solid #27272a;
    border-radius: 12px;
    padding: 20px 24px;
  }
  .proxy-banner .label { color: #a1a1aa; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  }
  .proxy-address { color: #34d399; font-size: 28px; font-weight: 600; margin-top: 4px; word-break: break-all; }
  .step {
    margin-top: 24px;
    background: #18181b;
    border: 1px solid #27272a;
    border-radius: 12px;
    padding: 24px;
  }
  .step-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .step-num {
    width: 32px; height: 32px; flex: none;
    display: flex; align-items: center; justify-content: center;
    background: rgba(52, 211, 153, 0.12);
    border: 1px solid rgba(52, 211, 153, 0.4);
    color: #34d399;
    border-radius: 999px;
    font-weight: 700;
  }
  .step h2 { font-size: 18px; }
  .step p, .step li { color: #d4d4d8; }
  .step .dim { color: #a1a1aa; font-size: 14px; }
  .step ol, .step ul { padding-left: 22px; margin-top: 8px; display: grid; gap: 6px; }
  .certs { display: flex; gap: 12px; flex-wrap: wrap; margin: 14px 0; }
  .cert-link {
    display: inline-block;
    background: #09090b;
    border: 1px solid #27272a;
    border-radius: 8px;
    padding: 10px 16px;
    color: #34d399;
    text-decoration: none;
    font-weight: 600;
  }
  .cert-link:hover { border-color: #34d399; }
  .cert-link .hint { display: block; color: #71717a; font-size: 12px; font-weight: 400; }
  .platform { margin-top: 14px; }
  .platform h3 { font-size: 14px; color: #e4e4e7; margin-bottom: 4px; }
  .warn {
    margin-top: 12px;
    background: rgba(251, 191, 36, 0.08);
    border: 1px solid rgba(251, 191, 36, 0.35);
    border-radius: 8px;
    padding: 10px 14px;
    color: #fbbf24;
    font-size: 14px;
  }
  .fingerprint { margin-top: 28px; color: #71717a; font-size: 12px; word-break: break-all; }
  .fingerprint .mono { color: #a1a1aa; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    background: #09090b;
    border: 1px solid #27272a;
    border-radius: 4px;
    padding: 1px 6px;
    color: #34d399;
  }
  pre.codeblock {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    background: #09090b;
    border: 1px solid #27272a;
    border-radius: 8px;
    padding: 14px 16px;
    margin-top: 8px;
    overflow-x: auto;
    font-size: 13px;
    line-height: 1.5;
    color: #d4d4d8;
  }
  pre.codeblock .c { color: #71717a; }
  pre.codeblock .t { color: #34d399; }
  details.appcfg { margin-top: 12px; }
  details.appcfg summary {
    cursor: pointer;
    color: #fbbf24;
    font-weight: 600;
    font-size: 14px;
    list-style: none;
  }
  details.appcfg summary::-webkit-details-marker { display: none; }
  details.appcfg summary::before { content: "▸ "; }
  details.appcfg[open] summary::before { content: "▾ "; }
  details.appcfg .body { margin-top: 10px; }
  .ol-tight { padding-left: 22px; margin-top: 8px; display: grid; gap: 4px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1>Frigg <span class="accent">${st(locale, 'setup.heading')}</span></h1>
      <p class="tagline">${st(locale, 'setup.tagline')}</p>
    </div>
    <div>
      <div class="qr"><img src="${opts.qrDataUrl}" alt="${st(locale, 'setup.qrAlt')}"></div>
      <p class="qr-caption">${st(locale, 'setup.qrCaption')}</p>
    </div>
  </header>

  <div class="proxy-banner">
    <div class="label">${st(locale, 'setup.proxyLabel')}</div>
    <div class="proxy-address mono">${proxyAddress}</div>
    ${lanIpNote}
  </div>

  <section class="step">
    <div class="step-head">
      <div class="step-num">1</div>
      <h2>${st(locale, 'setup.step1.title')}</h2>
    </div>
    <p>${st(locale, 'setup.step1.intro')}</p>
    <ul>
      <li>${st(locale, 'setup.step1.server')} <code>${proxyHost}</code></li>
      <li>${st(locale, 'setup.step1.port')} <code>${opts.proxyPort}</code></li>
    </ul>
    <p class="dim">${st(locale, 'setup.step1.hint')}</p>
  </section>

  <section class="step">
    <div class="step-head">
      <div class="step-num">2</div>
      <h2>${st(locale, 'setup.step2.title')}</h2>
    </div>
    <p>${st(locale, 'setup.step2.intro')}</p>
    <div class="certs">
      <a class="cert-link" href="/cert.pem">cert.pem<span class="hint">${st(locale, 'setup.step2.pemHint')}</span></a>
      <a class="cert-link" href="/cert.crt">cert.crt<span class="hint">${st(locale, 'setup.step2.crtHint')}</span></a>
      <a class="cert-link" href="/cert.der">cert.der<span class="hint">${st(locale, 'setup.step2.derHint')}</span></a>
    </div>
    <p class="dim">${st(locale, 'setup.step2.hint')}</p>
  </section>

  <section class="step">
    <div class="step-head">
      <div class="step-num">3</div>
      <h2>${st(locale, 'setup.step3.title')}</h2>
    </div>
    <div class="platform">
      <h3>iOS</h3>
      <ol>
        <li>${st(locale, 'setup.step3.iosStep1')}</li>
        <li>${st(locale, 'setup.step3.iosStep2')}</li>
      </ol>
    </div>
    <div class="platform">
      <h3>Android</h3>
      <ol>
        <li>${st(locale, 'setup.step3.androidStep1')}</li>
        <li>${st(locale, 'setup.step3.androidStep2')}</li>
      </ol>
    </div>
  </section>

  <section class="step">
    <div class="step-head">
      <div class="step-num">4</div>
      <h2>${st(locale, 'setup.step4.title')}</h2>
    </div>
    <p>${st(locale, 'setup.step4.intro')}</p>
    <div class="platform">
      <h3>${st(locale, 'setup.step4.optionA.title')}</h3>
      <p class="dim">${st(locale, 'setup.step4.optionA.body')}</p>
    </div>
    <div class="platform">
      <h3>${st(locale, 'setup.step4.optionB.title')}</h3>
      <ol class="ol-tight">
        <li>${st(locale, 'setup.step4.optionB.step1')}</li>
      </ol>
      <pre class="codeblock"><span class="c">&lt;!-- res/xml/network_security_config.xml --&gt;</span>
<span class="t">&lt;network-security-config&gt;</span>
  <span class="t">&lt;base-config&gt;</span>
    <span class="t">&lt;trust-anchors&gt;</span>
      <span class="t">&lt;certificates</span> src=<span class="t">"user"</span> <span class="t">/&gt;</span>
      <span class="t">&lt;certificates</span> src=<span class="t">"system"</span> <span class="t">/&gt;</span>
    <span class="t">&lt;/trust-anchors&gt;</span>
  <span class="t">&lt;/base-config&gt;</span>
<span class="t">&lt;/network-security-config&gt;</span></pre>
      <ol class="ol-tight" start="2">
        <li>${st(locale, 'setup.step4.optionB.step2')}</li>
      </ol>
      <pre class="codeblock"><span class="t">&lt;application</span>
  android:networkSecurityConfig=<span class="t">"@xml/network_security_config"</span> ... <span class="t">&gt;</span></pre>
      <p class="warn">${st(locale, 'setup.step4.optionB.warn')}</p>
    </div>
  </section>

  <p class="fingerprint">${st(locale, 'setup.fingerprint')}<br><span class="mono">${opts.fingerprint}</span></p>
</div>
</body>
</html>`;
}
