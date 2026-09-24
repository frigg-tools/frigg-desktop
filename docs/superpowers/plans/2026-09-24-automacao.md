# Automação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Android automation feature in Frigg with a node canvas, ADB runner, saved run history, REST APIs, and equivalent MCP tools.

**Architecture:** Store versioned automation graphs and run snapshots in local Frigg files. A typed server runner validates a saved linear graph, acquires its chosen Android serial, executes safe ADB actions, persists progress and image artifacts, and serves identical contracts to the React UI and MCP. The editor uses React Flow, while all graph validation and execution stay server-side.

**Tech Stack:** TypeScript/Node 20, Express, Vitest/supertest, `@frigg/shared`, React 19, Zustand, Tailwind 4, React Flow (`@xyflow/react` 12.12.0), MCP SDK/Zod, ADB.

**Spec:** `docs/superpowers/specs/2026-09-24-automacao-design.md`

## Global Constraints

- First release accepts only a single path: exactly one start, one end, no branches, cycles, or disconnected nodes.
- Store runs with an immutable automation revision snapshot; restart marks live runs `interrupted` and never replays device commands.
- Set a maximum of 100 nodes, 10 minutes per run, 60 seconds per wait, 15 seconds per ADB command, and 10 seconds per gesture.
- Retain at most 100 completed runs and at most 500 MB of artifacts; never delete active runs to enforce retention.
- Use an explicit `adb -s <serial>` for every device command. Do not support free-form shell commands, JavaScript, root, retries, or iOS.
- The first text block accepts only tested ASCII letters, digits, spaces, and `.,:@/_-`; convert spaces to `%s`; reject other characters before execution.
- Store tap/swipe coordinates as normalized `[0, 1]` values with screenshot width, height, and rotation; refuse execution if a fresh capture has different geometry.
- Expose automation API, image, artifact, and run-detail endpoints to loopback callers only. Reject non-loopback requests, mismatched Host, and browser Origin values outside Frigg's local UI origins. Existing device setup and certificate endpoints must remain reachable as they are today.
- Do not publish automation events to the existing unauthenticated WebSocket broadcast. The UI polls the same run snapshot endpoint as MCP.
- Put public domain types/enums in `@frigg/shared`, visible copy in both English and Brazilian Portuguese, and generated MCP changes in both source and `plugin/mcp/frigg-mcp.mjs`.
- No user action on a device is rolled back. Stop on the first failed step; cancellation prevents later steps and aborts local waits/processes where possible.

## Review Focus

- A graph with duplicate starts, branch edges, a cycle, an orphan, or an unknown block must return a node-specific validation error before ADB is called.
- An offline, unauthorized, busy, or disconnected serial must fail the run without sending commands to another device.
- A screenshot with changed size or rotation must block coordinate actions rather than replaying stale points.
- Android's remote shell parses the command string after `adb execFile`; malicious or shell-significant text must be rejected before that boundary.
- A timeout can happen after an action reached the device; the server must not retry it, and an incomplete run after restart must not be resumed.

---

### Task 1: Central automation contracts and graph validation

**Files:**
- Create: `packages/shared/src/automation.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/server/src/automation/validation.ts`
- Create: `packages/server/src/automation/validation.test.ts`

**Interfaces:**
- Export `AUTOMATION_NODE_TYPE`, `AutomationNodeType`, `AUTOMATION_RUN_STATUS`, `AutomationRunStatus`, `AUTOMATION_STEP_STATUS`, `AutomationStepStatus`, `Automation`, `AutomationNode`, `AutomationEdge`, `AutomationRun`, `AutomationStepResult`, `AutomationActionData`, `AutomationValidationIssue`, and `AutomationValidationResult` from `@frigg/shared`.
- `validateAutomation(input: unknown): AutomationValidationResult` validates structure, name, revision-independent node/edge IDs, per-action parameters and the one-path graph. It has no filesystem, React, or ADB dependency.
- Node types are `start`, `end`, `launchApp`, `tap`, `longPress`, `swipe`, `text`, `key`, `wait`, and `screenshot`. Keys are an enum of `BACK`, `HOME`, `ENTER`, and `APP_SWITCH`.
- Points hold normalized `x`, `y`, `referenceWidth`, `referenceHeight`, and `referenceRotation`.

- [ ] **Step 1: Add contract tests for valid and malformed graphs.** Cover a linear graph, each node's valid parameters, duplicate IDs, missing endpoint, multiple starts, branching, cycle, orphan, invalid coordinates, oversized graph, unsupported text and an unknown node type.

