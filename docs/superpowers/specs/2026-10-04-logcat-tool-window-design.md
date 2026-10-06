# Logcat tool window

**Date:** 2026-10-04  
**Scope:** Move Logcat from the primary screen navigation into a persistent, docked tool window and remove the manual start requirement.

## Problem

Logcat is currently a full-screen route in the left navigation. Opening it replaces the active feature, so logs cannot stay visible alongside Traffic, Database, Mocks, or other screens. The stream starts only after pressing Start. Also, starting an Android stream runs `adb logcat -c`, which clears the device's log buffer before logs appear.

## Goal and acceptance

- Keep the selected primary screen visible when Logcat opens.
- Add a right-side area for non-full-screen tools, with Logcat available there.
- Open Logcat in a bottom panel within the central workspace; allow resizing the panel vertically.
- Toggle the panel from the right-side Logcat button or its close control. Opening Logcat must not change the primary `Screen`.
- Automatically stream for the active device once device discovery completes. If no eligible target is available, show the device-selection state.
- Keep streaming while the panel is hidden, including while the user navigates between primary screens.
- Allow device and package changes during streaming; apply each selection by switching the stream to the new target or package filter.
- Remove the Start/Stop toggle. Capture follows the active eligible device while Frigg is running; it stops when no eligible device remains or Frigg shuts down. Keep device and package selection, level and text filters, find, clear, autoscroll, and stream status.
- Preserve the Android device's existing log buffer when starting or switching streams. The Clear action continues to clear the visible Logcat list through the existing API.
- Keep all current Logcat state and behavior independent from the active primary screen.
- Show stream errors in the panel and avoid an automatic retry loop. A retry is available after a failed start.

## Assumption

The request does not specify what closing the panel should do to capture. To match the Android Studio workflow, capture remains active while the panel is hidden and follows the active device until Frigg shuts down or no eligible target is available.

## Approaches considered

1. **Global docked tool window with a right-side tool rail.** The active feature remains in the workspace while Logcat occupies a resizable bottom region. This directly follows the requested Android Studio-style workflow and supports later non-full-screen tools.
2. **Right-side overlay.** It preserves the route but covers part of the active feature and does not provide the requested bottom layout.
3. **Separate Logcat window.** It permits side-by-side viewing but breaks the in-app navigation and the requested click-to-open behavior.

The global docked tool window is selected by the product request.

## Design

### Workspace and tool rail

Keep the left navigation for primary screens. Remove Logcat from `Screen` and from the left navigation groups. Add a narrow right-side tool rail with a labeled Logcat button; the rail represents non-full-screen tools and can accept further entries later without changing primary navigation semantics.

The center workspace is a vertical flex layout. Its primary screen uses the available height. When the Logcat tool is open, a horizontal resize handle separates that screen from the bottom panel. Reuse the existing `useResizable` and `ResizeHandle` utilities, persist the panel height with the existing panel-size storage, and constrain the initial/minimum size so both regions remain usable. The right rail remains full height while the panel spans the central workspace between the left and right rails.

The right-side Logcat button toggles the panel and exposes its open state accessibly. The Logcat header also has a close control. Hiding the panel does not unmount the Logcat UI state or stop the stream. Keyboard shortcuts such as Cmd/Ctrl+F are active only while the panel is visible so the hidden tool does not intercept shortcuts used by the primary screen.

### Stream ownership and selection

Run a Logcat session controller once at the app-shell level, independent of the panel's visibility. After device discovery, use the remembered active device when it is still available; otherwise use the existing default eligible device selection (connected Android device first, then booted iOS simulator). Synchronize that active device into `logTarget` so the controller can start without opening the panel. With no eligible device, do not start a process.

The controller owns the server stream for the selected `logTarget` and `logPackage` pair. A target or package change switches the stream to the new pair; clearing the target stops the stream. Device and package selectors remain enabled while streaming. Serialize stream changes and ignore stale completions so a slow earlier start cannot replace a newer selection. Deduplicate start attempts by target and package so a failed start does not cause a render-driven retry loop; show the failure and allow an explicit retry action. A device update or explicit retry can reattempt the same target after a disconnect or failed start.

Selecting a Logcat target continues to update the shared active-device selection, matching the current device-picker behavior used by other tools. The panel may be hidden while the stream runs; navigation between primary screens does not affect session ownership.

### Android log buffer and clear behavior

Remove `adb logcat -c` from stream startup. `adb logcat` should emit the current device buffer followed by new lines, like the Android Studio Logcat view. Starting automatically at app launch, changing device, or applying a package filter must not erase device-side history. The existing Clear action remains a view-level clear via `/api/logs`; it does not clear the device buffer.

### Panel contents and empty/error states

Reuse the current device picker, package picker, severity filter, text filter, list, find bar, autoscroll, line count, and clear action. Remove Start/Stop labels and controls. The panel header adds close and a retry action when a stream error is present. Keep the empty state for no selected device, update the idle copy so it does not instruct users to press Start, and render stream errors in the status area.

### Data flow

1. The app shell loads the device snapshot and resolves the remembered/default active device.
2. The Logcat controller observes the resulting target and starts `/api/logs/start` once for that target and package filter.
3. WebSocket log events continue updating the shared buffer while the panel is hidden or another primary screen is active.
4. Target/package selection changes trigger a new session; selecting no target calls `/api/logs/stop`.
5. Opening or closing the panel only changes workspace layout and visibility.

No new MCP capability or public API route is required. Existing `/api/logs/start`, `/api/logs/stop`, `/api/logs`, device discovery, and WebSocket events remain the integration points.

## Error handling and compatibility

- A failed session start is shown in the Logcat panel and is not retried in a tight loop. Retrying is explicit; changing to another target/package also attempts the new stream.
- A device disconnect stops or invalidates its stream and clears the stale target. A device update can select another available default target and start that session; reconnecting the selected device can retry its stream.
- Physical iOS devices remain unsupported for log streaming; do not automatically choose them as Logcat targets.
- Existing buffered frontend entries remain available when the user navigates or hides the panel, subject to the current 5,000-entry cap.
- No backend event schema changes are needed.

## Verification

- Build the server and web packages and package the macOS desktop app.
- Open Logcat from the right rail while Traffic is selected; confirm Traffic remains visible above the docked panel.
- Repeat while Database and Mocks are selected; confirm the same panel is available without route changes.
- Confirm a discovered active device starts streaming without pressing Start and that logs continue arriving while the panel is hidden.
- Resize the panel, close/reopen it, and confirm the chosen height and Logcat filters/list state persist for the app session.
- Switch device and package filters while streaming; confirm the active stream follows the selection.
- Confirm starting or retargeting Android Logcat does not clear device-side log history, and Clear empties only the visible list.
- Confirm no-device, unsupported-target, and stream-error states remain understandable and do not trigger repeated start requests.

## Out of scope

- Adding additional non-full-screen tools to the right rail.
- Changing Android or iOS log parsing, filters, or device discovery contracts.
- Creating a new backend or MCP capability for Logcat.
