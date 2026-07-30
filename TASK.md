# Task

## Goal

Keep the selected private Vercel Blob Docket authority recoverable, broker-authenticated, concurrency-safe, and synchronized with the local Docket store.

## Active

<!-- No active Docket implementation task. -->

## Queue

- [x] Prove and implement stable four-document export with atomic publication.
- [x] Add verified snapshot retention with 3 daily, 4 weekly, and 3 monthly buckets.
- [x] Update recovery documentation and rerun the full verification chain.
- [x] Commit and push the follow-up for root review.
- [x] Prove manifest defaults, explicit overrides, unrestricted nonnegative counts, and safe zero-tier retention.
- [x] Run final verification and push the integration fix.
- [x] Require exact plain-file export inventory and make invalid snapshots retention-safe.
- [x] Reject CUI/NASA markers and conservatively filter sensitive cards at publisher and server boundaries.
  - [x] Repository search found separate guards in `api\sync.js`, `sync-cloud.js`, and `enqueue.js`; added `api\_content-guard.js` as their single shared marker policy owner.
- [x] Require a physically empty disposable restore target.
- [x] Remove `.passcode.txt` credential fallback and align docs/manifests with brokered `REVIEW_SECRET`.
- [x] Add a cloud-style phone bearer login and persistence proof without the local-request bypass.
- [x] Run full verification and adversarial review.
- [x] Commit the branch for root review.
- [x] Push blocker-fix commit `a6fc3fa` to the review branch.
- [x] Add a repository-wide regression that rejects plaintext `.passcode.txt` references in runtime code.
- [x] Require broker-injected `REVIEW_SECRET` in every active JavaScript client.
- [x] Disable legacy passcode-reading wrappers with exact BWS broker guidance.
- [x] Update migration documentation and durable task state.
- [x] Run the full verification chain, commit, and push the follow-up.
- [x] Reuse the existing Bitwarden `Agents` organization, `Agent Runtime` project, `docket.REVIEW_SECRET`, and machine account without creating duplicates.
- [x] Align Vercel `APP_SECRET` through the allowlisted stdin-only broker command and redeploy production.
- [x] Normalize Vercel Blob weak ETags before conditional writes and verify the live concurrency path.
- [x] Publish 160 unresolved local cards through the broker and verify a second repeatable sync; no newer known cloud decision required a local merge.

## Blocked

<!-- No technical blocker. -->

## Needs decision

- [?] Douglas may later replace the selected Vercel Blob authority; the current implementation and design record keep that choice reversible.
- [!] The shared project-state verifier reports the repository's inherited missing `VERIFY.md`; this Docket branch did not create a new project verification contract.

## Completed

- [x] Added schema validation at ingest, read, write, export, and restore boundaries.
- [x] Added ETag compare-and-swap with bounded conflict retries for all four Blob aggregates.
- [x] Replaced API read-modify-write handlers with atomic mutations.
- [x] Created a complete live export of all four authoritative documents and verified its checksums, schema, and record counts.
- [x] Proved a mutation-free dry run and a complete restore into an empty disposable target.
- [x] Observed a live Blob ETag conflict and verified both concurrent writers survived.
- [x] Replaced the legacy data manifest with the authority-oriented v2 contract and project-owned adapter.
- [x] Added a permanent Playwright phone-viewport flow covering login, card selection, decision submission, and overflow.
- [x] Made card-outbox import atomic so simultaneous imports preserve both batches.
- [x] Consolidated Docket task state into `TASK.md` and reduced the Codex adapter to current project pointers.
- [x] Passed 109 Node/browser tests, both data-adapter tests, syntax/self-tests, v3 project verification, and the isolated live Blob conflict check.
- [x] Committed and pushed the verified implementation as `926aba0`.
- [x] Passed 115 Node/browser tests, the expanded Blob adapter test, v2 manifest validation, and a read-only live cloud snapshot with retention pruning held in dry-run mode.
- [x] Pushed the recovery follow-up as `e089475`.
- [x] Passed 116 Node/browser tests and adapter regressions for manifest defaults, explicit values above 100, explicit zero values, and newest-point preservation.
- [x] Pushed the manifest-retention integration fix as `5c0a788`.

## Verification

- Setup: `npm.cmd ci`
- Unit/integration: `npm.cmd test`
- Data adapters: run `.agents\data\Manage-DocketBlob.test.ps1` and `.agents\data\Sync-ProjectData.test.ps1`.
- Live concurrency: `vercel.cmd env run -- node scripts\verify-blob-concurrency.js`
- Syntax: check `enqueue.js`, `local-server.js`, `sync-cloud.js`, and both scripts under `scripts\`.
- Browser: start `local-server.js` with a disposable store and exercise the phone viewport.
- Secret scan: `C:\Users\dougl\Tools\gitleaks\gitleaks.exe git --redact --no-banner`
- Project state: run the current shared-harness `Test-AgentProjectState.ps1`.
- Next: push the verified master commit and confirm its GitHub checks.
