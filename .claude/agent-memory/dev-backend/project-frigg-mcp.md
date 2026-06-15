---
name: project-frigg-mcp
description: @frigg/mcp package — MCP server that bridges Frigg's REST API over stdio
metadata:
  type: project
---

packages/mcp created at 2026-06-15. Thin stdio bridge to Frigg HTTP API (default http://localhost:4848, override via FRIGG_API_URL).

**Why:** Allows Claude and other AI clients to read and modify Frigg (traffic, mocks, API client) over MCP without reimplementing any logic.

**How to apply:** When asked about the MCP server, check packages/mcp/src/index.ts for tool registration patterns. All tools call packages/mcp/src/frigg-api.ts helpers.

Discoveries:
- @modelcontextprotocol/sdk v1.29.0 installed at repo root; zod v4 is the installed peer
- server.tool(name, description, zodShapeOrUndefined, callback) signature — tool() not registerTool()
- StdioServerTransport must use process.stdin/stdout (default); no stdout printing in server code
- TSC passes with allowImportingTsExtensions + noEmit, NodeNext module resolution
- Smoke test run from packages/mcp/ context so node_modules resolution works
