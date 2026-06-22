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

---

## v0.2 — i18n, Logcat, Desktop (2026-06-12)

### i18n (pt-BR / English)
- Locale lives in the web store (`locale: 'en'|'pt'`, `setLocale`), persisted to `localStorage['frigg-locale']`, default from `navigator.language` (pt* → pt).
- `src/i18n/index.ts`: composes namespace bundles (`common`, `traffic`, `mocks`, `devices`, `onboarding`, `logcat`), exposes `useT(): (key, vars?) => string` and `useLocale()`. Keys are `namespace.key`; missing → en fallback → key. `{var}` interpolation.
- Each namespace file exports `{ en: Record<string,string>; pt: Record<string,string> }` with identical key sets. `common` (owned, do not expand in feature agents) holds nav/status/actions.
- Components use `const t = useT()` and replace every user-visible literal with `t('ns.key')`. Language toggle in the sidebar (EN/PT).
- Server-facing strings: the web client sends `X-Frigg-Locale` on every API call; the server localizes device setup messages + `/setup` page (also accepts `?lang=pt|en`).

### Logcat
- Shared types: `LogEntry`, `LogLevel` (V/D/I/W/E/F), `LogPlatform`, `LogTarget`, `LogSessionStatus`; ServerEvents `log-entry` / `log-cleared` / `log-status`.
- Server `src/logcat/manager.ts` (`LogcatManager extends EventEmitter`): one active session. `start(target, {packageFilter?})` stops any existing, spawns the device log process, parses lines → emits `{type:'log-entry', entry}`; `stop()`, `clear()`, `status`. Android: `adb -s <serial> logcat -v threadtime` (+ `--pid` resolved from `pidof <pkg>` when a package filter is set). iOS: simulator only via `xcrun simctl spawn <udid> log stream` (physical → status.error). Never crashes the process. Pure parsers in `parse-android.ts` / `parse-ios.ts` (unit-tested).
- Routes: `POST /api/logs/start` {platform,id,label,packageFilter?} → LogSessionStatus; `POST /api/logs/stop`; `DELETE /api/logs` (clear); `GET /api/logs/status`. Wired in `start.ts`; manager events piped to the WS hub.
- Web `screens/LogcatScreen.tsx` + `components/logcat/*`: device picker (from devices snapshot), package filter (server-side, re-starts session), client-side level + text filters, autoscroll, clear. Level-colored rows, mono message, last-N render cap. Store: `logEntries`, `logStatus`, `logTarget`, `logPackage`, `logFilters`, `startLogs/stopLogs/clearLogs`.

### Desktop (Electron)
- `packages/desktop`: Electron shell reusing the Node server. Dev: `npm run desktop` runs server + web (vite) + electron; the window loads the vite URL. Prod main calls `startFrigg()` (from `@frigg/server`) and loads `http://localhost:4848`. App menu, sane window chrome, quit stops the server. electron-builder config for packaging (best-effort).
- Server exposes `startFrigg(opts) => FriggHandles` from `@frigg/server` (`src/start.ts`); the CLI `index.ts` is a thin wrapper (banner + SIGINT).

---

## v0.3 — API Client (Postman-style) (2026-06-14)

A "Client" tab: workspaces → folders → requests, with environments, `{{var}}` interpolation, and pre-request/test scripts that chain values (e.g. login → extract accessToken → set env var → reused by other requests).

### Shared types (already in @frigg/shared)
ApiKeyValue {key,value,enabled}; ApiBody {mode:'none'|'json'|'raw'|'form', raw, form[]}; ApiRequest {id,workspaceId,folderId,name,method,url,query[],headers[],body,preScript,testScript,createdAt,updatedAt}; ApiRequestInput; ApiFolder {id,workspaceId,parentId,name,createdAt}; ApiEnvironment {id,workspaceId,name,variables[]}; ApiWorkspace {id,name,variables[],activeEnvironmentId,createdAt}; ApiClientSnapshot {workspaces,folders,requests,environments}; ApiTestResult {name,passed,error?}; ApiRunResult {ok,status,statusText,headers,bodyText,bodyTruncated,durationMs,sizeBytes,scriptLogs[],tests[],error,effectiveUrl}. API_RESPONSE_LIMIT = 2_000_000.

