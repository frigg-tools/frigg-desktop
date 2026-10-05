# Physical iOS Logcat support

**Date:** 2026-10-04  
**Scope:** Extend the existing docked, automatically streaming Logcat to paired physical iPhones and iPads, and include its streaming helper in macOS installers.

## Problem

The devices API already reports physical iOS devices, but Logcat currently offers only Android devices and booted iOS simulators. The server explicitly rejects physical iOS targets. The existing app filter also queries simulator apps through `simctl`, so it cannot provide physical-device processes.

## Goal and acceptance

- A paired physical iPhone or iPad appears in the Logcat device selector and can be selected as the active target.
- The existing Logcat session controller automatically starts and follows a selected physical target, including while the docked panel is hidden.
- Physical device logs stream live, stop cleanly when the target changes or the app shuts down, and use the existing Logcat list, level filter, text filter, find, clear, and scroll behavior.
- The iOS process selector for a physical device lists currently running processes and filters the stream by the selected process name.
- macOS arm64 and x64 DMGs include `idevicesyslog` and all non-system dynamic libraries it needs. Running the installed app does not require Homebrew or a separate tool installation.
- iOS Simulator and Android behavior remains unchanged. Windows and Linux installers do not claim physical iOS log support.
- Pairing, device disconnection, process startup, and missing helper failures appear as Logcat status errors rather than crashing the server.

## Assumptions

- Physical iOS support is available on macOS, where the existing iOS device discovery uses Xcode's `xcrun devicectl`.
- The active-device behavior from the docked Logcat design remains: a remembered eligible target is retained; otherwise defaults are connected Android, booted iOS Simulator, then a paired physical iOS device.
- Physical process filtering uses process names from `idevicesyslog pidlist`. These are runtime processes, not the installed-app list; an app must be running to appear in that selector.
- The user selected an installer that contains the helper. A runtime download or dependence on Homebrew installed on the destination machine is not acceptable.

## Approaches considered

1. **Bundle the Homebrew-built helper and its dynamic libraries per macOS architecture.** Stage `idevicesyslog` plus its transitive non-system `.dylib` dependencies into app resources, rewrite library install names to load relative to the bundle, and include the upstream license and source/version information. The app launches this private copy. This uses the upstream/Homebrew maintained build while remaining self-contained at runtime. **Selected.**
2. **Statically compile the helper and its dependency chain per architecture.** This yields fewer runtime files but adds a custom native build pipeline and static-linking obligations for the LGPL components.
3. **Require a host-installed `idevicesyslog`.** This is the least packaging work but contradicts the request to include the helper in the installer.

## Design

### Device selection and session ownership

Use the existing `DevicesSnapshot.iosDevices` entries from `xcrun devicectl`. Add physical devices to the Logcat selector in a separate “iOS Devices” group. Paired devices are selectable; unpaired devices remain visible but disabled with a localized pairing hint. Selecting a device updates the active-device and Logcat targets through the existing store action.

Extend `isLogTargetAvailable` and target reconciliation so a physical iOS target is eligible only while the same UDID remains in `iosDevices` and is paired. Keep the current target defaults in order—connected Android, booted iOS Simulator—and use the first paired physical iOS device only as the last fallback. This lets existing active-device selection take precedence without unexpectedly diverting a session to a physical phone.

Keep the existing `LogTarget` and `/api/logs/start` contract. Distinguish a simulator from a physical device using the existing simulator UDID format check in the server, matching the current Logcat manager behavior. No new public route or WebSocket event is needed.

### Physical log source and parsing

Create a small iOS log-tool boundary that resolves the executable path and builds physical-device commands. In source/development mode it may fall back to `idevicesyslog` on `PATH`; in a packaged macOS app it must use the bundled executable under `process.resourcesPath` for the running architecture.

For streaming, launch the helper with the selected UDID, `--no-colors`, and exit-on-disconnect. When a process filter is selected, pass its exact process name using the helper's process filter option. Continue to use the current stream lifecycle, buffering, status handling, and event emission in `LogcatManager`.

For the physical-device process selector, run the helper's `pidlist` command for that UDID, parse PID/name rows, discard PIDs, deduplicate process names, and return the current `DeviceApp` response shape with each process name as its ID and label. The UI uses a dedicated localized “Processes” group for physical devices instead of categorizing these runtime processes as user or system apps. The simulator and Android app selectors remain unchanged.

Extend the iOS parser for `idevicesyslog` output: map its timestamp, process name, PID, severity, and message into existing `LogEntry` fields. Map notice/info to `I`, debug to `D`, warning to `W`, error to `E`, and fault to `F`; keep unknown lines visible through the existing raw-line fallback. Ignore helper connection/disconnection markers as log entries.

### Installer contents

Add a deterministic staging step for `idevicesyslog` and its runtime libraries. The step runs only for macOS packaging, stages the matching architecture, verifies the executable and its resolved non-system dependencies, rewrites install names to bundle-relative paths, and includes the license/notice for each bundled component plus source and version references. The app resolves the matching resource path at runtime and never shells out to Homebrew.

Build the arm64 and x64 DMGs on matching native macOS runners so Homebrew supplies the correct architecture. Update the release matrix to supported macOS runner labels rather than cross-packaging a native helper from a single architecture. Do not add the helper to Windows or Linux resources.

### Errors and compatibility

- Show a localized actionable error when a physical device is not paired, is disconnected, or the bundled executable cannot start. Detect the helper's passcode-protected prompt, stop that attempt, and ask the user to unlock the device and retry instead of leaving an empty stream marked active.
- Preserve the most useful helper stderr line in the existing session error status.
- Exit-on-disconnect releases the helper process promptly. Selecting another target follows the existing serialized session coordinator and terminates the previous stream.
- The helper is bundled for installed macOS builds; development can use the installed `idevicesyslog` binary from `PATH`.
- Keep Android, simulator, traffic capture, proxy setup, and MCP contracts unchanged.

### Documentation

Update the Logcat section in `DESIGN.md`, the device support note in `CLAUDE.md`, and the README feature description to say physical iOS logs are available in the macOS app with no separate runtime install. Document that the physical app selector contains processes currently running on the device.

## Verification

- Run the server and web production builds and package both macOS DMG architectures.
- Inspect the staged helper with `--version`; use `otool -L` to confirm no non-system dynamic library path points to Homebrew or another build-machine directory.
- Verify the app selects the bundled helper path, while development mode can resolve the helper from `PATH`.
- With a paired iPhone or iPad, select the device and confirm live logs, process filtering, target switching, disconnect handling, and automatic capture while the docked panel is hidden.
- Confirm simulator and Android streams still use their current tools and parser behavior.

## Out of scope

- Bundling iOS device tooling into Windows or Linux installers.
- Installing or pairing an iPhone from within Frigg.
- Filtering physical logs by installed bundle ID when no corresponding process is running.
- Changing the existing Logcat panel layout, Android log retention, traffic filters, or MCP capabilities.
