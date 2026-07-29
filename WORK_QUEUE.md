# Work queue

- [x] Approve the reversible SQLite storage approach and migration/backup boundary.
- [x] Implement and document local SQLite authority with current and previous JSON exports.
- [x] Create and push the private `douglaspmcgowan/docket` GitHub repository.
- [x] Create and verify the reversible per-user `DocketDaemon` logon task from `C:\Users\dougl\projects\docket`.
- [?] In Bitwarden Password Manager Free, create `project:docket:production` with a hidden `REVIEW_SECRET` field; then unlock the CLI in a trusted terminal and have an agent verify the value-free broker path.
- [x] Implement migration, compatibility, and rollback tests in an isolated worktree (67 tests pass; Gitleaks clean).
- [x] Make the loopback-only local API usable without a persistent passcode while preserving fail-closed cloud authentication.
- [x] Import five setup handoff cards into the local Docket.
- [x] Route the canonical SQLite store through transactionally consistent Google Drive snapshots and verify restore.
