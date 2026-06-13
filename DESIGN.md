# Frigg — Design Spec (2026-06-12)

Frigg intercepts, inspects and mocks HTTP(S) traffic from Android/iOS devices, emulators and simulators. It is an HTTP Toolkit-style tool: one-click device setup, live traffic view, mock rules organized in folders.

## Architecture

```
┌─────────────┐   HTTP(S)    ┌──────────────────────────────┐
│ Android/iOS  │ ──────────▶ │  @frigg/server               │
│ device/emu   │   :8888     │  ├─ mockttp proxy (TLS MITM) │
└─────────────┘              │  ├─ TrafficStore (ring buf)  │
                             │  ├─ MockStore (~/.frigg)     │
┌─────────────┐   REST/WS    │  ├─ Device connectors        │
│ @frigg/web   │ ──────────▶ │  └─ Express API + WS  :4848  │
│ React UI     │             └──────────────────────────────┘
└─────────────┘
```

- **Proxy** (port 8888, env `FRIGG_PROXY_PORT`): mockttp `getLocal({ https: {key, cert} })`, single rule `forAnyRequest().thenPassThrough({ beforeRequest })`. `beforeRequest` consults MockStore; on match returns `{ response: {...} }` (short-circuit = mock served, no upstream). Traffic captured via `server.on('request' | 'response' | 'abort')`.
- **API server** (port 4848, env `FRIGG_API_PORT`): Express + ws. Serves REST API, WS event feed, cert downloads, human `/setup` page, and `packages/web/dist` static build when present.
- **Persistence**: `~/.frigg/` → `ca/ca.key`, `ca/ca.pem` (generated once via `mockttp.generateCACertificate()`), `mocks.json` (atomic write: tmp + rename).
- **Monorepo**: npm workspaces. `packages/shared` (types only — ALWAYS import domain types from `@frigg/shared`, never redefine), `packages/server`, `packages/web`.

## Server module contracts (exact exports)

### `src/lib/paths.ts`
```ts
export const friggDir: string;                  // ~/.frigg (created on import or via ensure fn)
export function ensureFriggDirs(): void;        // mkdir -p friggDir, friggDir/ca
export const caKeyPath: string; export const caCertPath: string; export const mocksPath: string;
```

### `src/lib/net.ts`
```ts
export function getLanIp(): string | null;      // first external IPv4 from os.networkInterfaces()
```

### `src/lib/exec.ts`
```ts
export interface ExecResult { ok: boolean; stdout: string; stderr: string; code: number | null }
export function run(cmd: string, args: string[], opts?: { timeoutMs?: number }): Promise<ExecResult>;
// child_process.execFile wrapper, never throws — errors land in ExecResult
```

### `src/proxy/ca.ts`
```ts
export interface CaMaterial { key: string; cert: string; fingerprint: string }  // fingerprint = SHA-256 of DER, hex:colon
export async function ensureCa(): Promise<CaMaterial>;     // load from ~/.frigg/ca or generate via mockttp.generateCACertificate({ commonName: 'Frigg CA' }) and persist
export function certToDer(certPem: string): Buffer;
export async function androidCertName(certPem: string): Promise<string>; // `${subject_hash_old}.0` via `openssl x509 -subject_hash_old -noout` on a temp file (macOS LibreSSL supports it)
```

### `src/proxy/traffic-store.ts`
EventEmitter-based ring buffer (limit `TRAFFIC_BUFFER_LIMIT`).
```ts
export class TrafficStore extends EventEmitter {
  constructor(limit?: number);
  addRequest(req: CapturedRequest): TrafficExchange;                    // emits 'event' with ServerEvent {type:'request'}
  completeResponse(res: CapturedResponse): TrafficExchange | undefined; // emits {type:'response'}
  abort(id: string, reason?: string): TrafficExchange | undefined;      // emits {type:'abort'}
  list(): TrafficExchange[];   // oldest → newest
  get total(): number;
  clear(): void;               // emits {type:'traffic-cleared'}
}
```
Listeners subscribe via `store.on('event', (ev: ServerEvent) => ...)`.

