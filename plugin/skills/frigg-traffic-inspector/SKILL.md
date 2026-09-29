---
name: frigg-traffic-inspector
description: Use when a user wants to search, summarize, extract, or document HTTP(S) traffic captured by Frigg.
---

# Inspect Frigg traffic

1. Call `frigg_status` and `frigg_list_traffic`. The list returns summary fields and IDs, not request or response headers and bodies. It supports `hostContains` and `limit`; filter returned summaries by URL, method, status, or other requested fields as needed.
2. Select only exchanges relevant to the user’s request. Call `frigg_get_traffic_detail` once per selected ID; do not fetch every body when a summary is enough.
3. Keep each exchange ID and its request and response fields together. A `pending` or `aborted` exchange can have no response. Preserve `encoding`, original `size`, and `truncated`; do not decode base64 bodies as text or imply a truncated body is complete.
4. Return only the requested fields, with a concise summary, table, or sanitized request example. Mask `Authorization`, cookies, API keys, and token-like values in headers, query parameters, and bodies. Include the exchange IDs used and identify any omitted or truncated data.

This workflow is read-only: do not call `frigg_clear_traffic`, create or delete mocks, or run API Client requests unless the user separately asks for that action.
