# Physical iOS Logcat Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add paired physical iPhones and iPads to Logcat, stream their live logs with optional process-name filtering, and include the required helper in macOS DMGs.

**Architecture:** Keep the existing `LogTarget`, HTTP routes, WebSocket events, and session coordinator. Add a server-side iOS log-tool service used by both Logcat streaming and process enumeration. Inject the executable path from the desktop app: packaged macOS builds use a private resource bundle, while source/development mode resolves `idevicesyslog` from `PATH`. Extend the existing device and process pickers to recognize physical iOS devices. Stage the helper and its transitive non-system dylibs before macOS packaging, then build each release architecture on its matching native macOS runner.

**Tech Stack:** TypeScript, React, Node.js child processes, Electron Builder, Homebrew `libimobiledevice`, macOS `otool` and `install_name_tool`, GitHub Actions.

**Spec:** [2026-10-04-physical-ios-logcat-design.md](../specs/2026-10-04-physical-ios-logcat-design.md)

## Global Constraints

- Preserve existing Android and iOS Simulator behavior and the current Logcat routes/events.
- Physical iOS support applies to macOS; Windows/Linux resources remain unchanged.
- A packaged app must never invoke Homebrew or use build-machine paths at runtime.
- Preserve all unrelated pre-existing work in the shared worktree; stage only files belonging to this feature.
- Do not add or run automated tests. Verification for this task is limited to production builds, packaging inspection, and manual device checks when a paired device is available.

## Review Focus

- Confirm only paired physical iOS devices are selectable and target reconciliation stops streaming when one disconnects or becomes unavailable.
- Confirm the process picker shows live process names for a physical device and keeps Android/simulator package groups unchanged.
- Confirm passcode-protected, unpaired, disconnected, and missing-helper cases produce actionable Logcat status instead of an active empty stream.
- Confirm both DMG architectures contain a runnable helper and all non-system dylibs, with no Homebrew or build-machine references in install names.
- Confirm bundled component notices identify each dependency, version, source, and license.

---

## Task 1: Bundle a self-contained iOS log helper in macOS DMGs

**Files:**
- Create `packages/desktop/scripts/stage-ios-tools.cjs`.
- Modify `packages/desktop/scripts/before-pack.cjs`.
- Modify `packages/desktop/package.json`.
- Modify `packages/desktop/src/main.ts`.
- Modify `.github/workflows/release.yml`.
- Modify `.gitignore`.

- [x] Add a staging script that accepts the native build architecture, locates `idevicesyslog` and its Homebrew formula dependency metadata, and writes a clean `packages/desktop/build/ios-tools/` resource tree.
- [x] Recursively inspect helper dependencies with `otool -L`; copy each non-system dylib into the staged `lib/` directory, rewrite dylib IDs and references to `@loader_path`-relative paths with `install_name_tool`, and fail if a dependency is unresolved or still references Homebrew/build-machine paths.
- [x] Stage the helper executable with executable permissions, record its version and architecture, and generate bundled third-party notices containing each shipped formula's version, source, and license text. Fail packaging if a shipped component has no license notice.
- [x] Extend the existing `beforePack` hook to stage resources only for macOS packaging, using the native runner architecture. Keep the existing web build and Electron rebuild steps intact.
- [x] Add `build/ios-tools` to Electron Builder's macOS `extraResources`, targeting `ios-tools`; keep Windows and Linux resource lists free of this helper.
- [x] Ignore the generated `packages/desktop/build/ios-tools/` staging directory so local packaging does not leave binary artifacts in the source diff.
- [x] In packaged `main.ts`, pass `path.join(process.resourcesPath, 'ios-tools', 'bin', 'idevicesyslog')` to `startFrigg`; leave the option unset in development so the server can resolve the command from `PATH`.
- [x] Update the release workflow to install the Homebrew formula and map arm64/x64 matrix entries to matching native macOS runner labels. Keep artifact names and release upload behavior unchanged.
- [x] Build a local macOS DMG on the available host architecture and inspect the staged resource tree, helper `--version`, and `otool -L` output.

## Task 2: Add a server boundary for physical iOS process listing and log streaming

