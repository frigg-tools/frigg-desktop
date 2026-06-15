---
description: Run an API-client request by name and show the response
argument-hint: "<request name>"
---

Run a saved Frigg API-client request: `$ARGUMENTS`.

1. Call `frigg_client_snapshot` to load workspaces, folders, requests and environments.
2. Find the request whose name best matches `$ARGUMENTS`. If several match, list them and ask which one. If none match, show the closest names.
3. Call `frigg_run_request` with that request id (the active environment's variables are applied automatically).
4. Report the result: status, duration, and the response body (pretty-print JSON). Surface any test-script results (pass/fail) and any environment variables the scripts set (e.g. `{{token}}`).

If the request depends on auth, remind the user they can run their login request first so its test script populates the token variables.
