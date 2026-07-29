# Current task

Goal: Route Docket's local SQLite authority through the shared transactionally consistent Google Drive snapshot adapter.

## Done

- Confirmed the canonical local store is `%USERPROFILE%\.docket-local\docket.sqlite3`.
- Created isolated branch `codex/project-data-sync`.
- Added the project adapter and manifest declaration.
- Passed 84 Node tests, syntax checks, the disposable data-adapter test, whitespace validation, and Gitleaks.

## Remaining

1. Commit, merge, and push the verified branch.

## Next verifier

`git status --short --branch`
