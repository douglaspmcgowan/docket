# Task

## Goal

Harden the selected private Vercel Blob Docket authority, prove complete recovery, and publish the reviewed branch without changing production records.

## Active

- [?] Await root review of the recovery follow-up.

## Queue

- [x] Prove and implement stable four-document export with atomic publication.
- [x] Add verified snapshot retention with 3 daily, 4 weekly, and 3 monthly buckets.
- [x] Update recovery documentation and rerun the full verification chain.
- [x] Commit and push the follow-up for root review.

## Blocked

<!-- No technical blocker. -->

## Needs decision

- [?] Douglas may later replace the selected Vercel Blob authority; the current implementation and design record keep that choice reversible.
- [?] The Docket bearer still needs the approved Bitwarden/Vercel value setup if the existing deployment value is unavailable to the phone.

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

## Verification

- Setup: `npm.cmd ci`
- Unit/integration: `npm.cmd test`
- Data adapters: run `.agents\data\Manage-DocketBlob.test.ps1` and `.agents\data\Sync-ProjectData.test.ps1`.
- Live concurrency: `vercel.cmd env run -- node scripts\verify-blob-concurrency.js`
- Syntax: check `enqueue.js`, `local-server.js`, `sync-cloud.js`, and both scripts under `scripts\`.
- Browser: start `local-server.js` with a disposable store and exercise the phone viewport.
- Secret scan: `C:\Users\dougl\Tools\gitleaks\gitleaks.exe git --redact --no-banner`
- Project state: run the current shared-harness `Test-AgentProjectState.ps1`.
- Next: root reviews `e089475` and decides whether to merge the branch.
