# Per-device traffic filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Traffic select any connected Android device, the shared macOS proxy group used by booted iOS simulators, or a paired physical iOS device and show requests captured through that listener.

**Architecture:** Keep the existing shared proxy for generic manual clients. Add a persisted port registry and a `DeviceProxyManager` that owns tagged `ProxyEngine` listeners for Android, paired physical iOS devices, and one stable macOS system-proxy group shared with all booted iOS simulators; add `clientDeviceId` to captured requests. Expose listener readiness in the Devices API, configure Android setup and the macOS system-proxy toggle to use their assigned listeners, and use device IDs plus legacy unassigned source addresses in the Traffic selector.

**Tech Stack:** TypeScript, Node.js, Express, `mockttp`, React, Zustand, shared `@frigg/shared` contracts, existing Android ADB and iOS tooling.

**Spec:** `docs/superpowers/specs/2026-10-03-per-device-traffic-filter-design.md`

## Global Constraints

- Scope: Android ADB devices, booted iOS simulators, and paired physical iOS devices.
- The shared proxy remains available for the host and manually configured clients.
- Each device listener passes its device ID to `ProxyEngine`; the engine writes that optional ID to `CapturedRequest` as `clientDeviceId`.
- Port assignments remain stable across Frigg restarts.
- A port collision is surfaced as that device's proxy error; the manager must not silently fall back to an untagged shared listener.
- Android setup continues to configure the device automatically, using its assigned endpoint.
- Paired physical iOS devices show dedicated endpoints; simulators share the macOS proxy group, which also contains Mac apps using the system proxy.
- Do not change iOS settings automatically.
- Existing buffered exchanges without device identity remain available as unassigned traffic. They cannot be attributed retroactively.
- New request and device fields are optional so stored events and older API payloads remain valid.
- If a device disconnects, stop its active listener during reconciliation but retain its port assignment so the endpoint remains stable on reconnect.
- No MCP capability or contract changes.
- Do not add or run tests for this task; implementation verification is limited to code review and `git diff --check` unless the user later asks for tests.

## Review Focus

- A device disappears while setup or listener startup is in progress; it must not leave Android configured to a listener that was never started.
- An assigned port is already occupied; only that device becomes unavailable and its requests must never be attributed through another listener.
- Shared-listener requests and old buffered requests have no `clientDeviceId`; they remain visible as unassigned traffic by normalized source address.
- Persisted port assignments contain a disconnected device or a device that returns after restart; keep its port stable and stop only listeners for absent targets.
- A listener reload or stop occurs while another listener has a request paused at a breakpoint; one listener must not release the other's paused requests.

---

### Task 1: Add device identity and listener-scoped breakpoint ownership

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/server/src/proxy/engine.ts`
- Modify: `packages/server/src/proxy/breakpoint-manager.ts`

**Interfaces:**
- `CapturedRequest.clientDeviceId?: string` identifies the namespaced target that owns the accepting listener. Existing shared-listener requests omit it.
- Extend `EngineDeps` with `clientDeviceId?: string` and `breakpointOwnerId?: string`; existing callers default to the shared owner.
- Extend breakpoint pause calls to accept an owner ID, and add `releaseOwner(ownerId: string): void`; keep `releaseAll()` for whole-server shutdown only.

- [x] Add optional `clientDeviceId` to `CapturedRequest` and preserve it in the `ProxyEngine.captureRequest` object. `TrafficStore` already stores the full request object, so it requires no transformation.
- [x] Resolve an omitted engine owner to `shared`, then pass the resolved `breakpointOwnerId` from `resolveBreakpointRequest` and `resolveBreakpointResponse` into `BreakpointManager.pauseRequest` and `pauseResponse`; breakpoint pause calls also default direct legacy callers to `shared`.
- [x] Track pause IDs by owner in `BreakpointManager`; when `resume` removes a pause, remove its owner mapping too. `releaseOwner` should abort and remove only IDs owned by the requested listener.
- [x] Change `ProxyEngine.stop()` to call `releaseOwner` for its resolved owner. Preserve `releaseAll()` as an explicit whole-manager operation.
- [x] Review that shared listener construction uses a stable owner such as `shared`, and device engines use their namespaced device IDs.
- [x] Run `rtk git diff --check` and inspect the request and breakpoint paths for optional-field compatibility and ownership cleanup.

### Task 2: Persist port assignments and manage per-device proxy engines

**Files:**
- Create: `packages/server/src/devices/device-proxy-registry.ts`
- Create: `packages/server/src/devices/device-proxy-manager.ts`
- Modify: `packages/server/src/lib/paths.ts`
- Modify: `packages/server/src/proxy/engine.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Define `DeviceProxyTarget` as `{ id: string; platform: 'android' | 'ios-simulator' | 'ios-device'; name: string; host: string | null }`.
- Define `DeviceProxyStatus` as `{ host: string | null; port: number | null; ready: boolean; error?: string }` and expose it as optional `proxy` on Android and physical iOS devices, and under macOS proxy tooling status for the shared simulator group. A null port represents registry exhaustion before a listener can be assigned.
- `DeviceProxyManager.reconcile(targets: DeviceProxyTarget[]): Promise<void>` starts listeners for current targets and stops listeners for absent targets without deleting their assignments.
- `DeviceProxyManager.ensureTarget(target: DeviceProxyTarget): Promise<DeviceProxyStatus>` starts or reuses one target listener before Android setup changes the device setting.
- `DeviceProxyManager.getStatus(id: string): DeviceProxyStatus | undefined` returns the stable assigned endpoint and current listener state.
- `DeviceProxyManager.reloadAll(): Promise<void>` reloads every active device listener; `stop(): Promise<void>` stops listeners and flushes the registry.

