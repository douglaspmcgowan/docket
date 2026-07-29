# vault-review-mobile

Docket is a phone-accessible review, brief, and decision queue hosted on Vercel and backed by a
private Vercel Blob store. The local SQLite store remains the personal authority. Authenticated
sync publishes unresolved cards and pulls newer decisions back to the computer.

## Live system

- Cloud board: <https://vault-review-mobile.vercel.app>
- Local mirror: <http://127.0.0.1:8471>
- Cloud storage: private Vercel Blob
- Cloud authentication: one bearer value, named `REVIEW_SECRET` locally and `APP_SECRET` in Vercel
- Local credential authority: Bitwarden Password Manager

The local mirror binds only to loopback and uses an in-process trust marker that network headers
cannot spoof. The public deployment requires bearer authentication on every API request and fails
closed when `APP_SECRET` is unavailable.

## Quickstart

Run these commands in PowerShell from this repository:

```powershell
npm.cmd ci
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
Local SQLite store -> authenticated push -> private Vercel Blob -> phone UI
Local SQLite store <- validated decisions <- private Vercel Blob <- phone UI
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
- `api/_store.js` - private Vercel Blob storage or local SQLite storage
- `public/index.html` - mobile interface and bearer prompt
- `enqueue.js` - publish, list, archive, group, and pull individual cards
- `sync-cloud.js` - current local-store-to-cloud synchronization
- `sync.js` - older `~\.claude\reviewer` directory adapter

## Credential model

| Name | Why it exists | Who creates it | Where it lives |
|---|---|---|---|
| `REVIEW_SECRET` | Authenticates local publishers, synchronizers, and the phone UI to the public Docket API. | Douglas generates one long random value with Bitwarden's generator. | Hidden field `REVIEW_SECRET` in Bitwarden Login item `project:docket:production`; injected only into an approved child process. |
| `APP_SECRET` | Gives the Vercel API the expected bearer value for request comparison. | Douglas copies the exact `REVIEW_SECRET` value into Vercel. | Vercel project environment variable, scoped to Production and marked Sensitive. Preview receives the same value only when preview deployments need authenticated access. |
| `BLOB_READ_WRITE_TOKEN` | Authenticates legacy token-based reads and writes to the private Blob store. | Vercel generates it when a token-based store is created or connected. | Vercel project environment. Store a recovery copy in the Bitwarden Hidden field only when Vercel actually provides a long-lived token. |
| `REVIEW_URL` | Identifies the cloud API base URL. | Vercel assigns the deployment URL. | Public configuration; defaults to `https://vault-review-mobile.vercel.app` in current clients. |

`REVIEW_SECRET` and `APP_SECRET` are two environment-variable names for one bearer value.
`BLOB_READ_WRITE_TOKEN` belongs exclusively to storage and never substitutes for the bearer.
Keep `REVIEW_SECRET` confidential because the public API accepts authenticated card mutations and
decision reads. `APP_SECRET` is the server-side copy used to verify that same bearer on each request.

