# MCP and AI Skills Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Frigg MCP screen install the Frigg MCP server and its portable skills globally in Codex, Claude Code, and Cursor, including usable API Client and detailed traffic workflows.

**Architecture:** Keep the versioned skill source beside the existing Claude plugin, package it into both the Electron app and plugin, and install only those skills to each client’s documented user directory. Add a typed server-side integration service with per-client MCP adapters, atomic skill/config updates, an installation registry, and loopback-only HTTP routes. Extend the MCP server with an ID-based bounded traffic detail tool; the existing list tool remains the lightweight discovery step.

**Tech Stack:** TypeScript, Express, React, Electron, MCP SDK, Zod, Node.js filesystem and child-process APIs, existing `@frigg/shared` contracts and `lib/exec.ts`.

**Spec:** `docs/superpowers/specs/2026-09-28-ai-skills-install-design.md`

## Global Constraints

- Install globally for Codex, Claude Code, and Cursor only; project-scoped installation is out of scope.
- Keep the MCP server local over stdio; do not open a new network port.
- Write only to the current user’s client configuration and skills directories.
- Preserve unrelated MCP servers and do not overwrite an unmanaged same-name entry or skill without an explicit replace action.
- Repeated installation is idempotent; update only Frigg-managed files and entries.
- Do not install or update the AI clients, publish marketplace plugins, install arbitrary downloaded skills, or remove user settings during uninstall.
- Traffic detail retrieval is read-only. It does not clear traffic, run API requests, or create mocks.
- Protect setup routes with loopback address plus expected Host/Origin checks; forwarded headers do not establish caller identity.
- The Frigg MCP URL must use the active API port and the entrypoint included with the installed app, never a development checkout path.
- Domain identifiers and installation states belong in central `@frigg/shared` constants and types.
- Default detailed traffic body limit is 65,536 bytes per body; the user-selectable maximum is 262,144 bytes per body.

## Review Focus

- Malformed or unreadable Cursor JSON, symlinked dotfile configs, and existing file permissions: preserve the original file/link and return a recoverable status.
- An unmanaged or externally edited `frigg` MCP entry or skill directory: report a conflict and require the explicit replace action.
- Codex, Claude Code, and Cursor discovering overlapping global skill roots: report the actual visible installation and do not make redundant Frigg copies.
- Requests to setup routes from a LAN device, with forged forwarding headers, or with an unapproved Host/Origin: reject before reading or writing client settings.
- Pending, aborted, missing, binary, originally truncated, and oversized traffic bodies: preserve state/encoding and bound each returned body without losing the original size or truncation signal.

## Implementation Map

| File | Responsibility |
| --- | --- |
| `packages/shared/src/agent-integrations.ts` | Central client/resource/state constants and frontend/server DTOs |
| `packages/server/src/agent-integrations/clients.ts` | Fixed client configuration adapters and install commands |
| `packages/server/src/agent-integrations/skills.ts` | Detect, install, and atomically update the bundled Frigg skills |
| `packages/server/src/agent-integrations/registry.ts` | Read and atomically persist `~/.frigg/agent-integrations.json` |
| `packages/server/src/agent-integrations/service.ts` | Combine status, conflict handling, MCP installation, and skill installation |
| `packages/server/src/agent-integrations/router.ts` | Loopback-only HTTP API for the MCP screen |
| `packages/server/src/lib/local-ui-access.ts` | Shared local UI request validation used by setup and automation routes |
| `packages/mcp/src/traffic.ts` | MCP traffic listing and bounded detail tools |
| `packages/web/src/components/mcp/AgentIntegrationCard.tsx` | Per-client setup UI and action states |
| `plugin/skills/` | Canonical Frigg skill sources already included by the Claude plugin |

No new automated test files or test commands are part of this plan. Each task ends with a code/configuration acceptance checkpoint; broader test work requires a separate user request.

---

### Task 1: Define the portable Frigg skill set

**Files:**

- Create: `plugin/skills/frigg-api-client/SKILL.md`
- Create: `plugin/skills/frigg-traffic-inspector/SKILL.md`
- Modify: `plugin/skills/frigg-debug/SKILL.md`
- Modify: `plugin/skills/frigg-android-setup/SKILL.md`
- Modify: `plugin/.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`

**Interfaces:**