```ts
it('rejects a branch before execution', () => {
  const result = validateAutomation(flowWithTwoOutgoingEdges);
  expect(result.valid).toBe(false);
  expect(result.issues[0]).toMatchObject({ code: 'branch_not_supported', nodeId: 'start' });
});
```

- [ ] **Step 2: Run the focused test and confirm the validator is missing.** `npm run test -w @frigg/server -- src/automation/validation.test.ts` must fail at import before implementation.
- [ ] **Step 3: Add shared enums and discriminated domain types.** Use the central enums in validation, persistence, API and UI; do not spread node/status string literals.
- [ ] **Step 4: Implement pure parsing and validation.** Reject malformed values rather than coercing; return issues with stable code and node/field locations. Sort by edges from the single start and prove the traversal visits every node exactly once.
- [ ] **Step 5: Run focused tests and server typecheck.** `npm run test -w @frigg/server -- src/automation/validation.test.ts` and `npm run build -w @frigg/server` must pass.

### Task 2: Automation definitions and revisions

**Files:**
- Create: `packages/server/src/automation/store.ts`
- Create: `packages/server/src/automation/store.test.ts`
- Modify: `packages/server/src/lib/paths.ts`

**Interfaces:**
- `AutomationStore.load(filePath: string): Promise<AutomationStore>` tolerates a missing file, but reports corrupt data without overwriting it.
- `snapshot(): Automation[]`, `get(id): Automation | undefined`, `create(input): Promise<Automation>`, `update(id, input, expectedRevision): Promise<Automation>`, `duplicate(id): Promise<Automation>`, `delete(id): Promise<void>`, and `flush(): Promise<void>`.
- Create assigns a UUID, revision 1 and timestamps. Update requires an exact revision, increments it once and preserves `id`/`createdAt`. Duplicate creates a new UUID/revision and copies graph positions/actions only. Delete rejects an active automation via an injected `isActive(id)` guard.
- Add `automationsPath` for `~/.frigg/automations.json`; serialize writes to a sibling temp file then rename.

- [ ] **Step 1: Test atomic CRUD, reload, revision conflict, duplicate identity, active-delete conflict, missing file and corrupt JSON preservation.** Inject a temporary path and a controlled active guard.

```ts
it('rejects a stale update without changing the current revision', async () => {
  const created = await store.create(validAutomation);
  await store.update(created.id, renamed, created.revision);
  await expect(store.update(created.id, staleEdit, created.revision)).rejects.toMatchObject({ code: 'revision_conflict' });
});
```

- [ ] **Step 2: Run the new test to confirm it fails before the store exists.** Use the focused Vitest command for `store.test.ts`.
- [ ] **Step 3: Implement serialized atomic storage and typed domain errors.** Validate every create/update input before writing. Leave a corrupt source file untouched and surface a recoverable error.
- [ ] **Step 4: Re-run store and validator tests.** Also typecheck the server.

### Task 3: Binary ADB adapter and typed action execution

**Files:**
- Modify: `packages/server/src/lib/exec.ts`
- Create: `packages/server/src/automation/adb.ts`
- Create: `packages/server/src/automation/adb.test.ts`

**Interfaces:**
- Add `runBuffer(cmd, args, { timeoutMs, signal }): Promise<{ ok: boolean; stdout: Buffer; stderr: Buffer; code: number | null }>` using `execFile`, capped stdout, kill signal and AbortSignal. Keep existing UTF-8 `run()` behavior unchanged.
- `AndroidAutomationDevice` exposes `assertReady(serial, signal)`, `screenshot(serial, signal)`, and `perform(serial, action, signal)`. `DeviceScreenshot` is `{ png: Buffer; width: number; height: number; rotation: 0 | 1 | 2 | 3 }`.
- Hide subprocess invocation behind an injected runner so tests assert exact argument arrays without a live ADB device.
- Parse PNG dimensions from the PNG IHDR bytes. Parse Android display rotation from `dumpsys input`; error if unavailable instead of assuming zero.

- [ ] **Step 1: Write adapter tests.** Assert command argument arrays always target the chosen serial; parse valid PNG dimensions; cover malformed PNG, non-ready device, screenshot failure, invalid rotation and abort.

```ts
it('encodes only supported text and targets one serial', async () => {
  await device.perform('emulator-5554', { type: 'text', text: 'Hi 42' }, signal);
  expect(exec).toHaveBeenCalledWith('adb', ['-s', 'emulator-5554', 'shell', 'input', 'text', 'Hi%s42'], expect.anything());
  await expect(device.perform('emulator-5554', { type: 'text', text: 'Hi;reboot' }, signal)).rejects.toMatchObject({ code: 'unsupported_text' });
});
```