### `src/proxy/engine.ts`
```ts
export interface EngineDeps { proxyPort: number; ca: CaMaterial; mocks: MockStore; traffic: TrafficStore }
export class ProxyEngine {
  constructor(deps: EngineDeps);
  start(): Promise<void>;
  stop(): Promise<void>;
}
```
Implementation notes:
- `mockttp.getLocal({ https: { key: ca.key, cert: ca.cert }, recordTraffic: false })`.
- `beforeRequest(req)`: build `{method, host, path, query, bodyText}` (host from req.headers.host or URL), call `mocks.match(...)`. On hit: `recordHit`, remember `requestId → ruleId` in a Map, optional `delayMs` via setTimeout-promise, return `{ response: { statusCode, headers, body } }`. On miss: return `{}`.
- `on('request')`: map mockttp `CompletedRequest` → `CapturedRequest` (body via `req.body.getText()` — if undefined/binary use base64 of `buffer`, cap at `BODY_CAPTURE_LIMIT`, set `truncated`). Push to TrafficStore.
- `on('response')`: map → `CapturedResponse`, attach `mockRuleId` from the Map (then delete entry), `durationMs` from request timestamp.
- `on('abort')`: TrafficStore.abort.
- Read mockttp's installed types in `node_modules/mockttp/dist/` if signatures are unclear — do not guess API shapes.

### `src/mocks/matcher.ts` (pure, fully unit-tested)
```ts
export function globToRegex(pattern: string): RegExp;   // '*' → any chars (incl. empty, incl. '/'), '?' → single char; everything else escaped; anchored ^$; case-insensitive for hosts
export interface MatchInput { method: string; host: string; path: string; query: string; bodyText: string }
export function ruleMatches(rule: MockRule, input: MatchInput): boolean;
export function pickRule(rules: MockRule[], input: MatchInput): MockRule | undefined; // enabled only; priority desc, then createdAt asc
```
Matching semantics: `method` undefined/empty = any (compare upper-cased). `hostPattern` empty/undefined = any host. `pathPattern` required, matched against path WITHOUT query string. `queryContains` = substring of raw query. `bodyMatch.mode`: `none` → ignore; `contains` → bodyText includes value; `exact` → bodyText === value.

### `src/mocks/store.ts`
```ts
export class MockStore extends EventEmitter {
  static load(filePath: string): Promise<MockStore>;    // tolerant of missing/corrupt file → empty
  snapshot(): MocksSnapshot;
  createRule(input: MockRuleInput): MockRule;
  updateRule(id: string, patch: Partial<MockRuleInput>): MockRule;   // throws Error('not found')
  deleteRule(id: string): void;
  createFolder(name: string, parentId: string | null): MockFolder;
  updateFolder(id: string, patch: { name?: string; parentId?: string | null }): MockFolder; // reject cycles
  deleteFolder(id: string): void;   // children folders + rules reparented to deleted folder's parent
  match(input: MatchInput): MockRule | undefined;        // delegates to pickRule over enabled rules
  recordHit(id: string): void;
  // every mutation: persist (atomic, debounced ~100ms ok) + emit 'event' with {type:'mocks-updated'}
}
```
IDs: `crypto.randomUUID()`.

