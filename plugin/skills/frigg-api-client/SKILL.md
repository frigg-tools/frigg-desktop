---
name: frigg-api-client
description: Use when a user wants to create, organize, update, or run an API Client workspace, collection, environment, request, or variable in Frigg.
---

# Work with Frigg API Client

Use the connected Frigg MCP tools to make the smallest requested change.

1. Call `frigg_status`, then `frigg_client_snapshot`. Use the snapshot to find existing workspaces, folders, requests, and environments; never repeat its variable values or credentials in the response.
2. Reuse the uniquely matching workspace. If none exists, create it only when the user asked for one. If multiple workspaces match, ask which one to use. Check for same-name folders, environments, and requests before creating them; ask before replacing an existing item.
3. Create only the requested items, using their returned IDs: `frigg_create_workspace`, `frigg_create_collection`, `frigg_create_environment`, `frigg_create_request`, or `frigg_update_request`. Use `frigg_set_env_var` only for values the user supplied or explicitly asked you to set. Do not invent credentials, add scripts, or change unrelated requests.
4. Before executing, review the method, URL, query parameters, headers, body, selected environment, and variables. Run `frigg_run_request` only when the user explicitly asked to execute the request; use its saved `requestId` when available.
5. Report the effective URL, status and status text, duration, response size, truncation state, errors, and script test results. Show response content only when relevant; redact authorization, cookie, API-key, and token values in headers, variables, and bodies.

Do not assume a Frigg port or filesystem path. If `frigg_status` fails, ask the user to start Frigg before making changes.
