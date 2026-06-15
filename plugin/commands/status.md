---
description: Show Frigg proxy status and connected devices
---

Report the current state of Frigg.

1. Call `frigg_status` (proxy ports, LAN IP, cert fingerprint, captured-exchange count).
2. Call `frigg_list_devices` (connected Android/iOS devices, their proxy + tooling status).

Summarize concisely: is the proxy up, on which ports, how many exchanges captured, and which devices are connected and ready to intercept. If `frigg_status` errors, the Frigg server is not running — tell the user to start the Frigg desktop app or run `npm run dev`, then retry (see `/frigg:setup`).
