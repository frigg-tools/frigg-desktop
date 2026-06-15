---
description: List recently captured HTTP(S) traffic, optionally filtered
argument-hint: "[host or path substring]"
---

Show recent traffic captured by the Frigg proxy.

Call `frigg_list_traffic`. If the user passed a filter in `$ARGUMENTS`, keep only exchanges whose host or path contains it.

Present a compact table: method, status, host + path, duration. Flag anything notable — non-2xx responses, slow requests, or a ⚡ MOCK hit. If the user asks about a specific exchange, surface its request/response headers and body. If nothing was captured, remind them the device must be set up for interception (`/frigg:status` to check devices).