**Files:**
- Create `packages/server/src/logcat/ios-device-log-tool.ts`.
- Modify `packages/server/src/logcat/manager.ts`.
- Modify `packages/server/src/logcat/parse-ios.ts`.
- Modify `packages/server/src/start.ts`.
- Modify `packages/server/src/api/router.ts`.
- Modify `packages/server/src/devices/apps.ts`.
- Modify `packages/web/src/components/logcat/LogcatStatusBar.tsx`.
- Modify `packages/web/src/i18n/logcat.ts`.

- [x] Add `IosDeviceLogTool`, constructed with an executable path, with methods to list process rows and produce/execute physical-device stream commands. The stream command must pass UDID, `--no-colors`, exit-on-disconnect, and the selected process name when present.
- [x] Add optional `iosLogToolPath` to `StartFriggOptions`; default it to `idevicesyslog` for server/source usage. Construct one tool service in `startFrigg` and inject that same instance into `ApiDeps` and `LogcatManager`.
- [x] Route iOS app enumeration by the existing simulator-UDID check: simulator targets continue using `simctl listapps`; physical targets use `pidlist`, discard PIDs, deduplicate process names, and return the current `DeviceApp` shape.
- [x] Replace the physical-iOS rejection in `LogcatManager` with a plan from `IosDeviceLogTool`, while preserving the existing stream lifecycle, buffering, status events, stop behavior, and Android/simulator plans.
- [x] Extend the iOS parser for `idevicesyslog` timestamp/process/PID/severity/message rows. Map notice/info to `I`, debug to `D`, warning to `W`, error to `E`, and fault to `F`; ignore helper connection markers and preserve unknown lines with the current raw-line fallback.
- [x] Detect pairing/disconnection, passcode-protected-device output, and missing-helper failures from process errors/stderr. Stop passcode-blocked attempts and publish actionable localized status through the existing session error field.
- [x] Translate stable physical-device error codes in the existing status bar while preserving useful generic helper diagnostics.
- [x] Run the server production build and inspect command construction and parser behavior by review; do not add or run automated tests.

## Task 3: Expose physical devices and running processes in the Logcat UI

**Files:**
- Modify `packages/web/src/components/logcat/LogcatDevicePicker.tsx`.
- Modify `packages/web/src/components/logcat/LogcatPackagePicker.tsx`.
- Modify `packages/web/src/components/logcat/LogcatToolbar.tsx` if target-specific process loading needs an explicit prop or state.
- Modify `packages/web/src/store.ts`.
- Modify `packages/web/src/components/logcat/session.ts`.
- Modify `packages/web/src/i18n/logcat.ts`.
- Modify relevant device translations in `packages/web/src/i18n/devices.ts` if shared device labels are needed.

- [x] Add an “iOS Devices” optgroup populated from `devices.iosDevices`. Display each physical device's name/model and UDID; enable only paired devices and show a localized pairing hint for unpaired devices.
- [x] Extend target availability and reconciliation so a physical target remains eligible only while the same UDID exists and is paired. Preserve active-target preference and the existing default order, using the first paired physical iOS device after Android and booted simulators.
- [x] Load process names through the existing apps endpoint for a physical target. In `LogcatPackagePicker`, display them under a dedicated localized “Processes” group; keep Android user/system apps and simulator apps in their existing groups.
- [x] Ensure changing or losing a physical target clears stale process choices and follows the current serialized automatic session lifecycle, including when the docked panel is hidden.
- [x] Run the web production build and inspect the target and process selector behavior in the existing UI.

## Task 4: Document support and verify release packaging

**Files:**
- Modify the Logcat section in `DESIGN.md`.
- Modify the device-support note in `CLAUDE.md`.
- Modify the relevant Logcat feature description in `README.md`.

- [x] Document that physical iOS logs are available in the macOS app without a separate runtime install, and that the physical-device selector lists processes currently running on the device.
- [x] Build the server and web production workspaces and package the available native macOS DMG. Configure release CI to produce arm64 and x64 DMGs on matching native runners; x64 packaging is delegated to those runners.
- [x] Inspect the local ARM64 DMG to confirm the helper and all required dylibs are present, their architectures match the app, install names are bundle-relative or system paths, and the bundled notices cover all included components.
- [ ] With a paired iPhone or iPad, manually confirm device selection, live logs, process filtering, target switching, disconnect handling, unlock/retry handling, and continued capture while the panel is hidden.
- [x] Confirm Android and simulator Logcat still follow their existing paths and filters by code-path inspection.
