# Security

## Reporting a vulnerability

Please report security issues **privately** — open a draft advisory under the
repository's **Security → Advisories** tab, or email the maintainer. Do not file
a public issue for anything exploitable.

## How we keep secrets out of the repo

The project is open source, so nothing secret may ever land in the tree or its
history. Four layers guard against leaks:

1. **`.gitignore`** — `.env*`, `*.pem`, `*.key`, `*.p12`, `*.keystore`,
   `*.mobileprovision`, `**/credentials*.json`, `**/*secret*.json`, `.frigg/`
   and build output are never tracked.
2. **Local pre-commit hook** (`.githooks/pre-commit`) — runs
   [gitleaks](https://github.com/gitleaks/gitleaks) on the staged diff and
   **blocks the commit** if a secret is detected. Enable it once after cloning:
   ```bash
   brew install gitleaks
   git config core.hooksPath .githooks
   ```
3. **CI secret scan** (`.github/workflows/secret-scan.yml`) — gitleaks scans the
   full history on every push and pull request.
4. **GitHub native** — secret scanning, **push protection** (rejects a push that
   contains a known secret), Dependabot alerts and security updates are enabled
   on the repository.

## What about user data?

Frigg never bundles or transmits your data. Captured traffic, mocks, API-client
collections and any tokens you enter live only on **your** machine, under
`~/.frigg/` — outside the repository and outside the packaged app. The `.dmg`
ships application code only.

The TLS-intercepting proxy installs a **local** CA so Frigg can read HTTPS on
devices you control. Treat that CA like a secret: it is generated per machine in
`~/.frigg/` and is never committed or shipped.