### Server (packages/server/src/api-client/)
- `store.ts` — `ApiClientStore extends EventEmitter`, persisted to `~/.frigg/api-client.json` (atomic write, debounced, tolerant load → seeds one default workspace + a "Default" environment when empty). Methods: `static load(path)`, `snapshot(): ApiClientSnapshot`, workspace CRUD (createWorkspace(name)→ws, updateWorkspace(id,patch), deleteWorkspace(id) cascades its folders/requests/environments), folder CRUD (createFolder(workspaceId,name,parentId), updateFolder, deleteFolder reparents children+requests to parent), request CRUD (createRequest(workspaceId,folderId)→blank request with sensible defaults: method GET, url '', body {mode:'none'}, empty scripts; updateRequest(id,patch); deleteRequest(id)), environment CRUD (create/update/delete; deleting the active env clears the workspace's activeEnvironmentId). IDs crypto.randomUUID(). Throws Error('not found'). No WS broadcast needed (single-user editing).
- `runner.ts` — `runRequest(store, request: ApiRequest): Promise<ApiRunResult>`:
  1. Resolve variables: merge workspace.variables (enabled) then active-environment.variables (env overrides workspace). 
  2. Run pre-request script (scripts.ts) with a mutable request copy + a vars map; the script may mutate request (method/url/headers/body) and set vars/env.
  3. Interpolate `{{var}}` in url, enabled query (append to url), enabled header values, and body (raw / form values) using the merged+script vars. Unknown vars → left as-is OR empty (choose empty string, but log a note).
  4. Send via node:http/https (or global fetch) with method/headers/body, timeout ~30s, follow up to 5 redirects, capture status, headers, body (cap API_RESPONSE_LIMIT, set bodyTruncated), durationMs, sizeBytes. Never throw — network errors → ApiRunResult{ok:false,error}.
  5. Run test script with pm.response. Collect pm.test results + console logs.
  6. Persist any env-var changes the scripts made (to the active environment; if none active, to workspace.variables). Return ApiRunResult.
- `scripts.ts` — runs user JS in `node:vm` with a constrained sandbox and a Postman-like `pm` API. Pre: `pm.environment.get/set/unset/has`, `pm.variables.get`, `pm.request` (mutable {method,url,headers:obj,body:string}), `console.log/warn/error`→logs. Test: `pm.response` ({code,status,responseTime,headers:obj,text(),json()}), `pm.environment.*`, `pm.variables.get`, `pm.test(name,fn)`, `pm.expect(v)` → minimal chain {toBe,toEqual,toBeTruthy,toBeDefined,toBeNull} throwing on failure, `console.*`. No require/process/fs/module access; wall-clock timeout (e.g. 5s) via vm timeout. Capture thrown errors into logs/tests without crashing the run.
- Routes in `router.ts` (ApiDeps gets `apiClient: ApiClientStore`): GET /api/client → snapshot; POST /api/client/workspaces {name} → {snapshot,id}; PUT/DELETE /api/client/workspaces/:id; POST /api/client/folders {workspaceId,name,parentId} → {snapshot,id}; PUT/DELETE /api/client/folders/:id; POST /api/client/requests {workspaceId,folderId} → {snapshot,id}; PUT/DELETE /api/client/requests/:id; POST /api/client/environments {workspaceId,name} → {snapshot,id}; PUT/DELETE /api/client/environments/:id; POST /api/client/run {request:ApiRequest} → ApiRunResult. Validate ids/shapes via the existing badRequest pattern; map not-found → 404. Create/run responses: create returns {snapshot,id}; mutations return the full snapshot; run returns ApiRunResult.
- Wire in start.ts: `const apiClient = await ApiClientStore.load(apiClientPath)`; pass into buildRouter; flush on stop. Add `apiClientPath` to lib/paths.ts (`~/.frigg/api-client.json`).
- Tests: scripts.ts (pm env set/get, pm.test pass/fail, expect throwing, interpolation) + runner interpolation + store CRUD/cascade.

### Web (packages/web/src/screens/ClientScreen.tsx + components/client/*)
Store slice already implemented (read store.ts): apiWorkspaces, apiFolders, apiRequests, apiEnvironments, activeWorkspaceId, selectedApiRequestId, apiRunResult, apiRunning + actions loadApiClient/setActiveWorkspace/create|rename|deleteWorkspace/create|rename|deleteApiFolder/create|update|deleteApiRequest/selectApiRequest/create|update|deleteEnvironment/setActiveEnvironment/runApiRequest.
- Layout (3 panes): left sidebar = workspace switcher (dropdown + new) + environment selector (active env dropdown + manage) + collection tree (nested folders + requests, like the mocks FolderTree; method-colored request rows; new folder / new request; rename/delete on hover). Middle/right = request editor for the selected request: a top row with method select + URL input (mono, {{var}} hint) + Send button (runApiRequest); tabs Params | Headers | Body | Pre-request | Tests. Params/Headers = key/value editors (enabled checkbox); Body = mode toggle (none/json/raw/form) + textarea (mono, Format JSON for json) or form kv editor; Pre-request/Tests = code textareas (mono) for the scripts with a short `pm.*` hint. The editor keeps a local draft, autosaves via updateApiRequest (debounced) or on blur, and Send runs the current draft.
- Response panel (below or right of editor): status pill (colored), time, size; tabs Body (pretty JSON when parseable) | Headers (kv) | Tests (pass/fail list) | Console (scriptLogs). Empty state before first send.
- Environment manager: edit the active environment's variables (kv editor) so scripts' set values are visible and editable; show {{accessToken}} etc.
- i18n: all strings under the 'client' namespace (en+pt); reuse common.action.*.

## v0.4 — Frida toolkit + AVD management (2026-06-21)

A "Frida" tab to instrument Android apps from the UI: install/run frida-server on a rooted emulator, inject scripts (attach or spawn) with live output, and manage AVDs. CLI-wrap approach (spawns the host `frida` CLI); `frida-node` deferred. Degrades to a banner when frida-tools isn't on the host.

### Shared types (in @frigg/shared)
FridaServerStatus {installed,running,version,deviceId,error}; FridaSessionStatus {running,deviceId,target,scriptId,error}; FridaMessage {id,timestamp,kind:'log'|'send'|'error'|'system',text}; FridaScript {id,name,source,builtin}; FridaSnapshot {serverStatus,sessionStatus,scripts,hostFridaVersion}; Avd {name,booted,serial}; AvdCreateResult {ok,message}. ServerEvent += `{type:'frida-server-status',status}` | `{type:'frida-session-status',status}` | `{type:'frida-message',message}`. FRIDA_MESSAGE_BUFFER_LIMIT = 2000.

### Server (packages/server/src/frida/)
- `frida-server-manager.ts` — `FridaServerManager extends EventEmitter`. `install(deviceId)`: read host `frida --version`, read device ABI (`getprop ro.product.cpu.abi` → `mapAbi`, pure+tested), download the matching `frida-server-<ver>-android-<abi>.xz` from GitHub releases (undici fetch with a 120s AbortSignal, rejects text/html), `xz -d`, `adb push` to `/data/local/tmp/frida-server`, `chmod 755`. `start(deviceId)`: idempotent (returns if already running), `adb root` (dual-check for "cannot run as root"), `setenforce 0`, detached `setsid frida-server &`, then poll `pidof` (`waitForRunning`, ~3s) to confirm. `stop`/`dispose`: `pkill -f frida-server`. Plain-English status strings (like LogcatManager). Emits `frida-server-status`.
- `frida-session.ts` — `FridaSession extends EventEmitter`. `run({deviceId,target,source,scriptId,spawnMode})`: stages the script to a temp file, spawns `frida -D <id> -n|-f <target> -l <script>` (PYTHONUNBUFFERED=1, stdin left open so the resident REPL keeps hooks alive — no `-q`, which would unload after load). Line-buffers stdout through `cleanFridaLine` (pure+tested): drops the REPL banner/prompt, parses `send()` payloads → kind 'send', else 'log'; stderr → 'error'. Stale-child guard + temp cleanup. Emits `frida-message` / `frida-session-status`.
- `examples.ts` — built-in `FridaScript[]` (toast on launch, replace text in UI, list loaded classes, root-check probe).
- `manager.ts` — `FridaManager extends EventEmitter` facade composing the two + re-emitting `'event'`; `snapshot()`, install/start/stop server, runScript/stopScript, `stop()` teardown.

### Server (packages/server/src/devices/)
- `avd.ts` — `listAvds()` (`emulator -list-avds` → `parseAvdList` pure+tested, cross-referenced with running emulators via `adb -s <serial> emu avd name`); `bootAvd(name)` (detached `emulator -avd`); `createRootedAvd(name,apiLevel)` (`avdmanager create` from an installed `google_apis;android-<api>;<hostAbi>` image; clear message guiding to Android Studio/sdkmanager when missing — no in-app image download). Resolves `emulator`/`avdmanager` via `ANDROID_HOME`/`ANDROID_SDK_ROOT`/`~/Library/Android/sdk`, falling back to PATH.
- `device-watcher.ts` — `DeviceWatcher extends EventEmitter` polls `adb devices` (2s) and emits `devices-updated` when the device list changes. One server poll broadcasts to every client.

### Routes (router.ts, ApiDeps gets `frida: FridaManager`)
GET /api/frida/snapshot; GET /api/frida/status?deviceId; POST /api/frida/install {deviceId}; POST /api/frida/server/start {deviceId}; POST /api/frida/server/stop {deviceId?}; POST /api/frida/run {deviceId,target,source,scriptId?,spawnMode?}; POST /api/frida/stop; GET /api/avd; POST /api/avd/boot {name}; POST /api/avd/create {name,apiLevel}.

### Wiring (start.ts)
`const frida = new FridaManager()`, `const deviceWatcher = new DeviceWatcher()`; both `.on('event', hub.broadcast)`; `deviceWatcher.start()`; teardown `frida.stop()` + `deviceWatcher.dispose()`.

### Web
- `screens/FridaScreen.tsx` + `components/frida/EmulatorPanel.tsx`. An Emulator section (unified chips by AVD name: running = selectable, stopped = boot, + create) and a separate labeled frida-server section (status pills + install/start/stop), then a script editor (recent-targets datalist + example dropdown) and a live console (`send`=emerald, errors=rose).
- Store slice: fridaDeviceId, fridaServerStatus, fridaSessionStatus, fridaMessages (batched flush like logcat), fridaScripts, fridaTarget/Source/ScriptId/SpawnMode, hostFridaVersion, fridaBusy, fridaRecentTargets (localStorage), avds, avdBusy + actions; applyEvent handles the 3 frida events; `devices-updated` refreshes devices + avds. i18n under the 'frida' namespace (en+pt).

### Host dependency
Requires `frida`/`frida-tools` on the host (`pipx install frida-tools`) and `xz` for install; a rooted `google_apis` emulator for frida-server. The UI shows a banner when frida-tools is absent.

### Tests
`cleanFridaLine` (REPL output parser), `mapAbi` (device→frida ABI), `parseAvdList` (emulator -list-avds output).
