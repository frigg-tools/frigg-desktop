---
description: Create a Frigg mock rule from a description or a captured request
argument-hint: "<what to mock, e.g. 'GET /api/user → 500'>"
---

Create a mock rule in Frigg from the user's request: `$ARGUMENTS`.

1. If the user refers to a captured request ("the failing login", "that 500"), call `frigg_list_traffic` first to find the matching exchange and base the matcher on its real method/host/path.
2. Build a matcher (method, host pattern, path pattern — globs `*`/`?` allowed) and a response (status, headers, body, optional delay) that satisfies what they asked.
3. Call `frigg_create_mock_rule`. If they want it grouped, use `frigg_create_mock_folder` first and pass the folder id.
4. Confirm the rule back: what it matches and what it returns. Mention it can be toggled/edited in the Mocks screen.

Ask for clarification only if the target request or the desired response is genuinely ambiguous.