- [x] Add `deviceProxiesPath` under `~/.frigg` and implement a schema-versioned registry for `device ID -> port`. Persist updates with the same atomic temporary-file/rename pattern used by `AndroidProxyRegistry`; reject malformed persisted data with a clear error.
- [x] Allocate from ports `10000` through `19999`, excluding the active shared proxy port and every port already assigned in the registry. Persist a new assignment before trying to bind it. If the range is exhausted, return a status with `port: null` and an error; do not rewrite existing assignments when a listener cannot bind.
- [x] Implement `DeviceProxyManager` with the shared CA, mocks, traffic, breakpoint manager, and proxy-cert store dependencies. Construct one engine per target with `proxyPort`, `clientDeviceId: target.id`, and `breakpointOwnerId: target.id`.
- [x] Add an engine option to disable ephemeral fallback for device listeners while keeping the shared engine's existing fallback behavior. Store a per-target startup error if its assigned port is occupied, and expose `ready: false` with that error while allowing other listeners to start.
- [x] Make reconciliation serialized so overlapping device updates cannot create duplicate listeners or stop a listener after a newer target snapshot includes it.
- [x] Use endpoint hosts appropriate for each target: Android emulator `10.0.2.2`, physical Android and iOS targets the current LAN IP; report `host: null` when no reachable LAN IP is available.
- [x] Run `rtk git diff --check` and inspect restart, collision, disconnected-device, and invalid-registry paths.

### Task 3: Integrate listener lifecycle with startup, Devices API, and Android setup

**Files:**
- Create: `packages/server/src/devices/device-proxy-targets.ts`
- Modify: `packages/server/src/start.ts`
- Modify: `packages/server/src/api/router.ts`
- Modify: `packages/server/src/devices/device-watcher.ts`
- Modify: `packages/server/src/devices/android.ts`
- Modify: `packages/server/src/devices/android-proxy-registry.ts` only if lease reconciliation requires a focused helper
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Extend `ApiDeps` with optional `deviceProxies?: DeviceProxyManager` and pass it from `startFrigg`; optionality preserves existing router builders while production startup always supplies the manager.
- Per-device IDs are `android:<serial>` and `ios-device:<udid>`; all booted simulators share `ios-simulator:shared`.
- The Devices API continues returning `DevicesSnapshot`; Android and physical iOS targets have optional `proxy` status, while macOS proxy tooling reports the shared simulator-group listener status.

- [x] Add a target-building helper that maps connected Android and paired physical iOS devices to per-device IDs, and booted simulators to one stable `ios-simulator:shared` group target.
- [x] Extend device lifecycle polling so changes to supported Android and iOS targets trigger one serialized proxy reconciliation. Reuse the existing device listing functions and emit the existing `devices-updated` event when the target inventory changes.
- [x] In `startFrigg`, load the port registry, construct the manager, start/reconcile device listeners from the initial inventory, pass it into `ApiDeps`, and reload every listener when `reloadProxy` runs.
- [x] In `/api/devices`, reconcile against the freshly discovered inventory before responding, then attach each target's `DeviceProxyStatus` to the snapshot. Attach the simulator-group listener to macOS proxy tooling status. Keep the existing Android certificate metadata.
- [x] Route the macOS system-proxy toggle to the simulator-group listener so simulator and Mac system-proxy requests carry the group ID.
- [x] Migrate an already enabled macOS proxy from Frigg's shared listener to the group listener when its current endpoint matches the active Frigg proxy; recognize the group listener on later restarts for clean shutdown.
- [x] In Android setup, call `ensureTarget` for `android:<serial>` before changing `http_proxy`; configure the assigned host and port through the existing setup helper. Persist the new Frigg proxy lease before applying it and preserve the prior lease's `previousProxyValue` when migrating an already managed shared proxy.
- [x] If listener startup or Android setup fails, return a clear device-level error and do not mark a failed proxy assignment active. Teardown and shutdown must restore only Frigg-owned Android settings, stop all device listeners, flush the registry, and stop the shared engine.
- [x] Run `rtk git diff --check` and review startup failure, shutdown order, legacy Android lease, reload, and disconnect handling.

