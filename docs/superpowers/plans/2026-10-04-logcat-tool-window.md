# Logcat Tool Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Logcat an automatically streaming, resizable bottom tool window available from a new right-side tool rail without replacing the active screen.

**Architecture:** Keep primary screen routing in the left navigation. Add a shell-level right rail and a central vertical workspace that can dock the always-mounted Logcat panel beneath the active screen. A serialized session coordinator follows the active device and package selection independently of panel visibility; Android stream startup no longer clears the device buffer.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind CSS, Vitest, Express, Electron Builder.

**Spec:** `docs/superpowers/specs/2026-10-04-logcat-tool-window-design.md`

## Global Constraints

- Keep primary screen state in `Screen`; Logcat is a tool panel, not a primary route.
- Capture follows a connected Android device or booted iOS simulator; physical iOS log streaming remains unsupported.
- The tool panel may be hidden while its selected log stream continues; navigation changes do not own that stream.
- Do not run `adb logcat -c` during stream startup or retargeting.
- Reuse `/api/logs/start`, `/api/logs/stop`, `/api/logs`, existing WebSocket events, and existing resizable panel storage.
- Add no runtime dependencies and no MCP capability.

## Review Focus

1. **Android history is preserved:** startup and package changes must not invoke `adb logcat -c`; cover with the LogcatManager process-boundary test in Task 1.
2. **A failed stream does not retry on every render:** same target and package remain idle after failure until retry or target changes; cover in Task 2.
3. **The last selected device wins during rapid changes:** a delayed older start cannot replace a newer target; cover in Task 2.
4. **Disconnect and reconnect do not leave a stale stream:** the old target is stopped/cleared and an available target can resume; cover with device selection/controller verification in Tasks 2 and 5.
5. **Hidden Logcat does not steal main-screen shortcuts:** collection continues while hidden, but Cmd/Ctrl+F remains with the visible screen; verify in Tasks 4 and 5.

---

### Task 1: Preserve Android log history on stream startup

**Files:**
- Modify: `packages/server/src/logcat/manager.ts`
- Create: `packages/server/test/logcat-manager.test.ts`

**Interfaces:**
- Consumes: `LogcatManager.start(target, opts)` and current Android log process arguments.
- Produces: Android streams start using `adb -s <serial> logcat -v threadtime` without issuing a separate `adb logcat -c` command.

- [ ] **Step 1: Write the failing manager test**

Mock only the child-process boundary. Give the fake child a real `EventEmitter`, `PassThrough` stdout/stderr streams, and a `kill` method so `LogcatManager` lifecycle remains real.

```typescript
it('starts Android logcat without clearing the device buffer', async () => {
  const manager = new LogcatManager();
  const status = await manager.start({
    platform: 'android',
    id: 'emulator-5554',
    label: 'Pixel 8',
  });

  expect(status.streaming).toBe(true);
  expect(execFile).not.toHaveBeenCalled();
  expect(spawn).toHaveBeenCalledWith('adb', [
    '-s', 'emulator-5554', 'logcat', '-v', 'threadtime',
  ], expect.any(Object));

  await manager.dispose();
});
```

- [ ] **Step 2: Run the focused test and confirm the expected failure**

Run: `npm run test -w @frigg/server -- --run test/logcat-manager.test.ts`

Expected: FAIL because `execClear` invokes `execFile` before spawning the log stream.

- [ ] **Step 3: Remove the startup clear**

Delete the `execClear` call and helper from `packages/server/src/logcat/manager.ts`. Keep `LogcatManager.clear()` and `/api/logs` behavior unchanged; those clear only the viewer's current list.

- [ ] **Step 4: Run focused and full server tests**

Run: `npm run test -w @frigg/server -- --run test/logcat-manager.test.ts`

Expected: PASS, with no `execFile` call. Then run `npm run test -w @frigg/server` and confirm the server suite passes.

- [ ] **Step 5: Commit the isolated server behavior**

```bash
git add packages/server/src/logcat/manager.ts packages/server/test/logcat-manager.test.ts
git commit -m "fix: preserve Android logs when starting Logcat"
```

### Task 2: Coordinate automatic Logcat sessions

**Files:**
- Create: `packages/web/src/components/logcat/session.ts`
- Create: `packages/web/src/components/logcat/session.test.ts`
- Create: `packages/web/src/components/logcat/LogcatSessionController.tsx`
- Modify: `packages/web/src/store.ts`
- Modify: `packages/web/src/components/logcat/LogcatDevicePicker.tsx`
- Modify: `packages/web/src/components/logcat/LogcatPackagePicker.tsx`

