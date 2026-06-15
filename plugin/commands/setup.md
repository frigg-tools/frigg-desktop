---
description: Check the Frigg connection and explain how to get it running
---

Help the user connect this plugin to a running Frigg server.

1. Call `frigg_status` to test connectivity.
2. **If it succeeds**: confirm Frigg is reachable (report the ports + exchange count) and that the MCP tools are ready. Point them at `/frigg:status`, `/frigg:traffic`, `/frigg:mock` and `/frigg:run`.
3. **If it fails**: the Frigg server is not reachable at `http://localhost:4848`. Explain:
   - Start the **Frigg desktop app**, or run `npm run dev` from the Frigg repo (server on `:4848`, proxy on `:8888`).
   - The MCP talks to the server's HTTP API — the server must stay running while you use these tools.
   - If Frigg runs on a custom port, set `FRIGG_API_URL` for the `frigg` MCP server (default `http://localhost:4848`).
   - To capture device traffic, set up interception on the **Devices** screen (Android adb, iOS Simulator, or the QR setup page for a physical device).

Keep it short and actionable.