- Consumes: existing MCP tools `frigg_status`, `frigg_client_snapshot`, `frigg_create_workspace`, `frigg_create_collection`, `frigg_create_request`, `frigg_update_request`, `frigg_create_environment`, `frigg_set_env_var`, `frigg_run_request`, `frigg_list_traffic`, and the `frigg_get_traffic_detail` tool produced by Task 2.
- Produces: four Agent Skills format directories under `plugin/skills/`, with stable names, useful trigger descriptions, and instructions that use the connected Frigg MCP server rather than fixed filesystem paths or port `4848`.

- [x] **Step 1: Add the API Client skill.** Create `plugin/skills/frigg-api-client/SKILL.md` with the required `name` and `description` frontmatter. The workflow must inspect the snapshot, reuse an existing workspace by name, create only the requested folder/environment/request, configure only user-provided values, review request fields before execution, and execute only when requested. Document the output fields to report from `frigg_run_request`.

```markdown
---
name: frigg-api-client
description: Create or update API Client workspaces, collections, environments, requests, and variables in Frigg. Use when the user asks to organize or run an API request with Frigg.
---

## Workflow

1. Call `frigg_status` and `frigg_client_snapshot` before changing the API Client.
2. Reuse a workspace with the requested name; create one only when none exists.
3. Create only the requested collections, environment, request, and variables.
4. Review method, URL, query, headers, body, and variable names before running.
5. Run a request only when the user asked to run it. Report status, effective URL, duration, error, and script test results.
6. Never invent credentials. Do not save a token as a variable unless the user explicitly asks.
```

- [x] **Step 2: Add the traffic inspection skill.** Create `plugin/skills/frigg-traffic-inspector/SKILL.md`. Its sequence is summary discovery, user-request-relevant ID selection, detail retrieval by ID, response/request separation, truncation/encoding disclosure, and redaction of authorization/cookie/token-like values from presented output. The skill must not call `frigg_clear_traffic` or write mocks during read-only analysis.

- [x] **Step 3: Align the existing debugging skill.** Edit `plugin/skills/frigg-debug/SKILL.md` to use `frigg_list_traffic` for discovery followed by `frigg_get_traffic_detail` for only the selected exchanges. Retain its mock/replay workflows for requests where the user asks for those actions.

- [x] **Step 4: Keep Android setup instructions portable.** In `plugin/skills/frigg-android-setup/SKILL.md`, replace Claude-only UI tool names such as `AskUserQuestion` with portable instructions to ask the user which variants to configure. Preserve the existing safety boundaries for device and certificate changes.

- [x] **Step 5: Update plugin descriptions.** Change the Claude plugin and marketplace descriptions to say that Frigg provides reusable skills for API Client and traffic workflows; retain existing Android setup and debugging capabilities. Do not copy skill contents into the manifests.

- [x] **Acceptance checkpoint:** Read all four `SKILL.md` files as a user-facing set. Verify each frontmatter name matches its directory, descriptions name when to activate, no skill claims tools absent from the MCP server, and the two new workflows make their read/write boundaries clear.

### Task 2: Add bounded MCP traffic details

**Files:**

- Create: `packages/mcp/src/traffic.ts`
- Modify: `packages/mcp/src/index.ts`
- Modify: `packages/server/src/api/mcp-info.ts`
- Modify: `packages/mcp/README.md`
- Regenerate: `plugin/mcp/frigg-mcp.mjs` using `npm run build:plugin`

**Interfaces:**

- Consumes: `TrafficExchange` and `BodyPayload` from `@frigg/shared`; the existing GET `/api/traffic` response; `McpServer` from the installed SDK.
- Produces: `registerTrafficTools(server: McpServer): void`, registering `frigg_list_traffic` and `frigg_get_traffic_detail({ id, maxBodyBytes? })`.
- Detail output retains the `TrafficExchange` shape. For each body, `size` remains the original byte count, `truncated` becomes true if the MCP limit shortened the captured body, and `encoding` accurately describes the returned `data`.

- [x] **Step 1: Extract the current list tool.** Move the existing `frigg_list_traffic` registration from `packages/mcp/src/index.ts` into `packages/mcp/src/traffic.ts` without changing its filters or summary fields. Export `registerTrafficTools(server)` and call it once from `index.ts`.

- [x] **Step 2: Add byte-bounded body helpers.** In `traffic.ts`, implement a helper accepting `BodyPayload` and `maxBodyBytes`. For `base64`, decode the captured data, take at most `maxBodyBytes`, and encode that byte slice again. For `utf8`, convert the captured text to bytes, take the same bounded prefix, then move the end index backward until a fatal UTF-8 decoder accepts the prefix; this prevents returning a replacement character for a split code point. A zero limit returns an empty string or empty base64 payload. Keep the original `size`; set `truncated` if the source was already truncated, its captured bytes are fewer than the original size, or the returned bytes are fewer than the captured bytes. Use `DEFAULT_TRAFFIC_BODY_LIMIT = 65_536` and `MAX_TRAFFIC_BODY_LIMIT = 262_144`.

