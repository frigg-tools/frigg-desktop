---
name: frigg-android-setup
description: Use when wiring an Android (or iOS) app project up for Frigg HTTPS interception — making the app trust Frigg's CA via a network_security_config, scoped to chosen build variants/flavors, pulling the CA cert straight from the running Frigg server. Triggers on "set up Frigg in this app", "configure network security config for Frigg", "make my Android app trust the proxy".
---

# Set up Frigg interception in a mobile project

Goal: make a mobile app trust Frigg's CA so its HTTPS traffic can be intercepted, **without shipping that trust to production**. On Android this means a `network_security_config` that trusts the Frigg CA, applied only to the build variants the user picks. The Frigg CA is pulled straight from the running Frigg server — no manual cert install on the device needed (API 24+).

Work top-to-bottom. Don't skip the variant question or the scoping — leaking debug trust anchors into a release build is a security bug.

## 1. Confirm Frigg is running and locate the project

- Verify Frigg is reachable: `frigg_status` (MCP) or `curl -fsS http://localhost:4848/api/status`. If it fails, tell the user to start the Frigg app / `npm run dev` and stop.
- Find the Android app module: the `build.gradle`/`build.gradle.kts` with an `android { }` block (usually `app/`). iOS-only repo → jump to the **iOS** section.

## 2. Detect the variants

Read the app module's gradle file and collect `buildTypes` (always at least `debug` + `release`) and `productFlavors` (+ `flavorDimensions`) if any. The interceptable variants are each build type, and — if flavors exist — each flavor×buildType combo.

**Source-set naming rule** (you must get this exact): a Gradle source set is `app/src/<name>/`, where `<name>` is:
- a build type, lowercase as declared: `debug`
- a flavor, literal as declared: `internal`
- a flavor+buildType: `<flavorName>` + `<BuildType with first letter upper-cased>`, camelCased, no separator → flavor `qa` + `debug` = `qaDebug`; flavor `QA` = `QADebug`.

## 3. Ask the user where interception should be active

Use AskUserQuestion (multi-select). Offer the detected variants, `debug` pre-selected and recommended. State plainly: only the chosen variants trust the Frigg CA; release/production stays untouched. Map the answer to the most specific source-set name they mean (e.g. "QA debug only" → `qaDebug`).

## 4. Pull the Frigg CA into each chosen source set

For every chosen source-set `<name>`:
```bash
mkdir -p app/src/<name>/res/raw
curl -fsS http://localhost:4848/cert.crt -o app/src/<name>/res/raw/frigg_ca.crt || { echo "could not fetch Frigg CA — is Frigg running?"; exit 1; }
```
(Use the actual API port if Frigg runs on a custom one.) Notes:
- The raw resource id is the filename without extension → `@raw/frigg_ca`. `.crt` is fine.
- It must be a **single** CA certificate (PEM or DER), not a chain/bundle — `/cert.crt` serves exactly the Frigg root, which is what you want.
- **Gitignore it.** The CA is per-machine and is regenerated if `~/.frigg` is reset; a committed cert makes teammates' apps trust the wrong CA and interception fails silently. Add the paths (e.g. `app/src/debug/res/raw/frigg_ca.crt`) to `.gitignore`.

## 5. Write the network_security_config per source set

Create `app/src/<name>/res/xml/network_security_config.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config>
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
            <certificates src="@raw/frigg_ca" />
        </trust-anchors>
    </base-config>
</network-security-config>
```

- `@raw/frigg_ca` makes the app trust Frigg's CA directly — no device cert install needed.
- `<certificates src="user" />` ALSO trusts any **user-installed** CA on the device for every connection in this variant — a conscious debug tradeoff; drop it if you only want the bundled Frigg CA trusted.
- Do **not** add `cleartextTrafficPermitted="true"` to `<base-config>` by default — it permits plain HTTP to every host, not just the proxy. Only add it if the user explicitly needs cleartext, and prefer scoping it to the proxy with a `<domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="true">10.0.2.2</domain>…</domain-config>` (emulator host) instead of the base config.

## 6. Add the manifest reference in the same source set

`android:networkSecurityConfig` must be merged onto `<application>` for that variant. Create/merge `app/src/<name>/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
          xmlns:tools="http://schemas.android.com/tools">
    <application
        tools:node="merge"
        android:networkSecurityConfig="@xml/network_security_config" />
</manifest>
```

- `tools:node="merge"` keeps the overlay `<application>` merging cleanly onto main instead of fighting other attributes.
- If the **main** manifest already sets `android:networkSecurityConfig`, add `tools:replace="android:networkSecurityConfig"` to the `<application>` above, AND fold the app's existing config into the new xml: read `app/src/main/.../network_security_config.xml` fully and **preserve every `<domain-config>`, pinning rule and existing anchor** — only ADD the Frigg trust anchor. Never drop the app's own rules.
- If the chosen variant already has its own `AndroidManifest.xml` / `network_security_config.xml`, merge into them rather than overwriting.

## 7. Caveats, manual step, verify

- **minSdk matters.** `android:networkSecurityConfig` (and the `@raw` anchor) only take effect on **API 24+**. On older devices it is silently ignored — the only path there is installing the Frigg CA as a user cert on the device (and pre-24 user CAs are trusted by default). Warn the user if `minSdk < 24`.
- **Trust ≠ routing.** This config makes the app *trust* Frigg; traffic still has to *route* through the proxy. Point them at Frigg's **Devices → Set up interception** (sets the device/emulator HTTP proxy), or a manual Wi-Fi proxy `<lan-ip>:8888`.
- Some HTTP clients (Ktor Darwin, a custom OkHttp engine) ignore the system proxy — they may need explicit proxy config in code, but the CA trust above is still required.
- Suggest (don't auto-run) `./gradlew :app:assemble<Variant>` to confirm the manifest/resource merge is clean.

## iOS

iOS has no `network_security_config`:
- **Simulator:** Frigg's **Devices → Install CA cert** trusts the Frigg CA in the booted simulator; simulators inherit the Mac proxy (toggle on the Devices screen).
- **Physical device:** open Frigg's `/setup` page (QR on the Devices screen), install the CA profile, then enable full trust in *Settings → General → About → Certificate Trust Settings*, and set the Wi-Fi proxy to `<lan-ip>:8888`.
- ATS usually allows this in debug; only relax ATS for a specific domain if it blocks, never in release.
