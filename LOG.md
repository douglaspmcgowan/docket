# Work log
2026-07-26 | Recovered the portable bundle, passed 65 tests, installed the cross-agent project harness, mapped current storage, and parked SQLite implementation at the design gate.
2026-07-26 | Adopted the richer portable baseline and feedback skill; implemented local SQLite authority with reversible JSON exports; passed 67 tests.
2026-07-26 | Replayed the SQLite patch in an isolated worktree; all 67 tests and Gitleaks passed, then the temporary worktree and branch were removed.
2026-07-26 | Added and tested the outbox importer, loaded the final 157-card Skills Docket into local SQLite, and verified the loopback UI at port 8471; 69 tests pass.
2026-07-26 | Attempted the repository’s reversible DocketDaemon logon task; Windows Task Scheduler denied creation, so persistent startup remains parked.
2026-07-26 | Classified all 12 Docket runtime variables, regenerated/check-verified the readable secret manifest, and installed the exact-command BWS broker for cloud sync.
2026-07-27 | Hardened the BWS broker to bind command, arguments, destination variable, and secret ID; preserved fail-closed publication and re-verified all 69 tests, the manifest, and Gitleaks.
2026-07-27 | Confirmed the Codex GitHub connector account and repository absence; repository creation remains at the interactive CLI/browser sign-in boundary because the connector exposes no create-repository action.
2026-07-27 | Published the private Docket repository, verified its clean lowercase clone with 69 tests and Gitleaks, and installed the limited-privilege DocketDaemon logon task with an HTTP 200 loopback check.
2026-07-27 | Repaired local API authentication with loopback socket validation and an unspoofable in-process marker; imported five setup handoffs; all 73 tests pass.
2026-07-29 | Added archive-aware cloud publication and a verified single-card archive CLI; regression and assembled loopback coverage raise the suite to 84 tests.
2026-07-29 | Added the shared-harness Docket SQLite snapshot adapter with checksum, restore-backup, and paths-with-spaces coverage.
2026-07-29 | Hardened all four Vercel Blob aggregates with schema validation and ETag compare-and-swap; created and verified a complete live export; restored it into a disposable local target.
2026-07-29 | Added complete export/restore adapters, atomic outbox imports, phone Playwright coverage, v3 harness state, and retry handling for Vercel's untyped conflict response; 109 tests and the live isolated CAS check pass.
2026-07-29 | Closed recovery review gaps with stable two-pass export capture, atomic verified publication, and 3-daily/4-weekly/3-monthly snapshot retention; 115 tests and a read-only live snapshot pass.
2026-07-29 | Bound Snapshot retention defaults to the matching data-manifest asset, preserved explicit per-tier overrides and safe zero-tier behavior, and raised the verified suite to 116 tests.
2026-07-29 | Closed Docket snapshot-inventory, retention, physical-restore, shared-content, brokered-credential, and cloud-phone proof blockers; 124 tests, both adapters, syntax/self-tests, diff checks, and Gitleaks pass.
2026-07-29 | Removed every active plaintext passcode-file reader, centralized injected REVIEW_SECRET enforcement, disabled unsafe legacy wrappers with broker guidance, and added a repository-wide regression; 128 tests and Gitleaks pass.
2026-07-30 | Reused the existing Bitwarden Agent Runtime resources, aligned Vercel through the stdin-only broker, normalized weak Blob ETags, deployed production, and completed two brokered sync passes publishing 160 unresolved cards; 132 tests and full Git-history Gitleaks pass.
2026-07-30 | Reconciled shared-harness provenance and the generated 11-name secret manifest, installed the canonical portable pre-commit hook with a recoverable backup, projected 22 declared portable skills including the current feedback-to-correct alias, passed the 132-test and live two-writer Blob verification chains, and repeated the brokered 160-card sync without exposing credentials.
2026-07-30 | Merged Docket PR #4 as `6e51591` after both GitHub scans passed and reconciled task state for the verified master release.
2026-07-30 | Reconciled Docket with merged harness `25d04b5` and proved project provenance plus the 11-name generated secret manifest from a separate clean Windows Git checkout | detached checkout at `734846d`
2026-07-29 | Live export at `cloud-export-20260729-blob-hardening` verified checksums, schema, and record counts across all four authoritative documents; confirmed source versions unchanged across two reads with atomic publish-from-a-verified-temporary-sibling and no partial target on failure.
2026-07-29 | A read-only live `Snapshot -RetentionDryRun` produced and verified `docket-cloud-exports/2026-07-29T20-54-41-982Z` with record counts 580/25/1/12 and no pruning candidates; that export passed a mutation-free dry run and a full restore into `runtime/restore-verification-20260729-blob-hardening`.
2026-07-29 | The cloud-style 390-by-844 phone proof rejected a wrong bearer, accepted the correct bearer, and persisted a submitted decision without loopback trust.
2026-07-30 | Production deployment `dpl_G4gdFWcZF9K4L67DUEgWp3q2zWAM` went live, aliased to `https://vault-review-mobile.vercel.app`.
2026-08-06 | Folded `STATUS.md` into `MAP.md`'s `## State` section and this log per the 2026-08-06 decision to stop maintaining a separate durable-state file.