- [x] **Step 3: Register the detail tool.** Define `id` as a required nonempty string and `maxBodyBytes` as an integer from `0` through `262144`, default `65536`. Fetch `/api/traffic`, find the matching exchange ID, and return an explicit MCP error when no exchange matches. Apply the helper independently to request and present response bodies. Do not add a bulk detail operation.

- [x] **Step 4: Keep the displayed tool count accurate.** The current baseline registers 32 tools in `index.ts` and 19 automation tools, for 51 total. The new tool makes 52. Update `MCP_TOOL_COUNT` in `mcp-info.ts` to `52`.

- [x] **Step 5: Document and package the MCP tool.** Add the tool to `packages/mcp/README.md`, describing its ID input, body cap, truncation metadata, and read-only behavior. Run `npm run build:plugin` to regenerate the tracked bundled MCP file.

- [x] **Acceptance checkpoint:** Inspect the source registration and regenerated bundle together. Confirm only one `frigg_list_traffic` registration exists, the detail tool returns no exchange other than the requested ID, both request/response bodies are capped independently, and absent response states remain absent.

### Task 3: Add central setup contracts and the local-access boundary

**Files:**

- Create: `packages/shared/src/agent-integrations.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/server/src/lib/local-ui-access.ts`
- Modify: `packages/server/src/automation/access.ts`

**Interfaces:**

- Produces central constants for `AGENT_CLIENT` (`codex`, `claude-code`, `cursor`), `AGENT_RESOURCE` (`mcp`, `skills`), and setup states (`installed`, `missing`, `conflict`, `unavailable`, `error`). Export their derived types from `@frigg/shared`.
- Produces `AgentIntegrationStatus`, `AgentIntegrationSnapshot`, and `AgentIntegrationActionResult` shared by the API client and server. Each client status contains independent `mcp` and `skills` state, managed flag, and installed path(s); action results contain `ok`, updated status, and a user-displayable message.
- Produces `localUiRequestAllowed(metadata)` and `localUiAccessMiddleware(ports)`; retain the existing automation exports as wrappers to avoid changing callers.

- [x] **Step 1: Add the shared domain constants and DTOs.** Create the file with constants/types for client ID, resource ID, resource state, conflict action input, per-resource status, per-client status, snapshot, and operation result. Re-export them from `packages/shared/src/index.ts`.

```ts
export const AGENT_CLIENT = {
  codex: 'codex',
  claudeCode: 'claude-code',
  cursor: 'cursor',
} as const;

export type AgentClientId = (typeof AGENT_CLIENT)[keyof typeof AGENT_CLIENT];
```

- [x] **Step 2: Extract the existing loopback policy.** Move the host/IP/origin decision into `packages/server/src/lib/local-ui-access.ts`. Keep its policy: loopback socket address only; Host must match the configured API/UI ports; Origin, when present, must be HTTP localhost/loopback for those ports; ignore forwarded headers.

- [x] **Step 3: Preserve the automation API.** Keep `automationRequestAllowed` and `automationAccessMiddleware` exported from `automation/access.ts` as thin wrappers around the shared implementation. Preserve the current automation-specific denial message for automation routes.

- [x] **Acceptance checkpoint:** Inspect the extracted logic side by side with the previous access policy. Confirm allowed metadata has a loopback address and expected host/origin, while public addresses and untrusted origins are rejected regardless of forwarded headers.

### Task 4: Implement MCP client adapters and the installation registry

**Files:**

- Create: `packages/server/src/agent-integrations/clients.ts`
- Create: `packages/server/src/agent-integrations/registry.ts`
- Modify: `packages/server/src/api/mcp-info.ts`

**Interfaces:**

- `AgentClientAdapter` maps a central client ID to its skill roots, MCP status lookup, and MCP install operation.
- Registry helpers read and persist `~/.frigg/agent-integrations.json`, schema version `1`, recording only client/resource/path/version and hashes needed to recognize Frigg-managed content.
- The adapter receives `McpServerInfo` from `mcpServerInfo(apiPort)` so each client receives the active API URL and packaged MCP executable path.