**Interfaces:**
- Consumes: `LogTarget`, `LogSessionStatus`, `StartLogsInput`, and current Zustand device selection.
- Produces: `LogcatSessionCoordinator.setDesiredSession(target, packageFilter)` and `retry()`. The app-shell controller starts one stream for the active target/package, serializes changes, and stops when the target becomes unavailable.

- [ ] **Step 1: Write a failing coordinator test for auto-start and deduplication**

```typescript
it('starts once for a selected target and ignores repeated syncs', async () => {
  const start = vi.fn(async (input: StartLogsInput) => ({
    streaming: true,
    target: { platform: input.platform, id: input.id, label: input.label },
    packageFilter: input.packageFilter ?? null,
    error: null,
  }));
  const coordinator = new LogcatSessionCoordinator({
    start,
    stop: vi.fn(async () => ({ streaming: false, target: null, packageFilter: null, error: null })),
    onStatus: vi.fn(),
  });
  const target = { platform: 'android' as const, id: 'emulator-5554', label: 'Pixel 8' };

  await coordinator.setDesiredSession(target, '');
  await coordinator.setDesiredSession(target, '');

  expect(start).toHaveBeenCalledTimes(1);
  expect(start).toHaveBeenCalledWith({
    platform: 'android', id: 'emulator-5554', label: 'Pixel 8', packageFilter: undefined,
  });
});
```

- [ ] **Step 2: Run the focused web test and confirm the expected failure**

Run: `npm exec vitest -- run packages/web/src/components/logcat/session.test.ts`

Expected: FAIL because `LogcatSessionCoordinator` does not exist yet.

- [ ] **Step 3: Implement the serialized coordinator**

Define the exact `LogcatSessionCoordinator` interface in `session.ts`. Queue start/stop requests, derive a stable key from platform, target ID, and normalized package filter, skip duplicate keys, discard stale status completions, and allow `retry()` to force one new attempt. Keep server calls injected as `start` and `stop` functions.

- [ ] **Step 4: Add tests for retargeting, package changes, retry, and stale starts**

Use deferred promises to make target A's start complete after target B is requested. Assert that B is the final start request and A's delayed status is ignored. Assert a package change restarts once, the same failed selection does not loop, `retry()` reattempts once, and a null target stops the active session.

- [ ] **Step 5: Connect the coordinator to app state**

Mount `LogcatSessionController` once in `App`. It observes `logTarget` and `logPackage` even while the panel is hidden, passes API status into Zustand, and retries only on an explicit error action or a new valid target. Make the device picker clear a stale target on disconnect and remain enabled while streaming. Keep package selection enabled and retarget through the coordinator when it changes.

- [ ] **Step 6: Run focused tests and the web typecheck**

Run: `npm exec vitest -- run packages/web/src/components/logcat/session.test.ts`

Expected: PASS. Then run `npm run build -w @frigg/web` and confirm TypeScript and Vite production compilation pass.

- [ ] **Step 7: Commit the session coordination changes**

```bash
git add packages/web/src/components/logcat/session.ts packages/web/src/components/logcat/session.test.ts packages/web/src/components/logcat/LogcatSessionController.tsx packages/web/src/store.ts packages/web/src/components/logcat/LogcatDevicePicker.tsx packages/web/src/components/logcat/LogcatPackagePicker.tsx
git commit -m "feat: stream Logcat for the active device"
```

