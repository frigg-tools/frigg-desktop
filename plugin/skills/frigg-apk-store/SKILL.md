---
name: frigg-apk-store
description: Use when a user wants to save, describe, find, or install an APK through Frigg's local Apk Store.
---

# Frigg Apk Store

Use Frigg's Apk Store to keep single APK files with a short context and install a saved APK on one connected Android device at a time.

## Workflow

1. **Check the saved APKs.** Call `frigg_apk_store_list` when the user wants to find, review, or install something already saved. Match by the entry name and description; use the returned opaque `id` for later calls.
2. **Import one file.** Ask the user for the exact local path if they have not provided it. Call `frigg_apk_store_import` with that path, a useful display name, and the user's context. Never scan directories, search the filesystem, or guess an APK path. Imports accept one `.apk` file up to 1 GiB; split APKs and store bundles are unsupported.
3. **Choose one device.** Before installation, call `frigg_list_devices` and use only Android devices whose state is `device`. If the user's requested device is ambiguous, ask which one. Do not install on multiple devices in one operation.
4. **Install the requested APK.** Call `frigg_apk_store_install` with the saved APK `id` and exactly one device `serial`. The install may update the app already on the device and preserves app data. Report the returned result. Installation does not grant runtime permissions or allow downgrades.
5. **Delete only after confirmation.** Show the entry name and ask whether the user wants that specific APK removed. After an explicit yes, call `frigg_apk_store_delete` with the entry `id` and `confirmedByUser: true`.

## Tools

| Tool | Purpose | Required input |
| --- | --- | --- |
| `frigg_apk_store_list` | List saved APKs and their context, sizes, and compression | None |
| `frigg_apk_store_import` | Add one file supplied by the user | `filePath`; optional `name`, `description` |
| `frigg_apk_store_install` | Install one entry on one Android device | `apkId`, `serial` |
| `frigg_apk_store_delete` | Remove one saved entry | `apkId`, `confirmedByUser: true` after confirmation |

## Limits and recovery

- Files must end in `.apk`, be non-empty, have a ZIP signature, and be at most 1 GiB. The tool streams the supplied file; it does not return APK bytes to the conversation.
- Frigg gzips files only when gzip reduces their stored size. It checks SHA-256 before installation and removes the temporary restored APK after the operation.
- If the target device is offline or unauthorized, ask the user to reconnect it and authorize USB debugging, then refresh with `frigg_list_devices`.
- If ADB reports an install error or times out, report the tool's error and do not retry on a different device unless the user requests that.
- A second installation to the same device is rejected while one is active. Wait for the active operation to finish before trying again.
- The catalog and files are local to this Frigg installation. Do not promise cloud sync or availability on another computer.
- Do not ask for a second confirmation to install when the user has clearly requested that install. Do ask before deleting an entry.
