export function setupPageHtml(opts: {
  lanIp: string | null;
  proxyPort: number;
  apiPort: number;
  fingerprint: string;
  qrDataUrl: string;
}): string {
  const proxyHost = opts.lanIp ?? 'this-computer-ip';
  const proxyAddress = `${proxyHost}:${opts.proxyPort}`;
  const lanIpNote =
    opts.lanIp === null
      ? '<p class="warn">Frigg could not detect a LAN IP on this machine. Replace <span class="mono">this-computer-ip</span> below with this computer\'s Wi-Fi IP address.</p>'
      : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Frigg — Device Setup</title>
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
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1>Frigg <span class="accent">setup</span></h1>
      <p class="tagline">Route this device's HTTP(S) traffic through Frigg in three steps.</p>
    </div>
    <div>
      <div class="qr"><img src="${opts.qrDataUrl}" alt="QR code for this setup page"></div>
      <p class="qr-caption">Scan to open this page</p>
    </div>
  </header>

  <div class="proxy-banner">
    <div class="label">Proxy address</div>
    <div class="proxy-address mono">${proxyAddress}</div>
    ${lanIpNote}
  </div>

  <section class="step">
    <div class="step-head">
      <div class="step-num">1</div>
      <h2>Point your device at the proxy</h2>
    </div>
    <p>Connect the device to the <strong>same Wi-Fi network</strong> as this computer, then set a manual HTTP proxy on that Wi-Fi connection:</p>
    <ul>
      <li>Server / hostname: <code>${proxyHost}</code></li>
      <li>Port: <code>${opts.proxyPort}</code></li>
    </ul>
    <p class="dim">iOS: Settings → Wi-Fi → your network → Configure Proxy → Manual. Android: long-press your network → Modify network → Advanced → Proxy → Manual.</p>
  </section>

  <section class="step">
    <div class="step-head">
      <div class="step-num">2</div>
      <h2>Download the Frigg CA certificate</h2>
    </div>
    <p>HTTPS inspection needs the Frigg certificate authority on the device. Download it here:</p>
    <div class="certs">
      <a class="cert-link" href="/cert.pem">cert.pem<span class="hint">iOS / generic PEM</span></a>
      <a class="cert-link" href="/cert.crt">cert.crt<span class="hint">Android</span></a>
      <a class="cert-link" href="/cert.der">cert.der<span class="hint">DER binary</span></a>
    </div>
    <p class="dim">Open this page on the device itself (scan the QR code) so the download lands directly on it.</p>
  </section>

  <section class="step">
    <div class="step-head">
      <div class="step-num">3</div>
      <h2>Trust the certificate</h2>
    </div>
    <div class="platform">
      <h3>iOS</h3>
      <ol>
        <li>Settings → General → VPN &amp; Device Management → install the downloaded profile.</li>
        <li>Settings → General → About → Certificate Trust Settings → enable full trust for <strong>Frigg CA</strong>.</li>
      </ol>
    </div>
    <div class="platform">
      <h3>Android</h3>
      <ol>
        <li>Settings → Security → Encryption &amp; credentials → Install a certificate → CA certificate.</li>
        <li>Pick the downloaded <code>frigg-ca.crt</code>.</li>
      </ol>
      <p class="warn">Apps targeting Android 7+ (API 24) only trust user-installed CAs if their networkSecurityConfig allows it — debug builds of your own apps should add that override.</p>
    </div>
  </section>

  <p class="fingerprint">CA SHA-256 fingerprint<br><span class="mono">${opts.fingerprint}</span></p>
</div>
</body>
</html>`;
}
