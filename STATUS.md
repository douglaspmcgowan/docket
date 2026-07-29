# Status

- Git authority is `https://github.com/douglaspmcgowan/docket`; the selected storage work is on `codex/docket-blob-hardening` from baseline `f3688602c02a7f0c96b70427f7d78d68cf43f4e1`.
- The linked private Vercel Blob store is the current network authority for `items.json`, `results.json`, `tickets.json`, and `reads.json`.
- Every API mutation uses compare-and-swap. The live isolated verifier observed an ETag conflict retry and preserved both concurrent writers, including Vercel's untyped conflicting-operation response.
- Reads, writes, ingest, export, and restore validate the committed document schema. Invalid JSON and malformed records fail visibly.
- A complete live export was created at `C:\Users\dougl\Data\Projects\docket\private\cloud-export-20260729-blob-hardening`; all four documents passed checksums, schema validation, and record-count verification.
- New exports confirm that every source version stayed unchanged across two complete reads, publish from a verified temporary sibling, and leave no partial target on failure.
- The `Snapshot` adapter retains the union of 3 UTC daily, 4 ISO-weekly, and 3 monthly verified points under `%PROJECT_DATA_ROOT%\docket\private\docket-cloud-exports`; parameters can override each tier.
- A read-only live `Snapshot -RetentionDryRun` produced and verified `C:\Users\dougl\Data\Projects\docket\private\docket-cloud-exports\2026-07-29T20-54-41-982Z` with record counts 580/25/1/12 and no pruning candidates.
- That export passed a mutation-free dry run and a full restore into `C:\Users\dougl\Data\Projects\docket\runtime\restore-verification-20260729-blob-hardening`.
- Production restore remains intentionally disabled in the adapter. Recovery proof uses an empty disposable target and cannot overwrite live data.
- The local SQLite server remains a compatibility mirror and recovery cache with guarded transactions and readable JSON exports.
- Credential values remain outside Git and agent output. Existing Vercel user authentication injects the Blob variable directly into the child verifier.
- The complete Node, adapter, and phone-browser verification chain passes; the Node suite contains 115 tests.
