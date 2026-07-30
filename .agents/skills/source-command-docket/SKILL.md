---
name: source-command-docket
description: Route a brief, review, or decision to Douglas's existing personal Docket and preserve any blocking answer in TASK.md. Use when Douglas asks to docket, queue for review, send to his phone, or collect a decision.
---

# Docket

Use the existing Docket repository and client. Search the current repository, `~/projects/docket`, and `~/.agents/MAP.md` before choosing a path. Do not create another queue, publisher, or card schema.

## Current contract

- Personal cards publish to the authenticated cloud board by default.
- Existing `sensitive` metadata is historical and does not filter personal publication.
- `REVIEW_URL` is the non-secret endpoint.
- Bitwarden Secrets Manager resource ID `6006ee63-f495-497f-a4c9-b496017e7266` is the existing `REVIEW_SECRET` resource in the `Agent Runtime` project. The allowlist binds that value-safe resource ID to child environment variable `REVIEW_SECRET`.
- Vercel receives the same bearer value under `APP_SECRET`.
- `BLOB_READ_WRITE_TOKEN` is a separate provider-managed storage credential.
- The full-tuple broker injects `REVIEW_SECRET` only into an approved Docket command. Never read, print, log, or place the value in arguments.
- Reuse the existing Bitwarden `Agents` organization, `Agent Runtime` project, `REVIEW_SECRET`, and available machine account. Discover and verify these value-free identities before any creation action.
- The registered `docket-sync` command runs `sync-cloud.js`. The registered `docket-align-vercel-secret` command runs `scripts\align-vercel-app-secret.js`.

Run the alignment command only when setting up or repairing the Vercel production bearer:

```powershell
& "$env:USERPROFILE\.agents\tools\Invoke-WithBitwardenSecret.ps1" -CommandId "docket-align-vercel-secret"
```

## Procedure

1. **Find the existing client and local store.** Use `$env:USERPROFILE\projects\docket`, `$env:USERPROFILE\.docket-local`, and the existing Docket map. Report a missing repository or store.
2. **Reuse existing groups and cards.** Inspect the local board or current local exports before naming another project, set, or stable card ID. Direct `enqueue.js` cloud operations require their own separately approved exact broker tuple.
3. **Choose one kind.**
   - `brief`: information Douglas should read and retain.
   - `review`: one independently judgeable artifact.
   - `decision`: a real fork with consequences.
4. **Make the card self-contained.** Include the recommendation, the reason, the consequences of each option when relevant, the project/set, and a stable content-derived ID for repeatable updates.
5. **Write value-safe JSON to the existing Docket outbox.** Keep credentials and unrelated private data out of the body.
6. **Import the outbox into the local Docket store.**

   ```powershell
   node "$env:USERPROFILE\projects\docket\import-outbox.js" --outbox "<outbox-folder>" --store "$env:USERPROFILE\.docket-local"
   ```

7. **Publish cards and receive decisions through the registered full-tuple broker.**

   ```powershell
   & "$env:USERPROFILE\.agents\tools\Invoke-WithBitwardenSecret.ps1" -CommandId "docket-sync"
   ```

   This tuple pins the exact Node executable, `sync-cloud.js`, working directory, environment allowlist, Bitwarden project ID, resource ID, and destination variable.
8. **Verify the stable card ID locally and the brokered sync result.** A publication claim requires successful broker output with the expected pushed/refused counts. Preserve failed outbox records and report their IDs.
9. **Record blocking decisions.** Add `[?] docket <id> — <title>` under `TASK.md` → `Needs decision`. Include the Docket location and the next brokered sync command. Non-blocking reading does not enter the task ledger.
10. **Accept pulled decisions conservatively.** `sync-cloud.js` accepts a decision only for a known local card and only when its answer timestamp is newer than the local result.

## Batch discipline

- Use one card per independently decidable issue.
- Merge near-duplicate judgments.
- Update a living card under its stable ID.
- Delegate large card assembly only when source files and ownership are disjoint.
- Report succeeded and failed IDs separately.

## Verification

Before completion:

```powershell
node "$env:USERPROFILE\projects\docket\enqueue.js" --selftest
node "$env:USERPROFILE\projects\docket\sync-cloud.js" --selftest
```

Run the repository test suite when code or sync policy changed. A missing credential, machine-account project assignment, broker tuple, endpoint, or client is a named external gate and remains in `TASK.md`.
