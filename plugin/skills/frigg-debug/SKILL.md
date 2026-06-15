---
name: frigg-debug
description: Use when debugging a mobile app's network behaviour with Frigg — inspecting intercepted HTTP(S) traffic, reproducing a failing request, or mocking a backend response to test the client. Triggers on "debug with Frigg", "why is this request failing", "mock this endpoint", "intercept the app's traffic".
---

# Debugging mobile HTTP with Frigg

Frigg intercepts a device/emulator's HTTP(S) traffic through its proxy and lets you mock responses. Drive it through the `frigg_*` MCP tools (the Frigg server must be running on `http://localhost:4848` — verify with `frigg_status`).

## Workflow

1. **Confirm the setup.** Call `frigg_status` and `frigg_list_devices`. The device must show `proxyConfigured` and trust the Frigg CA, or no HTTPS is captured. If not set up, tell the user to run *Set up interception* on the Devices screen.

2. **Reproduce + capture.** Ask the user to trigger the broken flow in the app. Call `frigg_list_traffic` and find the relevant exchange(s) by host/path. Inspect status, request headers/body and response headers/body.

3. **Diagnose.** Compare what the app sent vs. what it should send, and what the server returned. Typical findings: wrong base URL / missing `{{token}}`, a 4xx from bad params, a 5xx upstream, an unexpected payload shape, or TLS not trusted (request never appears → CA not installed).

4. **Mock to isolate.** To prove a hypothesis without touching the backend, create a mock with `frigg_create_mock_rule` (matcher on method + host/path globs; response with the status/body you want, optional delay). Have the user re-run the flow — the matched request now returns your mock (⚡ MOCK in the traffic list) and never hits upstream. This separates client bugs from server bugs.

5. **Reproduce in the API client (optional).** Use `frigg_client_snapshot` + `frigg_run_request` to replay a request outside the app with full control over variables, or `frigg_set_env_var` to fix a stale token.

6. **Clean up.** Delete throwaway mocks with `frigg_delete_mock_rule` so they don't affect later runs.

## Notes
- Mocks match by priority; a higher-priority rule wins. Keep matchers specific.
- If a request never appears in traffic, it's a trust/proxy problem, not a backend problem — check the CA and the device proxy first.
- Frigg never modifies traffic unless a mock matches or a breakpoint is set.