- [ ] **Step 2: Verify the focused test fails before implementing the adapter.**
- [ ] **Step 3: Add binary subprocess support and implement safe typed ADB commands.** Use `monkey -p <package> -c android.intent.category.LAUNCHER 1`, `input tap`, `input swipe`, `input text`, allowlisted `input keyevent` values, and `exec-out screencap -p`. Cap and time every command.
- [ ] **Step 4: Validate tap/swipe normalized coordinates and geometry inside the adapter.** Reject a non-finite or out-of-range point and compare fresh screenshot width/height/rotation with each reference before issuing touch commands.
- [ ] **Step 5: Run ADB-adapter tests and typecheck.** Check mocked argument arrays, abort propagation, output cap and failure mapping.

### Task 4: Run persistence, sequential runner, and device lock

**Files:**
- Create: `packages/server/src/automation/run-store.ts`
- Create: `packages/server/src/automation/run-store.test.ts`
- Create: `packages/server/src/automation/runner.ts`
- Create: `packages/server/src/automation/runner.test.ts`
- Create: `packages/server/src/automation/manager.ts`
- Create: `packages/server/src/automation/manager.test.ts`

**Interfaces:**
- `AutomationRunStore.load(directory, limits)`, `snapshot(automationId?)`, `get(runId)`, `create(run)`, `update(runId, patch)`, `addArtifact(runId, png, metadata)`, `readArtifact(runId, artifactId)`, `deleteForAutomation(automationId)`, and `flush()`.
- Artifacts use generated UUIDs and opaque filenames under a resolved run directory; reject all unrecognized IDs and verify resolved paths remain below that directory.
- `AutomationRunner.run({ automation, serial, runId, signal, device, runs }): Promise<AutomationRun>` validates, captures preflight geometry before the first action, executes one path in order, persists state before and after each step, stops on first error and saves screenshot-step PNGs.
- `AutomationManager.start({ automationId, expectedRevision, serial, requestId })`, `cancel(runId)`, `get(runId)`, and `list(automationId?)`. Keep one active run per serial; same request ID returns the existing run. Startup converts persisted active runs to `interrupted` and never replays them.
- Bound shutdown stops admitting runs, aborts live controllers, waits for terminal persistence and flushes both stores.

- [ ] **Step 1: Test run-state transitions, append-only step results, atomic PNG writes, opaque artifact access, size retention and 100-run retention.** Use temporary directories.
- [ ] **Step 2: Test runner ordering and behavior with a fake `AndroidAutomationDevice`.** Cover wait abort, action failure stopping later steps, geometry preflight, screenshot artifacts and immutable revision snapshot.

