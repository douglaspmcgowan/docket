# Status

- Git authority is `https://github.com/douglaspmcgowan/docket`; `master` includes archive-aware sync through merge `32d23467a4d491c4a22b037a7da560725ca76d3f`.
- The canonical local store is `C:\Users\dougl\.docket-local\docket.sqlite3`, with current JSON exports and one previous export per document.
- The local store contains 162 items. `setup-handoff--general-claude-github` and `setup-handoff--google-drive-preferences` are archived locally, leaving 160 unresolved items eligible for cloud publication.
- Cloud sync excludes every local ID present in `results.json`. `enqueue.js --archive <id>` retires a preexisting cloud item only after validating the returned ID, archive flag, success flag, and answer timestamp.
- The public API is live and fails closed without `APP_SECRET`; the loopback server trusts only validated local socket requests and requires no persistent local passcode.
- Authenticated publication remains pending Bitwarden `REVIEW_SECRET` setup and the matching Vercel `APP_SECRET`. No credential values live in this repository.
- The repository passes 84 Node tests, both offline self-tests, syntax checks, whitespace validation, and Gitleaks.
- The current human setup and operations guide is `C:\Users\dougl\.agents\human-readable\README.md`.