### `src/devices/android.ts`
```ts
export async function adbStatus(): Promise<{ available: boolean; version?: string }>;
export async function listAndroidDevices(): Promise<AndroidDevice[]>;   // `adb devices -l`; isEmulator = serial starts with 'emulator-'; proxyConfigured via `settings get global http_proxy` per device (parallel, tolerate failures)
export async function setupAndroid(serial: string, opts: { proxyPort: number; apiPort: number; lanIp: string | null; ca: CaMaterial }): Promise<AndroidSetupResult>;
export async function teardownAndroid(serial: string): Promise<void>;   // settings put global http_proxy :0
```
`setupAndroid` steps (collect human-readable progress strings into `messages`):
1. proxyHost = emulator ? `10.0.2.2` : lanIp (if null + physical device → proxySet false + message).
2. `adb -s S shell settings put global http_proxy host:proxyPort`.
3. Cert — try system install: `adb -s S root` → `adb -s S wait-for-device` → `adb -s S remount` → on success push PEM to `/system/etc/security/cacerts/<androidCertName>` + `chmod 644` → certMode `system`. Any step fails → fallback: push PEM to `/sdcard/Download/frigg-ca.crt`, `am start -a android.settings.SECURITY_SETTINGS`, certMode `user-manual` + message telling user: Settings → Security → Encryption & credentials → Install a certificate → CA certificate → pick `frigg-ca.crt` from Downloads. Note in message: apps targeting API 24+ only trust user CAs if their `networkSecurityConfig` allows it (debug builds should add it).
4. Never throw — failures become `messages` entries.

### `src/devices/ios.ts`
```ts
export async function xcrunStatus(): Promise<{ available: boolean }>;
export async function listBootedSimulators(): Promise<IosSimulator[]>;  // `xcrun simctl list devices booted -j`
export async function installSimCert(udid: string): Promise<{ ok: boolean; message: string }>; // `xcrun simctl keychain <udid> add-root-cert <caCertPath>`
```

### `src/devices/macos-proxy.ts`
```ts
export async function getMacProxyState(): Promise<{ enabled: boolean; service: string | null }>;
export async function setMacProxy(enabled: boolean, port: number): Promise<{ ok: boolean; message: string }>;
```
Active service: parse `networksetup -listallnetworkservices` + check `-getwebproxy` per service, or use `route get default` interface → match service via `networksetup -listallhardwareports`. Keep simple: try 'Wi-Fi' first, fall back to first non-disabled service. Enable = `-setwebproxy <svc> 127.0.0.1 <port>` + `-setsecurewebproxy <svc> 127.0.0.1 <port>`; disable = `-setwebproxystate <svc> off` + `-setsecurewebproxystate <svc> off`. iOS Simulator inherits macOS proxy — that is why this exists.

### `src/api/ws.ts`
```ts
export class WsHub {
  constructor(httpServer: http.Server, path: '/ws');
  broadcast(ev: ServerEvent): void;
}
```

### `src/api/setup-page.ts`
```ts
export function setupPageHtml(opts: { lanIp: string | null; proxyPort: number; apiPort: number; fingerprint: string; qrDataUrl: string }): string;
```
Self-contained dark-themed HTML (inline CSS, no build step): big title, 3 numbered steps — (1) connect device to same Wi-Fi, set manual proxy to `<lanIp>:<proxyPort>`; (2) download CA cert (`/cert.pem`, `/cert.crt` for Android, `/cert.der`); (3) trust it — iOS: Settings → General → VPN & Device Management → install profile, then Settings → General → About → Certificate Trust Settings → enable full trust; Android: Settings → Security → Install CA certificate. QR code `<img src={qrDataUrl}>` pointing at this page URL.

