# Work queue

- [x] Approve the reversible SQLite storage approach and migration/backup boundary.
- [x] Implement and document local SQLite authority with current and previous JSON exports.
- [!] Create and push the private GitHub Docket repository after one interactive GitHub CLI or browser sign-in. The authenticated Codex connector confirms the repository is absent but exposes no repository-creation action.
- [!] Create the reversible per-user `DocketDaemon` logon task after Windows grants Task Scheduler permission.
- [!] Create the Bitwarden Secrets Manager Docket project, `REVIEW_SECRET`, and read-only machine account; record the value-free secret ID in `secret-manifest.json`.
- [x] Implement migration, compatibility, and rollback tests in an isolated worktree (67 tests pass; Gitleaks clean).
