# Frigg

Intercept, inspect and **mock** HTTP(S) traffic from Android/iOS devices, emulators and simulators — HTTP Toolkit style, with one-click device setup. Plus a built-in **API client**, **Logcat** streaming, a **database** browser and in-flight **breakpoints**. Runs in the browser or as a native **desktop app**. Bilingual UI (English / pt-BR).

```
┌──────────────┐    HTTP(S)     ┌─────────────────────┐
│ Android / iOS │ ────────────▶ │  Frigg proxy :8888  │ ──▶ internet
│ device / emu  │               │  (TLS interception) │
└──────────────┘               └──────────┬──────────┘
                                          │ live feed + mocks + breakpoints
                                ┌─────────▼──────────┐
                                │  Frigg UI  :4848   │
                                └────────────────────┘
```

## Download

Grab the latest desktop build from the [**Releases**](https://github.com/frigg-tools/frigg-desktop/releases/latest) page — `arm64` for Apple Silicon, `x64` for Intel Macs. Open the `.dmg` and drag Frigg to Applications.

> The build is unsigned, so on first launch macOS Gatekeeper blocks it. Right-click the app → **Open** (once), or run `xattr -dr com.apple.quarantine /Applications/Frigg.app`.

Each tagged release (`vX.Y.Z`) is built and published automatically by CI ([`.github/workflows/release.yml`](.github/workflows/release.yml)).

## Quick start (from source)

```bash
npm install
npm run dev        # server (API :4848, proxy :8888) + web UI (:5173)
```

Open <http://localhost:5173>. First run shows a short onboarding; then head to **Devices**.

Production-ish run (UI served by the server at :4848):

```bash
npm run build
npm start
```

## Desktop app

```bash
npm run desktop        # boots server + web and opens a native window
npm run desktop:dist   # builds the installer → packages/desktop/release/ (.dmg / .exe / AppImage)
```

The packaged app boots the server in-process and serves the bundled UI — no terminal needed. Targets: macOS → `.dmg`, Windows → `.exe` (nsis), Linux → AppImage (build on the matching OS).

## What's inside

- **Traffic** — every request flows live; filter by host/path and by device. Click one → **⚡ Create mock** prefills a rule from the real exchange.
- **API client** — Postman-style: workspaces, nested folders, environments and variables. `{{variables}}` are highlighted and autocompleted everywhere; the JSON body is colorized with error hints. Open several requests at once as **tabs**. Pre-request and test **scripts** run in a sandbox with a Postman-like `pm` API (`pm.environment.get/set`, `pm.response.json`, `pm.test`, `pm.expect`). Adding a variable can seed it across every environment; creating an environment can copy the keys from the others.
- **Breakpoints** — pause a matching request or response in-flight, edit method/URL/headers/body (or status), then continue, answer with a custom response, or abort. Match rules by method + URL, for the request side, the response side, or both.
- **Mocks** — rules in nested folders, matched on method, host/path globs (`*`, `?`), query substring and body; answer with your status/headers/body and optional delay. Higher priority wins; matched requests never reach upstream and show a ⚡ MOCK chip.
- **Logcat** — stream Android `logcat` / iOS `log`, filtered by app package, level and text.
- **Database** — open and query the local databases (Android Room / iOS) of installed apps.
- **SQL** — connect to your own **MySQL, MariaDB, PostgreSQL or SQLite** servers with saved credentials (passwords encrypted at rest), browse and edit tables, and run queries with schema-aware autocomplete. Destructive statements ask for confirmation.
- **Devices** — one-click interception setup (see below).
- **MCP** — exposes Frigg over a Model Context Protocol server so agents can drive traffic, mocks and the API client.

## Claude Code plugin

Drive Frigg straight from Claude Code. The plugin bundles the Frigg MCP server (18 tools) plus `/frigg:*` slash commands and a debugging skill:

```text
/plugin marketplace add frigg-tools/frigg-desktop
/plugin install frigg@frigg-tools
```

With a Frigg server running (the desktop app or `npm run dev`, API on `:4848`):

- `/frigg:status` — proxy status + connected devices
- `/frigg:traffic [filter]` — recently captured traffic
- `/frigg:mock <spec>` — create a mock rule (from a description or a captured request)
- `/frigg:run <request>` — run a saved API-client request
- `/frigg:setup` — check the connection and how to start Frigg
- the **frigg-debug** skill guides inspect-and-mock debugging

The MCP talks to the server's HTTP API; set `FRIGG_API_URL` if Frigg runs on a custom port. After changing the MCP source, rebuild the bundled server with `npm run build:plugin`.

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

Everything persists in `~/.frigg/` (CA keypair, `mocks.json`, API-client data).

## Stack

npm workspaces monorepo:

- **`packages/shared`** — domain types.
- **`packages/server`** — Node + TypeScript, [mockttp](https://github.com/httptoolkit/mockttp) TLS-intercepting proxy, Express + WebSocket API, device connectors (adb / simctl / networksetup), Logcat streaming.
- **`packages/web`** — React 19, Vite, Tailwind v4, zustand.
- **`packages/desktop`** — Electron shell (esbuild-bundled main).
- **`packages/mcp`** — Model Context Protocol server bridging to the Frigg HTTP API.

Architecture and module contracts: [DESIGN.md](./DESIGN.md).

```bash
npm test           # server unit tests (matcher, mock store, traffic, logcat, api-client)
FRIGG_PROXY_PORT=9999 FRIGG_API_PORT=4040 npm start   # custom ports
```
