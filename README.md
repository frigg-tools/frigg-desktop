# Frigg

Intercept, inspect and **mock** HTTP(S) traffic from Android/iOS devices, emulators and simulators — HTTP Toolkit style, with one-click device setup.

```
┌──────────────┐    HTTP(S)     ┌─────────────────────┐
│ Android / iOS │ ────────────▶ │  Frigg proxy :8888  │ ──▶ internet
│ device / emu  │               │  (TLS interception) │
└──────────────┘               └──────────┬──────────┘
                                          │ live feed + mocks
                                ┌─────────▼──────────┐
                                │  Frigg UI  :4848   │
                                └────────────────────┘
```

## Quick start

```bash
npm install
npm run dev        # server (API :4848, proxy :8888) + web UI (:5173)
```

Open <http://localhost:5173>. First run shows a 3-step onboarding; then head to **Devices**.

Production-ish run (UI served by the server at :4848):

```bash
npm run build
npm start
```

## Connecting a device

### Android (emulator or USB device) — one click
Requires `adb` (`brew install --cask android-platform-tools`). In **Devices → Android**, hit **Set up interception**:

1. Sets the device's global HTTP proxy to Frigg.
2. Installs the Frigg CA: as a **system** cert when `adb root` is available (most emulators without Google Play), otherwise drops `frigg-ca.crt` in Downloads and opens Security settings for a manual **user** install.

> Apps targeting API 24+ only trust **user** CAs if their `networkSecurityConfig` opts in — add this to your debug build:
> ```xml
> <network-security-config>
>   <base-config>
>     <trust-anchors><certificates src="user" /><certificates src="system" /></trust-anchors>
>   </base-config>
> </network-security-config>
> ```

**Remove** undoes the proxy (`http_proxy :0`).

### iOS Simulator — one click
In **Devices → iOS Simulator**, hit **Install CA cert** on a booted sim (`xcrun simctl keychain … add-root-cert`). Simulators inherit the **Mac's** proxy — use the macOS proxy toggle on the same screen (it routes all Mac traffic through Frigg while enabled).

### Any physical device (iPhone, Android, anything) — manual + QR
Open the **setup page** (`http://<your-lan-ip>:4848/setup`, linked + QR'd from the Devices screen) on the device:

1. Same Wi-Fi network; set the Wi-Fi proxy manually to `<your-lan-ip>:8888`.
2. Download the CA cert from the page.
3. Trust it — iOS: install the profile (Settings → General → VPN & Device Management), then enable full trust in Settings → General → About → Certificate Trust Settings. Android: Settings → Security → Install CA certificate.

## Mocking

- **Traffic** screen: every request flows live. Click one → **⚡ Create mock** prefills a rule from the real exchange.
- **Mocks** screen: rules organized in nested **folders**. A rule matches on method, host pattern, path pattern (globs: `*`, `?`), query substring and body; it answers with your status/headers/body, optional delay. Toggle rules on/off; higher priority wins.
- Matched requests never reach the upstream server and show a ⚡ MOCK chip in the traffic list.

Everything persists in `~/.frigg/` (CA keypair + `mocks.json`).

## Stack

npm workspaces monorepo — `packages/shared` (types), `packages/server` (Node + TypeScript, [mockttp](https://github.com/httptoolkit/mockttp) proxy engine, Express + WebSocket API), `packages/web` (React 19, Vite, Tailwind v4, zustand). Architecture and module contracts: [DESIGN.md](./DESIGN.md).

```bash
npm test           # server unit tests (matcher + mock store)
FRIGG_PROXY_PORT=9999 FRIGG_API_PORT=4040 npm start   # custom ports
```
