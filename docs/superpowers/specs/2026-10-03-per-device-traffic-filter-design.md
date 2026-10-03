# Per-device traffic filtering

**Date:** 2026-10-03  
**Scope:** Devices exposed by Frigg: Android ADB devices, booted iOS simulators, and paired physical iOS devices.

## Problem

The Traffic source selector is built from `CapturedRequest.clientAddress` values already present
in the traffic buffer. It filters network addresses, not connected devices. Android emulators
reach the host through `10.0.2.2`, and the proxy can observe them as localhost. The two connected
emulators inspected for this report both use `10.0.2.2:8888`; their distinct guest IPs do not reach
the UI because the captured request stores only the proxy socket's client address. A source-IP
filter cannot tell those requests apart.

## Goal and acceptance

- Traffic offers a selectable option for every connected Android ADB device, booted iOS simulator,
  and paired physical iOS device returned by the Devices API.
- Selecting a device shows requests captured through that device's assigned proxy endpoint only.
- Android setup continues to configure the device automatically, using its assigned endpoint.
- iOS devices and simulators show a per-device endpoint and concise manual proxy setup steps.
- The shared proxy remains available for the host and manually configured clients. Requests entering
  through it stay unassigned and remain filterable by source address.
- Existing buffered exchanges without device identity remain available as unassigned traffic. They
  cannot be attributed retroactively.
- Selecting All devices restores the current combined view.

## Approaches considered

1. **List observed IP addresses.** Smallest change and useful for physical devices with distinct
   addresses, but it leaves the reported localhost case unresolved.
2. **Treat localhost as the currently active device.** Small, but concurrent local clients and
   multiple emulators would be misattributed.
3. **Give each device a dedicated proxy listener and tag captured requests with the device ID.**
   This adds listener lifecycle and per-device configuration, but gives the filter reliable
   identity even when the socket address is localhost. This is the selected approach.

## Design

### Proxy ownership and request identity

Add a `DeviceProxyManager` that owns one `ProxyEngine` listener per discovered device target. It
allocates a stable, persisted port for each namespaced device ID (`android:<serial>`,
`ios-simulator:<udid>`, or `ios-device:<udid>`), starts and restores the listeners, and reconciles
them with the device watcher. The existing shared listener remains the default for host and manual
traffic.

Each device listener passes its device ID to `ProxyEngine`. The engine writes that optional ID to
`CapturedRequest` as `clientDeviceId`; `TrafficStore` and WebSocket events preserve it with the
exchange. The shared listener leaves the field absent. All listeners share the existing mock,
breakpoint, certificate, and traffic services. Stopping one device listener must not release
breakpoints paused by another listener.

The device proxy manager exposes each device's proxy host, port, and readiness through the Devices
API. Port assignments remain stable across Frigg restarts. A port collision is surfaced as that
device's proxy error; the manager must not silently fall back to an untagged shared listener.

### Device setup and lifecycle

- Android setup starts or reuses that device's listener before setting `http_proxy` to the assigned
  port. Physical devices use the Frigg LAN address; emulators use `10.0.2.2` with their individual
  ports.
- Preserve the current proxy lease behavior. If Frigg already owns an Android proxy setting, update
  its lease when moving it from the shared port to the per-device port. Leave manually configured
  or third-party proxy settings alone unless the user runs Android setup.
- On startup, restore listeners for devices whose current proxy settings use a registered Frigg
  device port. Reconcile listener creation/removal on device updates and stop all listeners during
  shutdown.
- iOS proxy settings are currently manual. Show each simulator/device its dedicated host and port,
  with copy controls and steps to enter that address in its network proxy settings. Do not change
  iOS settings automatically. The shared manual setup instructions remain for generic clients.
- Reload operations that affect the shared proxy configuration must reload all device listeners as
  well.

### Traffic selector

Build device options from the Devices snapshot, not from observed traffic. Use the same display
names and identifiers shown by the device pickers. Keep observed IP addresses as unassigned source
options so host and legacy traffic can still be inspected.

Represent the selected filter as All, a device ID, or an unassigned source address. A device filter
matches `request.clientDeviceId`; an unassigned source filter matches normalized
`request.clientAddress`. Keep the existing initial active-device behavior where a selected Android
device is available, while allowing the user to choose any listed device. If the selected device
has no captured requests yet, show the existing waiting-for-device message with its name.

Requests captured before per-device setup retain only their old source address. Display them under
unassigned traffic rather than guessing which device sent them.

## Error handling and compatibility

- New request and device fields are optional so stored events and older API payloads remain valid.
- If a device is present but its listener cannot start, keep it in the selector with a clear
  unavailable status and do not attribute traffic from another listener to it.
- If a device disconnects, stop its active listener during reconciliation but retain its port
  assignment so the endpoint remains stable on reconnect.
- Android proxy cleanup must continue restoring only settings owned by Frigg. iOS proxy settings
  remain user-managed and need the existing manual reset guidance.
- The shared listener continues capturing host traffic and unknown/manual device traffic with its
  source address.

## Verification

- Inspect that two emulators have distinct assigned ports and requests carry their respective
  namespaced device IDs.
- Confirm a request sent through the shared listener stays unassigned and remains visible under its
  source address.
- Confirm physical Android setup points to its dedicated listener and shutdown restores the prior
  Android proxy lease.
- Confirm iOS simulator and physical-device cards show distinct copyable proxy addresses and
  requests are attributed after manual configuration.
- Confirm a port collision reports a device-level unavailable state and never labels the request as
  belonging to a different device.
- Review the web filter for All, each device, and unassigned traffic, including a device with no
  requests yet.

## Out of scope

- Automatically editing iOS network proxy settings.
- Recovering device identity for already buffered requests that contain only a shared localhost
  address.
- Filtering by app/package inside a device; that remains a separate request-content filter.
- Adding an MCP capability. This change does not alter MCP tools or contracts.