```ts
it('does not execute later actions when a step fails', async () => {
  device.perform.mockRejectedValueOnce(new Error('offline'));
  const run = await runner.run({ automation, serial, runId, signal, device, runs });
  expect(run.status).toBe('failed');
  expect(device.perform).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: Test serial lock and idempotency under concurrent starts.** Assert the second different request on the same serial returns `device_busy` without invoking ADB, the same request ID returns its first `runId`, and another serial can start independently.
- [ ] **Step 4: Test cancellation during wait, cancellation after current command, disconnect, restart interruption and shutdown drain.** Assert that no later action runs and no action is retried.
- [ ] **Step 5: Implement stores, runner and manager in that order.** Persist each transition; never store raw text command strings or shell output containing user text in general logs.
- [ ] **Step 6: Run all automation unit tests and server typecheck.**

### Task 5: Local-only API, automation REST and binary image routes

**Files:**
- Create: `packages/server/src/automation/access.ts`
- Create: `packages/server/src/automation/access.test.ts`
- Create: `packages/server/src/automation/router.ts`
- Create: `packages/server/src/automation/router.test.ts`
- Modify: `packages/server/src/api/router.ts`
- Modify: `packages/server/src/start.ts`

**Interfaces:**
- `automationRequestAllowed({ remoteAddress, host, origin, configuredUiPort, apiPort }): boolean` permits IPv4/IPv6 loopback only, an exact local Host and absent Origin for local MCP/CLI callers or an Origin matching the local Frigg UI/API. It rejects forwarded-client headers as identity.
- Mount the access middleware before every route under `/api/automations`, `/api/automation-runs`, and `/api/automation-devices`; return JSON 403 on denial.
- `buildAutomationRouter({ automations, runs, manager, devices }): Router` implements catalog, CRUD, validation, screenshot PNG, run create/get/list/cancel/test-action and artifact PNG. Return run `202`, validation `400`, missing `404`, and lock/revision/active-delete `409`.
- `startFrigg` loads both automation stores, completes interrupted runs, constructs adapter/manager, mounts router and drains automation work in `stop()`.
- Add `GET /api/automation-catalog`? No: implement the path as specified, `GET /api/automations/catalog`, before the `/:id` route.

- [ ] **Step 1: Test the access predicate.** Allow `127.0.0.1`, `::1`, and IPv4-mapped loopback with matching local Host and valid/no Origin; reject external socket addresses, DNS rebinding Host, untrusted Origin and spoofed forwarding headers.
- [ ] **Step 2: Test routes against injected stores/device.** Cover CRUD, revision conflicts, schema errors, device busy, run status, cancellation, image MIME type, 404 artifact and unauthorized requests with no store/device invocation.

```ts
it('does not expose a screenshot to a non-loopback caller', async () => {
  const response = await request(router).get('/api/automation-devices/emulator-5554/screenshot').set('Host', '127.0.0.1:4848');
  expect(response.status).toBe(403);
  expect(device.screenshot).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Implement local caller guard as route-local middleware.** Keep `/setup`, `/cert.pem`, proxy, existing device discovery and unrelated API behavior unchanged.
- [ ] **Step 4: Add the automation router and inject dependencies in `startFrigg`.** Do not broadcast automation payloads through `WsHub`.
- [ ] **Step 5: Add router and lifecycle tests.** Use Express/supertest for status/body/content type and `startFrigg` dependency seams for interrupted runs/shutdown; run server suite.

### Task 6: MCP tools over the same REST contracts

**Files:**
- Create: `packages/mcp/src/automation.ts`
- Modify: `packages/mcp/src/index.ts`
- Modify: `packages/mcp/src/frigg-api.ts`
- Modify: `plugin/mcp/frigg-mcp.mjs` (generated by build script)
- Create or modify: `packages/mcp/src/automation.test.ts`

**Interfaces:**
- Register catalog, list/get/create/update/duplicate/delete, validate, run, list/get/cancel run, test action, screenshot, and artifact tools. Use Zod schemas with central node/status enums; server validation remains authoritative.
- Use an explicit MCP graph schema with `nodes[{id,type,data,position}]` and `edges[{id,source,target}]`; clients may omit positions, in which case creation applies deterministic positions.
- Add an image fetch helper that reads response bytes and returns an MCP `{ type: 'image', mimeType: 'image/png', data: base64 }` content item. Do not embed PNG base64 in the JSON API response.
- Add `requestId` to run/test tools and pass it unchanged for deduplication.

- [ ] **Step 1: Test each tool against mocked HTTP helpers.** Check method/path/body, encoded IDs, request ID, conflict propagation and image content type/data.
- [ ] **Step 2: Confirm the new tool tests fail before tool registration.**
- [ ] **Step 3: Implement tool registration and image fetch; regenerate the bundle with `npm run build:plugin`.**
- [ ] **Step 4: Run MCP typecheck/build and tool tests, then verify regenerated bundle has the same tool registrations and no source-map/source secrets.**

### Task 7: Automation REST client and bilingual screen integration

**Files:**
- Create: `packages/web/src/api/automations.ts`
- Modify: `packages/web/src/store.ts`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/i18n/index.ts`
- Create: `packages/web/src/i18n/automation.ts`
- Create: `packages/web/src/screens/AutomationScreen.tsx`

**Interfaces:**
- API helpers mirror shared contracts and expose CRUD, catalog, list devices, capture PNG as Blob, run/status/cancel, and artifact Blob operations.
- Extend `Screen` with `automation`; add navigation label/icon and screen branch; register `automation` English/Portuguese strings.
- Keep screen state local to AutomationScreen/editor except the selected screen. Poll a running execution every 700 ms, stop polling on unmount/terminal state, and recover by fetching the active run after remount.

- [ ] **Step 1: Add screen/navigation and API contract tests or browser component tests where the current harness permits.** Test that the list includes new/empty/error states, delete confirmation, unique names, selected-device validation and stale revision handling.
- [ ] **Step 2: Run the web typecheck and confirm missing imports/strings are detected.**
- [ ] **Step 3: Build automation list/editor shell, create/rename/duplicate/delete, save with revision and device/run panels.** Reuse current Frigg dark Tailwind styles and existing reusable button patterns.
- [ ] **Step 4: Run the web build and inspect both locales with `translate('pt', 'automation.title')` and `translate('en', 'automation.title')`.**

### Task 8: React Flow editor and screenshot coordinate picker

**Files:**
- Modify: `packages/web/package.json`
- Modify: `package-lock.json`
- Create: `packages/web/src/components/automation/AutomationCanvas.tsx`
- Create: `packages/web/src/components/automation/AutomationNodeCard.tsx`
- Create: `packages/web/src/components/automation/ActionLibrary.tsx`
- Create: `packages/web/src/components/automation/NodeProperties.tsx`
- Create: `packages/web/src/components/automation/DeviceScreenshotPicker.tsx`
- Create: `packages/web/src/components/automation/RunInspector.tsx`
- Modify: `packages/web/src/screens/AutomationScreen.tsx`
- Modify: `packages/web/src/i18n/automation.ts`

**Interfaces:**
- Install `@xyflow/react@12.12.0`; use custom node components for block-specific labels, inputs and status. Keep shared graph models as source of truth; adapt to React Flow node/edge types at the UI boundary.
- `DeviceScreenshotPicker` takes `{ imageUrl, screenshot, value, mode, onChange }`; render letterboxed PNG at contain scale, map pointer coordinates through the actual image rectangle into normalized screenshot coordinates, and show draggable start/end markers. Revoke prior object URLs.
- Canvas supports click-to-add from palette, connect, edit, select, delete and drag reorder/layout. The start and end nodes are seeded. Save position in each node.
- Properties change typed parameters; image picker opens from tap/long-press/swipe properties. Manual coordinate fields remain available as an accessible alternative.
- Highlight active/succeeded/failed/cancelled nodes from the run snapshot. Run inspector displays step messages and thumbnails.

- [ ] **Step 1: Test pure image-coordinate transform at image corners, with contain letterboxing, browser zoom, and start/end drag.** Test values outside image bounds are ignored.
- [ ] **Step 2: Test the dependency is absent before installation; add the pinned React Flow package and verify lockfile delta is limited to the workspace dependency.**
- [ ] **Step 3: Implement typed graph adapter, custom nodes, palette and property panels.** Prevent incompatible endpoints, second start/end nodes and multiple outgoing/incoming edges in the UI; server still validates independently.
- [ ] **Step 4: Implement picker transform and capture refresh.** On each capture, show actual serial, width, height, orientation and timestamp; invalidate selected coordinates if geometry changes.
- [ ] **Step 5: Test and build the web app.** Manually inspect canvas at 1280×840 and 960×640, and verify zoom/pan do not shift the selected device coordinate.

### Task 9: Integrated checks, launch and visible usability test

**Files:**
- Modify: `WorktreeContext.md` (ignored local context only)
- No additional production files unless integrated checks reveal a defect.

- [ ] **Step 1: Install workspace dependencies if the worktree has no `node_modules`, then run focused automation tests, the full server suite, server/MCP/web typechecks and `npm run build`.** Run `npm run build:plugin` and confirm the generated bundle matches source.
- [ ] **Step 2: Use AVD-SLIM to start an Android emulator from an installed AVD; verify `adb devices -l` shows it online.** Never use direct `emulator -avd` launch.
- [ ] **Step 3: Start Frigg and the Vite UI from the automation worktree, avoiding an already-used API port; open the local screen through the computer-use browser surface.**
- [ ] **Step 4: Visually exercise create → add blocks → connect → capture screenshot → mark tap/swipe → edit text/wait → save → execute → inspect step status and screenshot artifact → cancel a wait → edit via MCP/API → observe revision conflict in the open editor → duplicate → delete a recoverable test flow.** Use an explicit no-op test flow first, then a harmless emulator action; never issue a destructive action on a physical device.
- [ ] **Step 5: Check English and Portuguese labels, zero-device, offline-device, unsaved edits, busy serial, failed action, geometry-change and narrow-window layouts.** Fix concrete usability defects found.
- [ ] **Step 6: Run the final full suite/build after fixes, verify `git diff --check` and `git status`, update `WorktreeContext.md`, and commit the completed feature in focused commits.**

## Self-Review

- **Spec coverage:** Tasks 1–4 cover data, validation, ADB, geometry, execution, cancellation, locks, restart and retention. Task 5 covers REST and local-only access. Task 6 covers MCP parity and image content. Tasks 7–8 cover the screen, React Flow, picker, i18n, polling and run details. Task 9 covers real-device-emulator behavior, MCP/UI consistency and usable layouts. The spec's deferred features stay out of this implementation.
- **Placeholders:** No TODO/TBD handoffs remain; errors and validation behavior are named in task interfaces and tests.
- **Type consistency:** Shared node/status enums are consumed by server, web and MCP; REST `expectedRevision`, `requestId`, `runId`, image MIME and state names are consistent across tasks.
- **Review focus:** Each of the five global failure classes has explicit validation, adapter, manager or HTTP tests above.
