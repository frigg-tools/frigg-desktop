# Devices tab detail + proxy teardown on shutdown (Android)

**Date:** 2026-07-16
**Scope:** Android physical devices only (iOS/Mac unchanged).

## Problem

The Devices tab is too vague: it only shows a proxy on/off dot and Set-up / Disable-proxy
buttons. It gives no signal about whether the Frigg CA is actually trusted on the device, no
way to (re)install just the CA, no guidance to remove it, and no fingerprint to verify against
the device. Separately, when Frigg exits it leaves the device's HTTP proxy pointing at a
now-dead Frigg, so the device loses connectivity until the user clears it by hand.

Root constraint: on a non-rooted Android device the user CA store (`/data/misc/user/0/cacerts-added`)
is root-only, so Frigg cannot read whether its CA is installed. Cert-trust status must be
**inferred from observed traffic**, not read from the store.

## Data model (`packages/shared/src/index.ts`)

Extend `AndroidDevice` with optional fields (all backward-compatible):

- `ipAddress?: string` — device wlan0 IPv4, from `adb -s <serial> shell ip -o -f inet addr show wlan0`.
- `proxyValue?: string` — raw `settings get global http_proxy` value (e.g. `192.168.15.5:8888`),
  used to render the target and detect a **stale** proxy (points at an address that is not this
  Frigg).
- `certTrusted?: boolean` — true when Frigg has decrypted an HTTPS exchange from this device's
  `ipAddress` within a freshness window (default 10 min).
- `lastDecryptedAt?: number` — epoch ms of the most recent decrypted HTTPS exchange from this IP.

`proxyConfigured` stays (backward compat). Derived proxy state (computed in the web card, not stored):
`frigg` (proxyValue == this Frigg's lanIp:port) | `other` (non-empty, different) | `off`.

## Cert-trust inference (server)

New module `packages/server/src/devices/cert-trust-tracker.ts`:

- `recordDecryptedHttps(clientIp: string, at: number)` — called from the proxy/traffic layer
  whenever an HTTPS exchange is **successfully decrypted** (TLS intercepted, real request seen —
  not a failed/tunnelled CONNECT).
- `lastDecryptedAt(clientIp: string): number | undefined`
- `isTrusted(clientIp: string, now: number, windowMs = 600_000): boolean`

Pure, unit-testable (no I/O). Wired in `start.ts`; the `GET /api/devices` handler passes each
device's `ipAddress` through `isTrusted`/`lastDecryptedAt` to fill `certTrusted`/`lastDecryptedAt`.

Integration point: locate where the engine emits a completed exchange with client IP + decryption
info (the traffic store), and call `recordDecryptedHttps` there for HTTPS exchanges that were
decrypted. Emulator caveat: emulator traffic arrives via host loopback (ambiguous IP), so
`certTrusted` is only meaningful for physical devices; emulator cards fall back to the setup-time
`certMode` and simply omit the trust badge.

## Server: device IP + proxy value

In `packages/server/src/devices/android.ts`:

- `readDeviceIp(serial): Promise<string | undefined>` — parse `ip -o -f inet addr show wlan0`
  (extract the `inet <x.x.x.x>/nn` address). Pure parser `parseWlan0Ip(raw)` extracted for tests.
- `readProxyValue(serial): Promise<string | undefined>` — the raw proxy string (reuse the existing
  `settings get global http_proxy` read; `readProxyConfigured` keeps its boolean contract).
- `listAndroidDevices` populates `ipAddress` and `proxyValue`.

## Server: install-CA action (decoupled from proxy)

- Extract the cert push + installer-intent out of `fallbackToUserCert` into
  `installUserCert(serial, certPem, locale)` (push `ca.pem` to `/sdcard/Download/frigg-ca.crt`,
  open `SECURITY_SETTINGS`, return guidance messages). `fallbackToUserCert` calls it.
- New route `POST /api/devices/android/:serial/install-cert` → runs `installUserCert` with the
  current CA. For rooted devices it may still try the system path (reuse `installCa`); default is
  the user-cert flow. Returns `{ certMode, messages, fingerprint }`.
- Expose the CA SHA-256 fingerprint (already in proxy status) so the card can show it.

## Server: proxy teardown on shutdown

- In `start.ts` `stop` closure, add a best-effort step alongside `disableMacProxyIfEnabledByFrigg()`:
  `teardownAndroidProxiesPointingAtFrigg()` — `listAndroidDevices()`, and for each device whose
  `proxyValue` equals this Frigg's `lanIp:port`, call `teardownAndroid(serial)`. The equality
  filter is the safety guard: never clear a proxy that points somewhere else. Wrapped so failures
  never block shutdown (`allSettled`).
- `packages/server/src/index.ts`: also handle `SIGTERM` (today only `SIGINT`) → `frigg.stop()`.
- Electron `before-quit` already calls stop; no change needed.
- Limitation (documented, not fixed): SIGKILL / power loss / crash cannot run cleanup.

## Web UI (`AndroidDeviceCard.tsx` + new subcomponents)

Redesign the card body:

```
● N950  ·  0123…CDEF
Proxy:  ativo → 192.168.15.5:8888  ✓ aponta pro Frigg      [ Desativar proxy ]
CA:     confiável ✓  ·  HTTPS decifrado há 2min
        fp 1B:AB:10:C4…    [ Reinstalar CA ]   [ Como remover ▸ ]
```

- **Proxy row:** state pill — `frigg` (emerald "aponta pro Frigg"), `other` (amber "aponta pra
  \<value\> — stale?"), `off` (grey). Actions: `Set up interception` (full: proxy+cert) when off;
  `Desativar proxy` when on.
- **CA row:** trust pill — `trusted` (emerald + relative time from `lastDecryptedAt`), `unverified`
  (grey "instale a CA e gere tráfego"), `installing`. Shows CA fingerprint (mono, truncated,
  copyable). `Reinstalar CA` → `installCertAndroid(serial)`. `Como remover ▸` expands a
  step-by-step (Configurações → Segurança → Credenciais confiáveis → aba Usuário → Frigg CA →
  Remover) plus an "Abrir credenciais confiáveis" button that fires the settings intent via a
  small `open-trusted-creds` route (adb `am start`), since user-CA removal cannot be automated
  without root.
- Emulator card: omit the CA-trust badge; keep the existing setup-result cert-mode pill.
- New api/client fns: `installCertAndroid(serial)`, `openTrustedCreds(serial)`.

## i18n

Add en + pt keys for every new string in `packages/web/src/i18n/devices.ts`
(`android.certTrusted`, `.certUnverified`, `.decryptedAgo`, `.proxyPointsFrigg`,
`.proxyPointsOther`, `.reinstallCa`, `.howToRemove`, `.removeStep1..N`, `.openTrustedCreds`,
`.installCa`, `.fingerprint`, …) and any new server messages in `packages/server/src/i18n.ts`.

## Testing

- Unit (vitest): `parseWlan0Ip`, `cert-trust-tracker` (record / freshness window / unknown IP),
  and the proxy-state derivation helper (frigg / other / off).
- The `GET /api/devices` shape (certTrusted/ipAddress/proxyValue present) via the existing api
  test harness if feasible.
- Manual verification on the real N950 (proxy target, CA reinstall, trust badge lighting up after
  decrypted traffic, proxy cleared on Frigg shutdown).

## Out of scope

- iOS / Mac card enrichment.
- Reading the CA store directly (impossible without root).
- Auto-removing the user CA (impossible without root) — guided only.
- Recovering a stale proxy after a hard kill (no cleanup possible on SIGKILL).