### Task 3: Add the right-side tool rail and bottom workspace panel

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/store.ts`
- Modify: `packages/web/src/i18n/common.ts`
- Modify: `packages/web/src/components/ResizeHandle.tsx` only if the current saved size needs viewport clamping.

**Interfaces:**
- Consumes: existing `Screen` navigation, `LogcatSessionController`, `useResizable`, and `ResizeHandle`.
- Produces: primary navigation remains unchanged except for removing Logcat; the right rail toggles a global Logcat tool window without changing `screen`.

- [ ] **Step 1: Remove Logcat from primary route state**

Remove `'logcat'` from `Screen` and from `NAV_GROUPS`, then remove the `screen === 'logcat'` route branch in `App.tsx`. Keep all other primary routes and the default Traffic route unchanged.

- [ ] **Step 2: Add the right-side rail**

Add an accessible right `aside` labeled in Portuguese and English. Include a Logcat icon button with `aria-pressed` reflecting open state and a title/label. Clicking it toggles the tool panel and leaves `screen` unchanged.

- [ ] **Step 3: Dock Logcat below the current primary screen**

Wrap the main route and Logcat panel in a vertical flex workbench between the left navigation and right rail. Use `useResizable('logcat.panel', 300, { axis: 'y', min: 180, max: 640 })` and a horizontal `ResizeHandle` only when open. Keep Logcat mounted while hidden to preserve filters and scroll state; ensure both workspace regions use `min-h-0` and clamp restored panel height to the available viewport.

- [ ] **Step 4: Connect close and toggle controls**

Pass a close callback to the panel header. Closing via the header or right rail only hides the panel and must not stop the stream. Keep the active main feature mounted while opening, closing, and resizing Logcat.

- [ ] **Step 5: Check primary route and shell behavior**

Build the web package. In the desktop app, open Logcat while Traffic, Database, and Mocks are selected; confirm each primary screen remains visible above the bottom panel and the right rail remains present.

- [ ] **Step 6: Commit the workspace layout**

```bash
git add packages/web/src/App.tsx packages/web/src/store.ts packages/web/src/i18n/common.ts packages/web/src/components/ResizeHandle.tsx
git commit -m "feat: dock Logcat in the app workspace"
```

### Task 4: Adapt Logcat controls and states for a persistent panel

**Files:**
- Rename: `packages/web/src/screens/LogcatScreen.tsx` to `packages/web/src/components/logcat/LogcatPanel.tsx`
- Modify: `packages/web/src/components/logcat/LogcatToolbar.tsx`
- Modify: `packages/web/src/components/logcat/LogcatStatusBar.tsx`
- Modify: `packages/web/src/components/logcat/LogcatEmptyState.tsx`
- Modify: `packages/web/src/i18n/logcat.ts`
- Modify: `packages/web/src/App.tsx`

**Interfaces:**
- Consumes: open/close and retry callbacks from the app shell; streaming state and error from Zustand.
- Produces: a compact Logcat toolbar without the Start/Stop toggle, an error retry action, and empty/status copy that reflects automatic collection.

- [ ] **Step 1: Make panel keyboard handling visibility-aware**

Pass a `visible` prop to `LogcatPanel`. Register Cmd/Ctrl+F only while visible; preserve the current find bar, active-match navigation, and scroll behavior.

- [ ] **Step 2: Remove manual start/stop controls**

Remove the Play/Stop toggle and Start/Stop translations. Keep target, package, level, text, clear, autoscroll, and count controls. Keep target and package pickers enabled during streaming; selection changes go through the session coordinator.

- [ ] **Step 3: Add stream error and retry presentation**

Display `logStatus.error` in the status area and show a Retry control only after an error. Retry invokes the coordinator's explicit retry path. No selected target keeps the existing device-selection action; idle text no longer asks the user to press Start.

- [ ] **Step 4: Update English and Portuguese tool labels and copy**

Add localized right-rail labels and update Logcat empty, retry, status, and error copy. Confirm both bundles have matching keys.

- [ ] **Step 5: Build and inspect compact-panel behavior**

Run `npm run build -w @frigg/web`. In the desktop app, verify Cmd/Ctrl+F works in the primary screen while Logcat is hidden and in Logcat while visible; confirm panel filters and scroll state remain after hide/show.

- [ ] **Step 6: Commit the panel UI**

```bash
git add packages/web/src/App.tsx packages/web/src/screens/LogcatScreen.tsx packages/web/src/components/logcat packages/web/src/i18n/common.ts packages/web/src/i18n/logcat.ts
git commit -m "feat: adapt Logcat controls for a docked panel"
```

### Task 5: Build, install, and verify the test app

**Files:**
- Build artifact: `packages/desktop/release/Frigg-1.6.0-arm64.dmg`
- Installed bundle: `/Applications/Frigg.app`

**Interfaces:**
- Consumes: complete Logcat implementation from Tasks 1–4.
- Produces: an arm64 DMG built from the active worktree and the updated app installed locally for manual testing.

- [ ] **Step 1: Build the complete desktop package**

Run: `npm run desktop:dist`

Expected: server TypeScript build, web TypeScript/Vite build, Electron main build, and arm64 DMG packaging complete successfully.

- [ ] **Step 2: Validate and install the DMG**

Run `hdiutil verify packages/desktop/release/Frigg-1.6.0-arm64.dmg`, gracefully quit Frigg, mount the DMG, stage the app bundle, validate version/architecture/signature, then replace `/Applications/Frigg.app` and launch it.

- [ ] **Step 3: Verify the requested user flow in the installed app**

With a connected Android device or booted iOS simulator, check all of the following: capture begins without Start; Logcat opens from the right rail while Traffic, Database, and Mocks remain in the workspace; the stream continues while hidden; device/package changes switch the stream; the panel resizes and retains its size; clear affects only the visible list; opening Android Logcat preserves device-side history.

- [ ] **Step 4: Confirm installed artifact and worktree state**

Confirm the installed app is version `1.6.0`/`arm64`, opens successfully, and the DMG checksum is valid. Confirm no traffic-device-filter files were staged or committed by these tasks.