### Task 4: Show per-device proxy endpoints in device setup cards

**Files:**
- Modify: `packages/web/src/components/devices/AndroidDeviceCard.tsx`
- Modify: `packages/web/src/components/devices/PhysicalIosCard.tsx`
- Modify: `packages/web/src/i18n/devices.ts`
- Modify: `packages/web/src/components/devices/ManualSection.tsx` only if shared-listener copy needs clarification

**Interfaces:**
- Android and physical iOS cards read their optional `device.proxy` status from the Devices snapshot.
- Android proxy-state comparison uses that target's endpoint; the macOS tooling status exposes the shared simulator-group listener.
- Generic manual-client instructions continue using the shared proxy endpoint.

- [x] Update Android card's Frigg address comparison to use `device.proxy.host` and `device.proxy.port`; preserve setup/teardown actions and show an unavailable state when the listener cannot start.
- [x] Keep simulator cards free of per-simulator endpoints; explain that booted simulators share the macOS system proxy and group traffic with Mac apps using that proxy.
- [x] Change the physical iOS card from the shared port to its dedicated device endpoint and keep the current manual setup steps and reset guidance.
- [x] Add English and Portuguese labels for endpoint, copy action, unavailable listener, and simulator group explanation using the existing device bundle conventions.
- [x] Run `rtk git diff --check` and compare displayed Android and physical iOS endpoints with their API listener endpoints.

### Task 5: Replace Traffic's source-IP selector with device and unassigned filters

**Files:**
- Modify: `packages/web/src/screens/TrafficScreen.tsx`
- Modify: `packages/web/src/components/traffic/TrafficToolbar.tsx`
- Modify: `packages/web/src/i18n/traffic.ts`

**Interfaces:**
- Represent selection as `all`, `{ kind: 'device'; id: string }`, or `{ kind: 'address'; address: string }`.
- Device options come from `DevicesSnapshot`; use the established namespaced IDs and the same display names shown on device cards.
- Address options come only from observed exchanges with no `clientDeviceId`; normalize IPv4-mapped IPv6 addresses for equality while preserving a readable label.

- [x] Build options from Android devices, one shared option for all booted iOS simulators, paired physical iOS devices, and the macOS group when it is active or has buffered requests, including targets whose listener reports unavailable; append Android serials to distinguish devices with the same model/name.
- [x] Keep observed addresses as separate unassigned options; do not associate an address with a device based on matching IP or localhost.
- [x] Filter device selections by exact `request.clientDeviceId`, and address selections by normalized `request.clientAddress` only when `clientDeviceId` is absent.
- [x] Preserve the current initial active-Android behavior by selecting its namespaced ID when it exists in the Devices snapshot; allow the user to select any listed target afterward.
- [x] Preserve All devices and all existing method, text, connectivity, pause, clear, selection, and render-limit behaviors. When a selected device has no requests, pass its display name to the existing waiting/empty state.
- [x] Add English and Portuguese labels for unassigned-source grouping and device status where needed. Keep old buffered requests visible as unassigned.
- [x] Run `rtk git diff --check` and review All, one Android device, the grouped iOS simulator proxy, one physical iOS device, an unavailable target, and an unassigned localhost source by tracing their filter predicates.

### Task 6: Final integration review

**Files:**
- Review: all files changed in Tasks 1–5
- Modify: only files required to resolve integration inconsistencies found during review

- [x] Trace one Android emulator request end to end: target ID -> persisted distinct port -> listener -> `clientDeviceId` -> Devices snapshot option -> Traffic filter match.
- [x] Trace one physical Android setup, the macOS proxy toggle for the simulator group, and one physical iOS manual setup end to end; confirm each endpoint matches its listener and the simulator group is disclosed as shared with Mac apps.
- [x] Trace shared and preexisting traffic end to end; confirm it remains unassigned and filterable by source address.
- [x] Review port registry compatibility, collision status, per-listener breakpoint release, device reconnect, proxy reload, and graceful shutdown against the approved spec.
- [x] Run `rtk git diff --check`, inspect `rtk git status --short`, and report any behavior that could not be verified without tests or live devices.
