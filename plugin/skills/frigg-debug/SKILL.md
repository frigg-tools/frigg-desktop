---
name: frigg-debug
description: Use when debugging a mobile app's network behaviour with Frigg — inspecting intercepted HTTP(S) traffic, reproducing a failing request, or mocking a backend response to test the client. Triggers on "debug with Frigg", "why is this request failing", "mock this endpoint", "intercept the app's traffic".
---

# Debugging mobile HTTP with Frigg

Frigg intercepts a device/emulator's HTTP(S) traffic through its proxy and lets you inspect exchanges and mock responses. Drive it through the connected `frigg_*` MCP tools. Verify availability with `frigg_status`; use the API port reported by that tool if a direct HTTP call is needed.

## Workflow

1. **Confirm the setup.** Call `frigg_status` and `frigg_list_devices`. The device must show `proxyConfigured` and trust the Frigg CA, or no HTTPS is captured. If not set up, tell the user to run *Set up interception* on the Devices screen.

2. **Reproduce + capture.** Ask the user to trigger the broken flow in the app. Call `frigg_list_traffic` and find the relevant exchange(s) by host/path. It returns summaries only; call `frigg_get_traffic_detail` for each selected ID before inspecting headers or bodies. Preserve pending/aborted state and disclose truncated or binary bodies.

3. **Diagnose.** Compare what the app sent vs. what it should send, and what the server returned. Typical findings: wrong base URL / missing `{{token}}`, a 4xx from bad params, a 5xx upstream, an unexpected payload shape, or TLS not trusted (request never appears → CA not installed).

4. **Mock to isolate.** Create a mock only when the user asks to mock or explicitly agrees to that diagnostic action. Use `frigg_create_mock_rule` with a specific method and host/path matcher. Have the user re-run the flow and verify the matching exchange is marked mocked.

5. **Reproduce in the API client (optional).** Use `frigg_client_snapshot` to locate a saved request. Run it or change environment variables only when the user asks; use `frigg_run_request` or `frigg_set_env_var` with values supplied by the user.

6. **Clean up.** Remove a mock with `frigg_delete_mock_rule` only when the user asks or agrees to the cleanup. Never clear captured traffic as part of diagnosis.

## Notes
- Mocks match by priority; a higher-priority rule wins. Keep matchers specific.
- If a request never appears in traffic, check proxy routing and CA trust before drawing conclusions about the backend.
- Frigg never modifies traffic unless a mock matches or a breakpoint is set.
