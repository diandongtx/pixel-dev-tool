# Contributing

Use Node.js 22 or newer. Run `npm ci --include=dev`, `npm test`, and `npm run build` before opening a pull request. Run `npm run lint` for additional diagnostics; existing warnings should not be expanded by a change.

For a bug report, include reproduction steps, expected and actual behavior, your OS and browser, and a small synthetic input if possible. Do not attach credentials, private artwork, or production level databases.

Keep algorithm changes reproducible with fixed seeds. Tests should verify useful invariants such as color conservation and background masks, and use checked-in synthetic inputs or temporary directories instead of files in a developer's workspace.

The application UI currently uses Chinese. English or Chinese issues and documentation contributions are welcome. Keep the local filesystem API bound to loopback unless a change explicitly adds and tests a suitable access-control design.

Public development begins with this repository's initial commit. This repository is maintained separately from the original internal project; changes are intentionally reviewed and ported rather than mirrored wholesale.
