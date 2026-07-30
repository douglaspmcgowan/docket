# vault-review-mobile

Docket is a phone-accessible review, brief, and decision queue hosted on Vercel. Four private
Vercel Blob documents are the network authority. Every mutation uses ETag compare-and-swap, so
concurrent clients retry instead of silently overwriting one another. A local SQLite mirror remains
available for compatibility and recovery work.

## Live system

- Cloud board: <https://vault-review-mobile.vercel.app>
- Local mirror: <http://127.0.0.1:8471>
- Cloud storage: private Vercel Blob
- Cloud authentication: one bearer value, named `REVIEW_SECRET` locally and `APP_SECRET` in Vercel
- Local credential authority: Bitwarden Secrets Manager through the shared exact-command broker

The local mirror binds only to loopback and uses an in-process trust marker that network headers
cannot spoof. The public deployment requires bearer authentication on every API request and fails
closed when `APP_SECRET` is unavailable.

## Quickstart

Run these commands in PowerShell from this repository:

```powershell
npm.cmd ci
npm.cmd run browser:install
node local-server.js
```

Run the offline verification suite in a second PowerShell window:

```powershell
node enqueue.js --selftest
node sync-cloud.js --selftest
npm.cmd test
```

Cloud publication uses the Bitwarden broker workflow documented below. Keep credential values out
of this repository, command arguments, shell history, logs, and documentation.

```text
Agent or local mirror -> authenticated API -> private Vercel Blob authority -> phone UI
Agent or local mirror <- validated outcomes <- private Vercel Blob authority <- phone UI
```

## Card grouping (Project -> Set -> Card)

The board organizes cards into two tiers above the card, both derived client-side:

- **Set** is the part of a card's `source` after the first colon.
- **Project** is the part before the first colon.

For example, `source: "sift: interface detection"` produces project **sift** and set
**interface detection**. A colon-free source is a single-set project whose cards render directly
under it. A card may carry explicit `project` or `set` fields, which override source derivation.
Empty sets and projects hide automatically and reappear when matching cards return.

## Files

- `api/items.js` - GET pending items
- `api/submit.js` - POST a decision
- `api/sync.js` - authenticated card push, decision pull, groups, reads, and tickets
- `api/_auth.js` - bearer gate using Vercel `APP_SECRET`
- `api/_store.js` - private Vercel Blob or local SQLite adapter
- `api/_document-store.js` - compare-and-swap mutation engine and provider adapters
- `api/_schema.js` - authoritative document and card validation
- `api/_transfer.js` - stable complete export, atomic publication, checksum verification, and disposable restore
- `api/_retention.js` - verified UTC daily, ISO-weekly, and monthly snapshot retention
- `public/index.html` - mobile interface and bearer prompt
- `scripts/docket-data.js` - inspect, export, verify, and safe restore CLI
- `.agents/data/Manage-DocketBlob.ps1` - reviewed project-data adapter declared by `data-manifest.yaml`
- `enqueue.js` - publish, list, archive, group, and pull individual cards
- `sync-cloud.js` - current local-store-to-cloud synchronization
- `docket-daemon.js` - local-server supervisor and brokered `docket-sync` scheduler
- `sync.js` - older `~\.claude\reviewer` directory adapter

## Credential model

| Name | Why it exists | Who creates it | Where it lives |
|---|---|---|---|
| `REVIEW_SECRET` | Authenticates local publishers, synchronizers, and the phone UI to the public Docket API. | The existing Bitwarden `Agents` organization owns the `REVIEW_SECRET` resource in `Agent Runtime`. | Bitwarden Secrets Manager; injected only into allowlisted Docket child processes. |
| `APP_SECRET` | Gives the Vercel API the expected bearer value for request comparison. | The approved broker streams the existing `REVIEW_SECRET` value to Vercel through standard input. | Vercel project environment variable, scoped to Production and marked Sensitive. Preview receives the same value only when preview deployments need access. |
| `BLOB_READ_WRITE_TOKEN` | Authenticates legacy token-based reads and writes to the private Blob store. | Vercel generates it when a token-based store is created or connected. | Vercel project environment. |
| `REVIEW_URL` | Identifies the cloud API base URL. | Vercel assigns the deployment URL. | Public configuration; defaults to `https://vault-review-mobile.vercel.app` in current clients. |

`REVIEW_SECRET` and `APP_SECRET` are two environment-variable names for one bearer value.
`BLOB_READ_WRITE_TOKEN` belongs exclusively to storage and never substitutes for the bearer.
Keep `REVIEW_SECRET` confidential because the public API accepts authenticated card mutations and
decision reads. `APP_SECRET` is the server-side copy used to verify that same bearer on each request.

