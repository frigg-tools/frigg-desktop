# @frigg/mcp

MCP (Model Context Protocol) server for Frigg — a stdio bridge to the Frigg HTTP API.

## Prerequisites

The Frigg desktop app or server must be running before you start the MCP server.
By default the MCP server connects to `http://localhost:4848`.
Override with the `FRIGG_API_URL` environment variable.

```
# start the server (from the monorepo root)
npm start
```

## Setup from Frigg

In the desktop app, open **MCP** and install the server and skills for Codex, Claude Code, or Cursor. Setup is user-global, uses Frigg's active API port and bundled MCP entrypoint, and asks before replacing an existing `frigg` entry or skill folder. Reload the client after installation.

Frigg installs two portable skills alongside the MCP server:

- `frigg-api-client`: create workspaces, collections, requests, and environments, then run saved or inline requests.
- `frigg-traffic-inspector`: find a captured exchange and retrieve its bounded request/response details.

## Manual setup

Build the packaged MCP entry from the repository root with `npm run build:plugin`. Replace `<path-to-frigg-mcp.mjs>` below with its absolute path. Keep the `FRIGG_API_URL` port aligned with the running Frigg API.

### Codex

```bash
codex mcp add frigg --env FRIGG_API_URL=http://localhost:4848 -- node <path-to-frigg-mcp.mjs>
```

### Claude Code

```bash
claude mcp add --env FRIGG_API_URL=http://localhost:4848 --transport stdio --scope user frigg -- node <path-to-frigg-mcp.mjs>
```

### Cursor

Merge this server into `~/.cursor/mcp.json` without removing other entries:

```json
{
  "mcpServers": {
    "frigg": {
      "command": "npx",
      "args": [
        "tsx",
        "<path-to-frigg-mcp.mjs>"
      ],
      "env": {
        "FRIGG_API_URL": "http://localhost:4848"
      }
    }
  }
}
```

### Skills

Copy the desired skill directories from `plugin/skills/` into the client-specific user skills directory:

| Client | User skills directory |
| --- | --- |
| Codex | `~/.agents/skills/` |
| Claude Code | `~/.claude/skills/` |
| Cursor | `~/.cursor/skills/` |

Restart or reload the client to discover newly installed skills.

## Tools

### Traffic

| Tool | Description |
|------|-------------|
| `frigg_status` | Proxy status: ports, LAN IP, cert fingerprint, exchange count |
| `frigg_list_traffic` | List captured HTTP exchanges (optional `limit`, `hostContains` filter) |
| `frigg_get_traffic_detail` | Read one exchange by ID, returning full metadata and request/response bodies capped independently at 65,536 bytes by default (262,144 maximum); preserves original size, encoding, and truncation state |
| `frigg_clear_traffic` | Delete all captured traffic |

`frigg_get_traffic_detail` is read-only. It accepts only an ID from the traffic list and an optional `maxBodyBytes`; it does not return other exchanges or clear traffic. Bodies shortened by the response cap are marked `truncated` while retaining their original byte size and encoding.

### Mocks

| Tool | Description |
|------|-------------|
| `frigg_list_mocks` | List all mock folders and rules |
| `frigg_create_mock_folder` | Create a mock folder (`name`, optional `parentId`) |
| `frigg_create_mock_rule` | Create a mock rule (`pathPattern` + `statusCode` required; optional method, host, body, headers, delay, folder, priority) |
| `frigg_update_mock_rule` | Patch fields of an existing rule by `id` |
| `frigg_delete_mock_rule` | Delete a mock rule by `id` |

### Devices

| Tool | Description |
|------|-------------|
| `frigg_list_devices` | Android + iOS devices and proxy/tooling status |

### API Client

| Tool | Description |
|------|-------------|
| `frigg_client_snapshot` | Full snapshot (workspaces, folders, requests, environments) |
| `frigg_create_workspace` | Create a workspace (`name`) |
| `frigg_create_collection` | Create a folder/collection (`workspaceId`, `name`, optional `parentId`) |
| `frigg_create_request` | Create a request and populate all fields in one call |
| `frigg_update_request` | Patch fields of an existing request by `id` |
| `frigg_delete_request` | Delete a request by `id` |
| `frigg_run_request` | Execute a request — either by `requestId` or inline `request` object |
| `frigg_create_environment` | Create an environment in a workspace |
| `frigg_set_env_var` | Upsert a variable (`key`/`value`) in an environment |

### Frida

| Tool | Description |
|------|-------------|
| `frigg_frida_snapshot` | frida-server status, script session, example scripts, host frida-tools version |
| `frigg_frida_status` | frida-server status for a `deviceId` (installed/running/version) |
| `frigg_frida_install` | Download + install a matching frida-server onto the device |
| `frigg_frida_start` | Start frida-server (adb root + setenforce 0 + launch) |
| `frigg_frida_stop` | Stop frida-server (optional `deviceId`) |
| `frigg_frida_run` | Inject and run a script (`deviceId`, `target`, `source`, optional `spawnMode`) |
| `frigg_frida_stop_script` | Stop the running script session |

### Emulators (AVD)

| Tool | Description |
|------|-------------|
| `frigg_list_avds` | List AVDs and whether each is booted |
| `frigg_boot_avd` | Boot an emulator by `name` |
| `frigg_create_avd` | Create a rooted `google_apis` AVD from an installed image (`name`, `apiLevel`) |