New Vercel Blob project connections default to OIDC. Existing token-based connections continue to
use `BLOB_READ_WRITE_TOKEN` until they are explicitly upgraded. OIDC provides short-lived deployment
credentials automatically and may produce no long-lived token. The installed `@vercel/blob` package
supports OIDC. Leave the Bitwarden Blob field empty for an OIDC connection. See Vercel's
[OIDC migration announcement](https://vercel.com/changelog/vercel-blob-now-supports-oidc-authentication).

## Bitwarden setup

1. In an interactive Windows PowerShell, run:

   ```powershell
   & "C:\Users\dougl\.agents\capsule\Run-BitwardenScaffoldInteractive.ps1"
   ```

   Complete the Bitwarden login, master-password, and device-verification prompts in that window.
   The wrapper creates value-free Login scaffolds, removes its temporary `BW_SESSION`, and locks the
   CLI when creation finishes.

2. Open Bitwarden, search for the Login item `project:docket:production`, and edit it.

3. Under **Custom fields**, confirm these Hidden fields:

   - `REVIEW_SECRET`
   - `BLOB_READ_WRITE_TOKEN`

4. Use Bitwarden's generator to create a long random `REVIEW_SECRET`, place it in the Hidden field,
   and save the item.

5. Fill `BLOB_READ_WRITE_TOKEN` only when the connected Vercel store exposes a long-lived token.
   OIDC-backed stores require no stored Blob token.

After a successful scaffold run, the value-free receipt is created at
`C:\Users\dougl\.agents\tools\.local\bitwarden-scaffold-ids.json`. It records item names and
non-secret item IDs used by the broker policy.

After the Bitwarden `REVIEW_SECRET` field is filled and the same value is verified in Vercel
`APP_SECRET`, remove any existing `C:\Users\dougl\projects\docket\.passcode.txt`. That file is a
deprecated code fallback. The supported workflow keeps the value in Bitwarden and uses brokered
environment injection.

## Vercel setup

### Dashboard

1. Open the Vercel dashboard, select the team, and open the project serving
   `vault-review-mobile.vercel.app`.
2. Open **Settings -> Environment Variables**.
3. Add `APP_SECRET`.
4. Paste the exact value copied from Bitwarden `REVIEW_SECRET`.
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

`vercel env add` prompts for the bearer value; paste it directly from Bitwarden. The Blob command
prompts to connect the store to the linked project and configures its storage authentication.
`vercel env ls production` verifies variable names and scopes without printing their values.

## Full-tuple Bitwarden broker

The active broker is:

`C:\Users\dougl\.agents\tools\Invoke-WithBitwardenItem.ps1`

Its value-free policy is:

`C:\Users\dougl\.agents\tools\credential-command-policy.json`

Each approval matches all of these fields:

1. Bitwarden item ID
2. Hidden field name
3. child environment-variable name
4. resolved executable path
5. complete ordered argument list

Matching the full tuple prevents a permitted field from reaching another executable, script, or
argument sequence. The broker retrieves one field, injects it into the approved child, removes
`BW_SESSION` from the child, runs the command, and restores the parent process state afterward.

Publication remains gated until the policy contains an exact command record. The current policy
uses schema version 2 and a `commands` array. Add the bulk-sync record to that array after the
Bitwarden item exists; preserve any other approved records. Replace `<bitwarden-item-id>` with the
non-secret ID from the scaffold receipt:

```json
{
  "schemaVersion": 2,
  "commands": [
    {
      "purpose": "Publish unresolved personal Docket cards and pull decisions.",
      "item": "<bitwarden-item-id>",
      "field": "REVIEW_SECRET",
      "environmentVariable": "REVIEW_SECRET",
      "executable": "C:\\Program Files\\nodejs\\node.exe",
      "argumentList": [
        "C:\\Users\\dougl\\projects\\docket\\sync-cloud.js"
      ]
    }
  ]
}
```

Every different `enqueue.js` argument sequence needs its own exact policy record. This includes
read-only `--groups` and `--list` commands.

## Publish and verify

Unlock the Bitwarden CLI in the same interactive PowerShell process, capture the session without
printing it, run the approved broker tuple, and clear the session afterward:

```powershell
$env:BW_SESSION = (& bw.cmd unlock --raw)
try {
    & "C:\Users\dougl\.agents\tools\Invoke-WithBitwardenItem.ps1" `
        -Item "<bitwarden-item-id>" `
        -Field "REVIEW_SECRET" `
        -EnvironmentVariable "REVIEW_SECRET" `
        -Executable "C:\Program Files\nodejs\node.exe" `
        -ArgumentList @("C:\Users\dougl\projects\docket\sync-cloud.js")
}
finally {
    Remove-Item Env:BW_SESSION -ErrorAction SilentlyContinue
    & bw.cmd lock --quiet
}
```

`sync-cloud.js` publishes every valid unresolved local card, pulls decisions only for known local
cards, and accepts a cloud decision only when its answer timestamp is newer. A successful run prints:

```text
sync: pushed <count> card(s), pulled <count> decision(s), refused <count> invalid/unknown decision(s)
```

Verify publication at three levels:

1. Confirm the broker command exits successfully and reports the expected pushed count.
2. Through a separately approved exact `enqueue.js --list "<project>"` tuple, confirm the expected
   stable card IDs appear on the cloud board.
3. Open <https://vault-review-mobile.vercel.app>, enter the bearer copied from Bitwarden, decide one
   test card, rerun the brokered sync, and confirm the matching known card ID is pulled locally.

A single-card `enqueue.js` publish succeeds only after the API acknowledges the request and prints
the content-derived card ID. Archive verification requires `enqueue.js --archive <id>` to receive a
matching archived result and answer timestamp.

## Local storage

When `LOCAL_STORE_DIR` is set, Docket stores authoritative local documents in `docket.sqlite3`.
Every successful mutation also writes a readable `items.json`, `results.json`, `tickets.json`, or
`reads.json` export. Before replacing an existing export, Docket preserves its prior state under
`backups\<name>.previous.json`.

Existing JSON-only local stores migrate lazily: the first read imports each JSON document into
SQLite. The JSON files remain portable recovery inputs. Vercel uses its private Blob store because
a serverless local filesystem is ephemeral.

This command imports a validated card outbox into the local authority while preserving unrelated
items:

```powershell
node import-outbox.js --outbox "<folder>" --store "<folder>"
```

The default paths target the shared Skills Docket outbox and `~\.docket-local`.

## On the phone

Open <https://vault-review-mobile.vercel.app>, paste the `REVIEW_SECRET` value from Bitwarden once,
and triage cards. The browser stores the bearer locally. Completed cards leave the active board,
and the next brokered sync applies valid newer decisions to the local store.
