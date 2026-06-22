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

## Adding to Claude

### Option 1 — `claude mcp add`

```bash
claude mcp add frigg -e FRIGG_API_URL=http://localhost:4848 -- npx tsx /Users/guilherme/Desktop/Projetos/frigg-tools/packages/mcp/src/index.ts
```

### Option 2 — JSON config snippet

Add to your Claude MCP config (`~/.claude/mcp.json` or equivalent):

```json
{
  "mcpServers": {
    "frigg": {
      "command": "npx",
      "args": [
        "tsx",
        "/Users/guilherme/Desktop/Projetos/frigg-tools/packages/mcp/src/index.ts"
      ],
      "env": {
        "FRIGG_API_URL": "http://localhost:4848"
      }
    }
  }
}
```

## Tools

### Traffic

| Tool | Description |
|------|-------------|
| `frigg_status` | Proxy status: ports, LAN IP, cert fingerprint, exchange count |
| `frigg_list_traffic` | List captured HTTP exchanges (optional `limit`, `hostContains` filter) |
| `frigg_clear_traffic` | Delete all captured traffic |

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