### `src/api/router.ts`
```ts
export interface ApiDeps { traffic: TrafficStore; mocks: MockStore; ca: CaMaterial; proxyPort: number; apiPort: number }
export function buildRouter(deps: ApiDeps): express.Router;
```
Routes (all JSON under `/api`, errors → `{ error: string }` with 400/404):
```
GET    /api/status                       → ProxyStatus
GET    /api/traffic                      → TrafficExchange[]
DELETE /api/traffic                      → { ok: true }
GET    /api/mocks                        → MocksSnapshot
POST   /api/mocks/rules                  body MockRuleInput → MockRule
PUT    /api/mocks/rules/:id              body Partial<MockRuleInput> → MockRule
DELETE /api/mocks/rules/:id              → { ok: true }
POST   /api/mocks/folders                body { name, parentId } → MockFolder
PUT    /api/mocks/folders/:id            body { name?, parentId? } → MockFolder
DELETE /api/mocks/folders/:id            → { ok: true }
GET    /api/devices                      → DevicesSnapshot
POST   /api/devices/android/:serial/setup    → AndroidSetupResult
POST   /api/devices/android/:serial/teardown → { ok: true }
POST   /api/devices/ios/:udid/install-cert   → { ok, message }
POST   /api/devices/macos-proxy          body { enabled: boolean } → { ok, message }
```
Non-API routes (same express app, registered in router or index): `GET /setup` (html), `GET /cert.pem`, `GET /cert.crt` (PEM, content-type application/x-x509-ca-cert, download filename frigg-ca.crt), `GET /cert.der`.

### `src/index.ts` (wiring)
ensureFriggDirs → ensureCa → MockStore.load → TrafficStore → ProxyEngine.start → express app (`express.json({ limit: '5mb' })`, router, static `../web/dist` if exists w/ SPA fallback) → http server :4848 → WsHub → pipe `traffic.on('event')` + `mocks.on('event')` → `hub.broadcast`. Console banner: UI URL, proxy host:port, setup page URL, cert fingerprint. Graceful SIGINT: engine.stop().

## Web app (React 19 + Tailwind v4 + zustand)

Files owned by web-core: `src/api/client.ts`, `src/api/ws.ts`, `src/store.ts`, `src/App.tsx`, `src/components/*` (shared), `src/screens/TrafficScreen.tsx` + traffic components.
Files owned by web-mocks: `src/screens/MocksScreen.tsx`, `src/components/mocks/*`.
Files owned by web-devices: `src/screens/DevicesScreen.tsx`, `src/components/devices/*`, `src/components/onboarding/*`.

### `src/store.ts` contract (zustand) — other screens depend on EXACTLY this
```ts
export type Screen = 'traffic' | 'mocks' | 'devices';
interface AppState {
  screen: Screen; setScreen(s: Screen): void;
  status: ProxyStatus | null;
  wsConnected: boolean;
  exchanges: TrafficExchange[];            // insertion order (oldest first)
  selectedExchangeId: string | null; selectExchange(id: string | null): void;
  folders: MockFolder[]; rules: MockRule[];
  selectedFolderId: string | null; selectFolder(id: string | null): void;
  editingRule: MockRule | 'new' | null;    // 'new' = blank editor
  draftFromExchange: TrafficExchange | null;  // prefill source
  openRuleEditor(rule: MockRule | 'new'): void; closeRuleEditor(): void;
  createMockFromExchange(ex: TrafficExchange): void;  // sets screen='mocks', editingRule='new', draftFromExchange=ex
  devices: DevicesSnapshot | null;
  loadAll(): Promise<void>;                // status + traffic + mocks + devices
  refreshMocks(): Promise<void>; refreshDevices(): Promise<void>; refreshStatus(): Promise<void>;
  clearTraffic(): Promise<void>;
  applyEvent(ev: ServerEvent): void;       // request/response/abort upsert exchange (replace by id); traffic-cleared → []; mocks-updated → refreshMocks(); devices-updated → refreshDevices()
}
export const useAppStore: UseBoundStore<StoreApi<AppState>>;
```

### `src/api/client.ts`
Typed thin wrappers, base `''` (vite proxies `/api`): `getStatus, getTraffic, clearTraffic, getMocks, createRule, updateRule, deleteRule, createFolder, updateFolder, deleteFolder, getDevices, setupAndroid, teardownAndroid, installIosCert, setMacosProxy`. Throw on `!res.ok` with server `error` message.

