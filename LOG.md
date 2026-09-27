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
2026-09-27 | App-repair stage 2, non-visual only: the 153-test suite is green for the first time (`test/legacy-sync-wrappers.test.js` spawned `cmd.exe /d /c <bare filename>` and this host sets `NoDefaultCurrentDirectoryInExePath`, so cmd returned 1 instead of the wrapper's `exit /b 2`; it now spawns an absolute path), CI runs that suite and a typecheck rather than gitleaks alone, every dependency specifier is exact, the styling is fully tokenised at its current values, Sora is self-hosted, and `tsc --noEmit` passes over the CommonJS sources with no file renamed.
2026-09-27 | Sora moved from three `fonts.googleapis.com` `<link>`s to eight `@fontsource/sora` 5.3.0 woff2 subsets in `public/fonts/` (~100 KB, same per-subset `unicode-range` Google served). This was a false claim as much as a performance one: `local-server.js` says "nothing here ever leaves the machine" and the README repeats it, while the page fetched a stylesheet from a third party on every load and fell back to a different face offline. Proof of no visual change: with read state held constant, the Google-hosted and self-hosted pages are byte-identical across 211 elements x 47 computed properties plus every bounding rect, in both themes.
2026-09-27 | TypeScript, as far as it goes honestly: no file was renamed to `.ts` because the 62 CommonJS entry points are spawned by name from the `.cmd` wrappers, `docket.ps1`, `docket-daemon.vbs`, the README commands, Vercel's `api/*.js` convention and the test suite. Instead `tsconfig.json` turns on `checkJs` plus seven strict flags at ZERO errors, wired as `npm run typecheck` and as the first CI job step. Four real fixes got it there: Date subtraction in `api/_retention.js` is now `getTime()`, `consolidate-projects.js` reads the gitignored `_cloud_items.json` with `fs.readFileSync` instead of `require`ing a file that need not exist, and two type-only JSDoc annotations cover `api/sync.js`'s function-with-helpers export and `enqueue.js`'s progressively-widened `card`. Full `strict: true` is 502 errors away and is NOT claimed: `noImplicitAny` 297, `strictNullChecks` about 20, `useUnknownInCatchVariables` 15 (all `e.message` in a catch, four of which gate a `throw error` rethrow on a regex over that message, so each needs a per-site behaviour decision rather than a blanket cast).
2026-09-27 | The CONVERGE verdict in `APP-REPAIR-SPEC.md` is wrong for this app and was not executed. Docket has an EMPTY framework slot: no bundler, no build script, one 1366-line `public/index.html` served verbatim, a `node:http` mirror that reuses the four Vercel handlers unmodified, and `node:sqlite` locally. There is nothing to move to Next.js App Router -- the work would be writing the app again in React, and the program's own proof that a move was a move (the suite passing unchanged) is unavailable because a test byte-compares `GET /` against `public/index.html`. The same specification also calls the suite "30 Playwright specs"; all 30 are `node:test` files and exactly one drives chromium from inside `node --test`. Neither correction was written into that file, which lives in a concurrent lane's active worktree.

Floor, before (master @ 37d00fd) and after, measured by the same regex scan over `public/index.html` + `public/mdtable.js` + `public/search.js`:

```
column                      before    after
node --test                 152/153, exit 1   155/155, exit 0
tsc --noEmit                (no config)       exit 0
floating dep specifiers     2                 0
third-party requests        3 (Google Fonts)  0
custom properties defined   22                77
custom property uses        248               383
colour literals, total      75                71
colour literals outside a token block  many   0 hex, 0 rgb/hsl, 0 oklch
font sizes distinct         22 (1 tokenised)  22 (22 tokenised)
border radii distinct       12 (0 tokenised)  12 (12 tokenised)
z-index distinct            7  (0 tokenised)  7  (7 tokenised)
:focus-visible              8                 23
bare :focus                 0                 0
transitions                 10                18
prefers-color-scheme: dark  3                 3
prefers-reduced-motion      3                 3
@media                      12                12
@keyframes                  2                 2
!important                  2                 2
impeccable slop rules hit   0 of 32           0 of 32
```

The two `!important`s stay. Both are `*{transition:none!important;animation:none!important}` inside the `prefers-reduced-motion: reduce` block, which is the one legitimate use; the program's blanket "remove every `!important`" would break a floor here rather than raise one. No column is worse.