- [x] **Step 1: Resolve packaged MCP and skill resources.** Keep `mcpServerInfo(apiPort)` as the source of the active API URL and MCP executable/entrypoint. Add a skill source resolver that uses `process.resourcesPath/skills` when packaged and the repository’s `plugin/skills` when running from source.

- [x] **Step 2: Add static client adapters.** In `clients.ts`, use Codex `codex mcp add` and `codex mcp get frigg --json`, Claude Code `claude mcp add --scope user` and inspect the documented user-scope entry in `~/.claude.json`, and Cursor’s `~/.cursor/mcp.json`. Use `run()` from `lib/exec.ts` with argument arrays. Never construct a shell string or accept a CLI name/path from the request. Compare only the parsed Frigg entry’s command, arguments, and `FRIGG_API_URL` against the registry fingerprint; never expose captured CLI output in errors returned to the UI. When a Frigg-managed entry is out of date, update only that entry. When `replaceConflict` is true, remove or replace only the conflicting `frigg` entry before adding the expected one.

```ts
export interface AgentClientAdapter {
  id: AgentClientId;
  mcpPaths(homeDir: string): string[];
  skillsRoots(homeDir: string): string[];
  getMcpStatus(homeDir: string, expected: McpServerInfo, managedIdentity?: string): Promise<AgentResourceStatus>;
  installMcp(input: McpServerInfo, replaceConflict: boolean): Promise<AgentResourceStatus>;
}
```

Codex MCP configuration follows `CODEX_HOME` when set. Claude Code uses the directory selected by `CLAUDE_CONFIG_DIR` for both its user MCP file and skills. Normalize Codex's documented `mcp get --json` `transport` shape before comparing identity. On Windows, resolve fixed CLI names without a shell and support npm `.cmd` shims by invoking their validated package entrypoint with Node.

- [x] **Step 3: Implement Cursor config merging.** Parse `~/.cursor/mcp.json`; reject unreadable or malformed data without writing. If `mcpServers` is missing, create it only when the top-level JSON object is valid. Add/update only `mcpServers.frigg`. Write a same-directory temporary file, flush it, preserve the old file mode where present, and rename atomically. Keep every unrelated parsed key/value unchanged.

- [x] **Step 4: Implement registry persistence.** Read the versioned registry from `~/.frigg/agent-integrations.json`; treat missing as an empty registry, reject an unsupported or malformed registry without overwriting it, and persist by temporary file plus rename. Store hashes of Frigg-managed skill files and a hash of only the normalized Frigg MCP command, arguments, and API URL; do not store other servers’ config, environment secrets, captured traffic, or bodies.

- [x] **Step 5: Compose MCP status and install actions.** Use `codex mcp get frigg --json`, inspect Claude Code’s documented user-scope entry in `~/.claude.json` after checking CLI availability, and inspect Cursor JSON to detect an unmanaged or externally changed `frigg` entry. Pass the client’s stored identity hash to `getMcpStatus`; compare it with a normalized hash of the observed Frigg command, arguments, and API URL. An unmanaged or changed same-name entry is a conflict, and an unavailable CLI is `unavailable`. Normalize CLI and configuration errors without returning raw config values. After install success, the service records the identity hash of the exact expected Frigg entry.

- [x] **Acceptance checkpoint:** Inspect the adapter table to confirm only the three central IDs can reach client operations. Inspect each write path to ensure conflict decisions precede writes, temporary files are within the destination filesystem, and only tracked Frigg-owned paths are replaced. Preserve Cursor config symlinks by atomically writing their resolved regular-file target. Normalize Codex's nested JSON transport response; honor `CODEX_HOME` and `CLAUDE_CONFIG_DIR`; resolve Windows npm CLI shims through fixed package manifests and Node; restore the prior Codex/Claude config after a failed add only if the post-removal file remains unchanged, and attempt a guarded restore when the config file disappears before its post-removal snapshot. If the extant file becomes unreadable or non-regular at that point, stop and require manual recovery instead of overwriting unknown concurrent changes. Server typecheck passed; static review confirmed sanitized errors, exact `frigg`-entry targeting, and strict registry shape/hash validation.

### Task 5: Install skills safely and compose the integration service

**Files:**

- Create: `packages/server/src/agent-integrations/skills.ts`
- Create: `packages/server/src/agent-integrations/service.ts`

**Interfaces:**

