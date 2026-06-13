# Frigg — project guide

Frigg intercepts, inspects and **mocks** HTTP(S) traffic from Android/iOS devices, emulators and simulators, and streams their **Logcat**. HTTP Toolkit-style, with one-click device setup. Runs in the browser or as an Electron desktop app. UI is bilingual (English / pt-BR).

## Useful commands

### Run on the web (browser)
```bash
npm install            # first time only
npm run dev            # API+proxy (:4848 / :8888) + Vite web UI (:5173)
# open http://localhost:5173
```

### Run as the desktop app (Electron)
```bash
npm run desktop        # boots server + web + opens a native window
```
Dev mode runs the server (`:4848`/`:8888`) and Vite (`:5173`) and loads the window from Vite (hot reload). One window only (single-instance lock).

### Generate the installer (.dmg / .exe / AppImage)
```bash
npm run desktop:dist   # builds web, bundles the Electron main, runs electron-builder
# output: packages/desktop/release/  (e.g. Frigg-0.1.0.dmg)
```
The `.dmg` is in `packages/desktop/release/`. Drag it to other Macs to install. The packaged app boots the server **in-process** (via `startFrigg()`) and serves the bundled web UI — no terminal needed. Targets: `mac` → dmg, `win` → nsis, `linux` → AppImage (build on the matching OS, or configure cross-build).

### Other
```bash
npm run build          # type-check server + build web (packages/web/dist)
npm start              # production server only, serves the built web at :4848
npm test               # server unit tests (vitest): matcher, mock store, traffic, logcat parsers
FRIGG_PROXY_PORT=9999 FRIGG_API_PORT=4040 npm start   # custom ports
```

## Architecture

npm workspaces monorepo:
- **`packages/shared`** — domain types only. ALWAYS import domain types from `@frigg/shared`; never redefine them.
- **`packages/server`** — Node + TypeScript (run via `tsx`, `tsc` is type-check only). mockttp TLS-intercepting proxy, Express REST + WebSocket API, device connectors (adb / simctl / networksetup), Logcat process streaming. `src/start.ts` exports `startFrigg()` — the shared boot path for the CLI (`src/index.ts`) and the Electron main.
- **`packages/web`** — React 19 + Vite + Tailwind v4 + zustand. Screens: Traffic, Mocks, Logcat, Devices.
- **`packages/desktop`** — Electron shell; `src/main.ts` bundled to CJS with esbuild.

Ports: proxy `8888`, API/UI `4848` (env `FRIGG_PROXY_PORT` / `FRIGG_API_PORT`). Persistence in `~/.frigg/` (CA keypair + `mocks.json`).

Full module contracts and the v0.2 feature designs (i18n, Logcat, desktop) live in [`DESIGN.md`](./DESIGN.md) — read it before changing a module.

## Conventions

- **No code comments.** Self-explanatory naming and small functions; the "why" goes in commit messages / PR descriptions. Exceptions only: formal API docs on public APIs, or a one-line note for a genuinely non-obvious workaround referencing an issue.
- **TypeScript strict everywhere. ESM.** Server imports between local files use the `.ts` extension (tsx + `allowImportingTsExtensions`).
- **Domain types only from `@frigg/shared`.**
- **Server never crashes on device-tool failures** — degrade into result messages / status errors.
- **i18n:** every user-visible string goes through `useT()` (`packages/web/src/i18n`). Shared strings live in the `common` namespace (called bare, e.g. `t('action.save')`); per-screen strings live in their own namespace (e.g. `t('logcat.start')`). Add both `en` and `pt` for every key. Server-facing messages (device setup, `/setup` page) are localized via the `X-Frigg-Locale` header / `?lang`.

## Devices

- **Android** (`adb`): Devices → Set up interception sets the proxy and installs the CA (system cert via `adb root`, else a guided user-cert install). Logcat: Logcat tab → pick the device → Start. Filter by package (resolved to `--pid` via `pidof`), level and text.
- **iOS Simulator** (`xcrun simctl`): install the CA cert per simulator; simulators inherit the **Mac's** proxy (toggle on the Devices screen). Logcat via `log stream`. Physical iOS logs need `idevicesyslog` (not bundled).
- **Any physical device**: open the `/setup` page (QR on the Devices screen) — manual Wi-Fi proxy + CA trust.