New Vercel Blob project connections default to OIDC. Existing token-based connections continue to
use `BLOB_READ_WRITE_TOKEN` until they are explicitly upgraded. OIDC provides short-lived deployment
credentials automatically and may produce no long-lived token. The installed `@vercel/blob` package
supports OIDC. See Vercel's
[OIDC migration announcement](https://vercel.com/changelog/vercel-blob-now-supports-oidc-authentication).

## Bitwarden Secrets Manager setup

1. Reuse the `Agents` organization, `Agent Runtime` project, and `REVIEW_SECRET` resource. Verify their value-free IDs before any creation action.
2. Grant a per-computer, read-only machine account access to `Agent Runtime`.
3. Store the machine-account token in Windows Credential Manager:

   ```powershell
   & "C:\Users\dougl\.agents\tools\Set-BwsMachineToken.ps1"
   ```

   The command prompts through `SecureString`; keep the token out of command arguments and output.
4. Keep the value-safe `projectId` and `resourceId` locators in the shared harness `bws-command-allowlist.json`.
5. Transfer the approved bearer to Vercel through the registered stdin-only command:

   ```powershell
   & "C:\Users\dougl\.agents\tools\Invoke-WithBitwardenSecret.ps1" -CommandId "docket-align-vercel-secret"
   ```

6. Redeploy the current production artifact so the new deployment receives the aligned environment.

Every active JavaScript client receives `REVIEW_SECRET` through its environment. Runtime code has no
plaintext passcode-file reader. The ignored legacy `.passcode.txt` name remains solely to prevent an
old local copy from entering Git while Douglas removes it.

## Vercel setup

### Dashboard

1. Open the Vercel dashboard, select the team, and open the project serving
   `vault-review-mobile.vercel.app`.
2. Open **Settings -> Environment Variables**.
3. Add `APP_SECRET`.
4. Enter the Docket bearer through the protected Vercel prompt.
5. Select **Production**, mark the variable **Sensitive**, and save it. Add Preview only when
   preview deployments need access.
6. Redeploy the project. Environment-variable changes apply to new deployments.
7. Open **Storage -> Create Database -> Blob**, select **Private**, and create or connect the
   Docket store. Select Production for the project connection.
8. Confirm the store connection uses OIDC or has added `BLOB_READ_WRITE_TOKEN` to the project.

### CLI equivalent

Install the current Vercel CLI when `vercel` is unavailable, then run:

```powershell
vercel login
vercel link
vercel env add APP_SECRET production --sensitive
vercel blob create-store vault-review --access private
vercel --prod
vercel env ls production
```

`vercel env add` prompts for the bearer value. The Blob command
prompts to connect the store to the linked project and configures its storage authentication.
`vercel env ls production` verifies variable names and scopes without printing their values.

## Exact-command Bitwarden Secrets Manager broker

The active broker is:

`C:\Users\dougl\.agents\tools\Invoke-WithBitwardenSecret.ps1`

Its value-free policy is:

`C:\Users\dougl\.agents\tools\bws-command-allowlist.json`

Each approval binds:

1. command ID
2. Secrets Manager project and secret IDs
3. child environment-variable name
4. resolved executable path and working directory
5. complete ordered argument list and inherited-environment allowlist

The broker retrieves the allowlisted secret with the machine account, injects it into the approved
child, strips unrelated inherited variables, and scrubs its temporary environment afterward.

The harness ships the value-safe schema-version-3 `docket-sync` record. Its security-relevant shape is:

```json
{
  "schemaVersion": 3,
  "commands": [
    {
      "commandId": "docket-sync",
      "purpose": "Publish unresolved personal Docket cards and pull decisions.",
      "executable": "C:\\Program Files\\nodejs\\node.exe",
      "argumentList": [
        "C:\\Users\\dougl\\projects\\docket\\sync-cloud.js"
      ],
      "workingDirectory": "C:\\Users\\dougl\\projects\\docket",
      "inheritedEnvironment": [],
      "projectId": "<non-secret-project-id>",
      "secretBindings": [
        {
          "resourceId": "<value-free-resource-id>",
          "environmentVariable": "REVIEW_SECRET"
        }
      ]
    }
  ]
}
```

Every separately approved `enqueue.js` argument sequence needs its own command record.
The `_sync_once.cmd` and `sync-review.cmd` legacy reviewer wrappers stop with exit code 2 and print
the approved `docket-sync` broker command. That command is intentionally bound to `sync-cloud.js`;
legacy `sync.js` needs its own reviewed command record before direct execution.

## Publish and verify

Run the approved command by ID:

```powershell
& "C:\Users\dougl\.agents\tools\Invoke-WithBitwardenSecret.ps1" -CommandId "docket-sync"
```

`sync-cloud.js` publishes every valid unresolved local card, pulls decisions only for known local
cards, and accepts a cloud decision only when its answer timestamp is newer. A successful run prints:

```text
sync: pushed <count> card(s), refused <count> unsafe/invalid card(s), pulled <count> decision(s), refused <count> invalid/unknown decision(s)
```

Verify publication at three levels:

1. Confirm the broker command exits successfully and reports the expected pushed count.
2. Through a separately approved exact `enqueue.js --list "<project>"` tuple, confirm the expected
   stable card IDs appear on the cloud board.
3. Open <https://vault-review-mobile.vercel.app>, enter the Docket bearer, decide one
   test card, rerun the brokered sync, and confirm the matching known card ID is pulled locally.

A single-card `enqueue.js` publish succeeds only after the API acknowledges the request and prints
the content-derived card ID. Archive verification requires `enqueue.js --archive <id>` to receive a
matching archived result and answer timestamp.

## Network authority, export, and recovery

The linked private Vercel Blob store contains exactly:

- `items.json`
- `results.json`
- `tickets.json`
- `reads.json`

`data-manifest.yaml` declares this store as the live document/object authority and names the
project-owned adapter. Export reads all four documents and source versions, reads them again, and
retries when any version changed during assembly. It writes into a temporary sibling, verifies the
complete schema, exact plain-file inventory of four documents plus the manifest, record counts, and SHA-256 checksums, then atomically publishes the
finished directory. A failed or unstable capture leaves no partial target directory.

Agents run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\.agents\data\Manage-DocketBlob.ps1 -Action Inspect -Source Cloud
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\.agents\data\Manage-DocketBlob.ps1 -Action Export -Source Cloud -ExportPath "$env:PROJECT_DATA_ROOT\docket\private\docket-cloud-exports\<new-export-folder>"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\.agents\data\Manage-DocketBlob.ps1 -Action Snapshot -Source Cloud
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\.agents\data\Manage-DocketBlob.ps1 -Action Verify -ExportPath "$env:PROJECT_DATA_ROOT\docket\private\docket-cloud-exports\<export-folder>"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\.agents\data\Manage-DocketBlob.ps1 -Action Restore -ExportPath "$env:PROJECT_DATA_ROOT\docket\private\docket-cloud-exports\<export-folder>" -RestoreTarget "$env:PROJECT_DATA_ROOT\docket\runtime\<new-target>"
```

`Snapshot` creates a timestamped verified export under
`%PROJECT_DATA_ROOT%\docket\private\docket-cloud-exports`. It keeps the union of the newest point in
3 distinct UTC days, 4 distinct ISO weeks, and 3 distinct UTC months, while always preserving the
newest verified point. The adapter reads these defaults from the `docket-cloud-authority` asset in
`data-manifest.yaml`. Explicit `-Daily`, `-Weekly`, and `-Monthly` values override the corresponding
manifest fields individually. Each count accepts any nonnegative integer; setting all three to zero
still preserves the newest verified snapshot. Add
`-RetentionDryRun` to create and verify the new snapshot while reporting older verified directories
that would be pruned. Unknown, invalid, linked, reparse-point, or out-of-root entries are preserved
or rejected before deletion. Retention deletes only the five verified plain files and their now-empty
snapshot directory; it never recursively removes an invalid snapshot.

The reviewed nightly agent invocation is:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\dougl\projects\docket\.agents\data\Manage-DocketBlob.ps1" -Action Snapshot -Source Cloud -Daily 3 -Weekly 4 -Monthly 3
```

The harness can call that command after this branch is merged. This branch does not install another
global schedule.

The final command is a mutation-free dry run. Adding `-Disposable` writes only to a physically empty
local target with no files, directories, or links and verifies every restored document. Cloud restore is disabled in the adapter, which
prevents an export test from overwriting live data.

The adapter uses the existing linked Vercel user session and `vercel env run`. Storage credentials
stay inside the child process and never appear in command arguments or output.

## Local SQLite compatibility mirror

When `LOCAL_STORE_DIR` is set, Docket stores the same four documents in `docket.sqlite3`. The local
adapter uses a guarded SQLite transaction and writes current JSON exports plus the immediately
previous export. Existing JSON-only local stores migrate lazily on first read.

The older `.agents\data\Sync-ProjectData.ps1` remains available for transactionally consistent
SQLite snapshots. It is a compatibility recovery path; the network authority named in
`data-manifest.yaml` reconstructs a new computer directly.

This command imports a validated card outbox into the local compatibility mirror while preserving unrelated
items:

```powershell
node import-outbox.js --outbox "<folder>" --store "<folder>"
```

The default paths target the shared Skills Docket outbox and `~\.docket-local`.

## On the phone

Open <https://vault-review-mobile.vercel.app>, enter the Docket bearer once,
and triage cards. The browser stores the bearer locally. Completed cards leave the active board,
and the next brokered sync applies valid newer decisions to the local store.

Repository documentation opens on a phone through GitHub web links. Windows paths such as
`C:\Users\...` open only on a Windows computer. Recovery exports live outside Git and need a cloud
provider link when they must be viewed or downloaded from a phone.