- `AgentIntegrationService` exposes `getSnapshot(): Promise<AgentIntegrationSnapshot>`, `installMcp(client: AgentClientId, replaceConflict?: boolean): Promise<AgentIntegrationActionResult>`, and `installSkills(client: AgentClientId, replaceConflict?: boolean): Promise<AgentIntegrationActionResult>`.
- The constructor receives `homeDir`, `dataDir`, `apiPort`, resolved MCP entry, resolved skill source directory, client adapters, and registry access so path/config decisions are explicit.
- The service returns independent MCP and skills statuses per client and user-displayable messages; it does not return raw configuration contents.

- [x] **Step 1: Discover bundled skills and client visibility.** Discover only immediate skill directories containing `SKILL.md`. Install Codex skills to `~/.agents/skills`, Claude Code skills to `~/.claude/skills`, and Cursor skills to `~/.cursor/skills`; also inspect `~/.agents/skills` and `~/.claude/skills` when checking Cursor visibility. If a Frigg skill is already visible to Cursor through either shared root, report that path and do not make a redundant Cursor copy.

- [x] **Step 2: Install skill directories without losing the prior version.** If a target exists, replace it only when the registry hash and tracked path prove it is Frigg-managed; otherwise return `conflict` unless `replaceConflict` is true. Copy all source skills to sibling temporary directories on the same filesystem, then rename existing targets aside and promote staged directories; if promotion or ownership recording fails, roll back promotions and restore prior targets. Update registry hashes only after successful promotion.

- [x] **Step 3: Compose snapshot and install operations.** Implement the service methods over the adapters, registry, and skill installer. `getSnapshot()` returns all three clients and independent MCP/skills states. Each install operation refreshes the corresponding status and registry entry after success and leaves the other resource untouched.

- [x] **Acceptance checkpoint:** Inspect both resources’ status and write paths. Confirm Cursor recognizes skills shared from Codex/Claude roots, unmanaged skill collisions are visible before replacement, and a failed directory promotion restores the prior skill. Server typecheck passed; transaction stages all skills, updates the ownership registry before deleting backups, and restores promoted directories if promotion or registry persistence fails.

### Task 6: Expose protected setup routes and wire server lifecycle

**Files:**

- Create: `packages/server/src/agent-integrations/router.ts`
- Modify: `packages/server/src/api/router.ts`
- Modify: `packages/server/src/start.ts`

**Interfaces:**

- `buildAgentIntegrationRouter(options)` receives the service, active API port, and configured UI port.
- HTTP contract:

```text
GET  /api/agent-integrations
POST /api/agent-integrations/:client/mcp/install
POST /api/agent-integrations/:client/skills/install
```

- Install POST body is `{ "replaceConflict": boolean }`, default false. All responses use the shared `AgentIntegrationSnapshot` or `AgentIntegrationActionResult`.

- [x] **Step 1: Add the router.** Validate `:client` against `AGENT_CLIENT`; reject unknown clients with 400. Apply `localUiAccessMiddleware` directly to each status/action route. Map unmanaged-name collisions to 409, malformed config to 400, missing client CLI to an unavailable result, and unexpected I/O errors to 500 without returning file contents.

- [x] **Step 2: Wire the service at startup.** In `start.ts`, resolve the actual Frigg home/data directory, dynamically resolve `mcpServerInfo` from the active `deps.apiPort` (including fallback port selection), skill source, and `configuredUiPort`; construct one `AgentIntegrationService` and pass it through `ApiDeps` into `buildRouter`.

- [x] **Step 3: Mount the router and protect the legacy action.** Mount `buildAgentIntegrationRouter` in `buildRouter`. Keep `/api/mcp/install/claude-code` as a compatibility alias that calls the same Claude Code service method and applies the same local UI access middleware; it must not keep the old unguarded path.

- [x] **Step 4: Keep service resources local.** Do not add new `listen()` calls or proxy routes. The MCP setup API is available through the existing local API server only, with access checked per request.

- [x] **Acceptance checkpoint:** Trace a request from UI through the middleware to the static adapter. Confirm an unauthorized request cannot invoke a CLI or touch the registry/config paths, and the legacy route has the same guard. Server typecheck passed; local access middleware is attached only to the four integration routes so it does not affect other API endpoints.

### Task 7: Add the Codex, Claude Code, and Cursor setup UI

**Files:**

- Modify: `packages/web/src/api/client.ts`
- Create: `packages/web/src/components/mcp/AgentIntegrationCard.tsx`
- Modify: `packages/web/src/screens/McpScreen.tsx`
- Modify: `packages/web/src/i18n/mcp.ts`
- Modify: `packages/shared/src/index.ts` only if Task 3 exports require barrel adjustment