### `src/api/ws.ts`
`export function connectWs(onEvent: (ev: ServerEvent) => void, onStatus: (connected: boolean) => void): () => void` — connects `ws(s)://${location.host}/ws`, JSON-parses messages, reconnects with 1s→5s backoff, returns cleanup.

### UI design language
Dark, dense, data-first (HTTP-tool aesthetic). bg `zinc-950`, panels `zinc-900`, borders `zinc-800`, text `zinc-200/400`. Accent **emerald-400** (Frigg = norse sky goddess, aurora vibe). Method badges: GET emerald, POST sky, PUT amber, PATCH violet, DELETE rose. Status: 2xx emerald, 3xx sky, 4xx amber, 5xx rose. URLs/paths/bodies in mono font. Mocked responses get a distinctive ⚡ emerald "MOCK" chip. Layout: fixed left sidebar (logo, nav icons+labels, bottom: ws status dot + proxy `host:port`), main content per screen.

### Screens
- **TrafficScreen**: toolbar (text filter on url/host, method select, pause toggle, clear). Table rows (render only last 500): method badge | status | host (dim) + path (bright, mono, truncated) | MOCK chip if mocked | duration | time. Click → right detail panel (~45% width): request line, tabs Request/Response: header k/v table, body viewer (pretty-print JSON when content-type json or parse succeeds, otherwise raw; base64 → show "binary, N bytes"), copy-body button. Prominent "⚡ Create mock" button → `createMockFromExchange`. Empty state: friendly instructions pointing at Devices screen.
- **MocksScreen**: 3 columns. Left: folder tree (nested, All Mocks root, + new folder inline input, rename/delete on hover, drag not required). Middle: rules of selected folder (toggle enabled switch, name, method+path summary, hit count, click → editor, + New mock). Right: editor panel (name; matcher: method select [ANY,GET,POST,PUT,PATCH,DELETE,...], host pattern, path pattern, query contains, body match mode+value; response: status, headers k/v list editor, body textarea w/ mono + "Format JSON" button, delay ms; folder select; priority number). Save/Cancel/Delete. When `draftFromExchange` set: prefill from exchange (method, host, path, response status/headers/body when available — strip hop-by-hop + content-length/encoding headers) then clear draft.
- **DevicesScreen**: status of proxy at top (LAN IP, ports, cert fingerprint, link to `/setup` opened via API origin). Sections: **Android** (adb status; device cards: model, serial, emulator chip, proxy state, [Set up interception] [Remove] buttons, result messages list rendered after setup); **iOS Simulator** (booted sims, [Install CA cert] per sim, macOS proxy toggle with explanation that simulators use the Mac's proxy, warning that it affects the whole Mac); **Any device (manual)** card: shows `proxy host:port`, link+QR mention to setup page, short cert-trust steps for iOS and Android.
- **Onboarding**: first-run overlay (localStorage `frigg-onboarded`), 3 steps: 1) What Frigg does (device → Frigg → internet diagram, simple divs); 2) Connect a device (explains the three paths: Android ADB 1-click, iOS sim 1-click cert, manual+QR); 3) HTTPS & trust (CA cert concept, Android API 24+ caveat). CTA "Open Devices" → devices screen.

## Testing
- Vitest (server): `test/matcher.test.ts` — globToRegex cases (`*`, `?`, escaping, anchoring), ruleMatches per matcher field, pickRule priority/createdAt ordering. `test/store.test.ts` — CRUD, folder reparenting on delete, cycle rejection, persistence roundtrip via tmp dir.
- E2E (manual, post-build): start server, `curl -x localhost:8888` against a mock rule (no upstream needed), API smoke, UI via browser.

## Conventions
- TypeScript strict everywhere. ESM (`type: module`). Server imports between local files use `.ts` extension (tsx + allowImportingTsExtensions; tsc is noEmit-only).
- No code comments (user rule) — self-explanatory naming.
- Domain types ONLY from `@frigg/shared`.
- Errors: server modules never crash the process on device-tool failures; degrade into result messages.