**Interfaces:**

- `getAgentIntegrations(): Promise<AgentIntegrationSnapshot>`
- `installAgentMcp(client: AgentClientId, replaceConflict?: boolean): Promise<AgentIntegrationActionResult>`
- `installAgentSkills(client: AgentClientId, replaceConflict?: boolean): Promise<AgentIntegrationActionResult>`
- `AgentIntegrationCard` receives one `AgentIntegrationStatus`, pending resource, and install callbacks; it does not own API calls.

- [x] **Step 1: Add typed API wrappers.** Import shared DTOs and add wrappers for the GET plus two POST routes. URL-encode `client`; send `replaceConflict` explicitly and parse a structured conflict result from HTTP 409.

```ts
export function getAgentIntegrations(): Promise<AgentIntegrationSnapshot> {
  return request('/api/agent-integrations');
}
```

- [x] **Step 2: Build the client card.** Render client name, separate MCP and skills status, install/update action per resource, and per-action progress/result. On conflict, show a specific replace action that resubmits `replaceConflict: true`; never replace during the first install click.

- [x] **Step 3: Update `McpScreen`.** Load `McpServerInfo` and integration status together. Render cards in fixed Codex, Claude Code, Cursor order. After an action, refresh status. Keep the manual MCP JSON/command section for unavailable CLI and troubleshooting; remove the Claude-only button implementation once the shared card owns that action.

- [x] **Step 4: Add English and pt-BR strings.** Add labels for status, install/update, conflict, explicit replace, unsupported/missing CLI, invalid config, success, restart/reload hint, and action-level errors. Do not render raw config values from status responses.

- [x] **Acceptance checkpoint:** Inspect the three-card UI state flow for independent MCP/skills status, action pending, conflict, failure, success, and refresh. Confirm the existing manual setup content remains available. Web typecheck and production build passed; landing page typecheck and production build passed.

### Task 8: Package skills and document setup

**Files:**

- Modify: `packages/desktop/package.json`
- Modify: `packages/mcp/README.md`
- Modify: `README.md`
- Modify: `README.pt-BR.md`
- Regenerate: `plugin/mcp/frigg-mcp.mjs` after Task 2

**Interfaces:**

- Electron resources include `resources/skills/<skill-name>/SKILL.md` and `resources/mcp/frigg-mcp.mjs`.
- In development, the server resolves the same skills from repository `plugin/skills/`.
- The Claude plugin keeps using `plugin/skills/` and the generated MCP bundle.

- [x] **Step 1: Package skill resources.** Add `../../plugin/skills` to Electron Builder `extraResources` with destination `skills`, beside the existing MCP resource destination. Do not add skills to the ASAR-only `files` list.

- [x] **Step 2: Align documentation.** Update both READMEs’ MCP section to describe Codex, Claude Code, and Cursor setup from Frigg’s MCP screen, explain that setup is user-global and requires client reload, name the API Client and traffic inspection skills, and update any displayed MCP tool total to `52`. Update `packages/mcp/README.md` with manual fallbacks and the detailed traffic tool contract.

- [x] **Step 3: Regenerate the plugin bundle after all MCP edits.** Run `npm run build:plugin` from repository root and include `plugin/mcp/frigg-mcp.mjs` with the source changes. The skills themselves remain ordinary files under `plugin/skills/` and are included by the existing marketplace package layout.

- [x] **Step 4: Inspect the final diff.** Review status, app and plugin resource paths, skill names/descriptions, and config-write ownership against the spec. Do not remove user files or unrelated MCP entries.

- [x] **Acceptance checkpoint:** Compare the desktop resource destination with the server’s packaged resolver, compare the Claude plugin’s skill source with the installer’s source, and make sure both READMEs describe the same client coverage. Desktop package JSON parsed successfully; server/web/landing builds passed; all displayed MCP totals are 52.

---

## Coverage Check

- Codex/Claude Code/Cursor setup screen and global installation: Tasks 3–7.
- Separate MCP and skill state/actions per client: Tasks 4–7.
- Portable API Client and traffic skills plus existing skills: Task 1.
- Traffic detail tool, selected IDs, bounded bodies, status/encoding metadata: Task 2.
- Conflict detection, idempotence, update ownership, atomic write behavior: Tasks 4–6.
- Loopback-only setup operations and legacy Claude route: Tasks 3 and 6.
- Electron and Claude plugin packaging plus end-user documentation: Tasks 1 and 8.
