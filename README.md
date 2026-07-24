# vault-review-mobile

Phone-accessible version of the local Workbench review board, hosted on Vercel and backed by a
**private Vercel Blob store**. A local sync script keeps it in step with `~/.claude/reviewer/`
both ways.

## Quickstart

```sh
cp .env.example .env          # fill in REVIEW_URL + REVIEW_SECRET (see comments in .env.example)
npm ci                        # install pinned deps (needs Node 22 — see .nvmrc)
node local-server.js          # NASA-safe local mirror at http://127.0.0.1:8471 (nothing leaves the machine)
```

Run the tests with `npm test` (`node --test`). The cloud path (Vercel) and the two-way `node sync.js`
push/pull are optional and documented below; the local mirror needs no Vercel account.

All machine-specific values (deploy URL, passcode, store location, node path) come from environment
variables loaded from `.env` — see `.env.example` for the full list. Commands below assume you run
them from this folder; substitute your own checkout path.

```
Laptop  ──push incoming/*.json──►  Vercel Blob  ◄──reads/writes──  Phone (UI)
Laptop  ◄──pull answers───────────  Vercel Blob
        └─ writes results/<id>.json + archives incoming  →  existing result-watcher routes to WORK_QUEUE
```

**Heads-up:** the cards contain NASA-internal vault content. Running the first sync publishes that
content to Vercel Blob. That is your call; the upload happens only when *you* run `node sync.js`.

## Card grouping (Project → Set → Card)

The board organizes cards into two tiers above the card, both derived client-side:

- **Set** = the part of a card's `source` after the first colon.
- **Project** = the part before the first colon.

So `source: "sift: interface detection"` → project **sift**, set **interface detection**. A
colon-less source (e.g. `"Tacit Knowledge Capture"`) is a single-set project whose cards render
directly under it. A card may instead carry explicit `project` and/or `set` fields, which override
the `source` derivation. Empty sets/projects auto-hide and reappear when matching cards return.

## STATUS — fully deployed + verified; ONE step left (run the sync)

Live: **https://vault-review-mobile.vercel.app**. Done + verified end-to-end (HTTP + real browser):
private Blob store provisioned & linked, `APP_SECRET` set, deployed, login → card render → submit →
answer pull all working. The store is currently **empty of real cards** — nothing NASA-internal has
been uploaded yet.

**Your passcode** is in `.passcode.txt` (gitignored) in this folder — type it once on your phone.

The only remaining step (this is the deliberate NASA-egress moment — it uploads your ~468 cards):

```powershell
# from this folder
$env:REVIEW_URL    = "https://vault-review-mobile.vercel.app"
$env:REVIEW_SECRET = (Get-Content .passcode.txt -Raw).Trim()
node sync.js --watch
```

Then open the URL on your phone, enter the passcode once, and triage. Answers flow back to
`~/.claude/reviewer/results/` on the next sync cycle (every 15s).

Optional — wipe the two inert smoke-test cards from the store first:
```powershell
vercel blob empty-store --yes
```

Reference walkthrough (env vars are already set, so you don't need most of this) follows.

## Files
- `api/items.js`  — GET pending items
- `api/submit.js` — POST a decision (id, chosen, notes)
- `api/sync.js`   — POST `?op=push` (upload items) / GET `?op=pull` (download answers)
- `api/_auth.js`  — shared-passcode gate (Bearer APP_SECRET) on every endpoint
- `api/_store.js` — Blob storage layer (items.json + results.json, split by writer)
- `public/index.html` — mobile UI (passcode prompt → tap an option per card)
- `sync.js`       — local two-way sync (run on the laptop)

## One-time deploy (run these in PowerShell, from this folder)

```powershell
# from this folder

# 1. Log in + create the project (opens a browser to authenticate — that part is yours)
vercel login
vercel link           # or just `vercel` — accept defaults, scope = your account

# 2. Make a passcode and set it as the app secret (used by the phone UI AND the sync script)
$secret = -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
$secret               # <-- copy this; you'll type it on your phone once
vercel env add APP_SECRET production
# (paste $secret when prompted; repeat for `preview` if you want preview deploys to work)

# 3. Create + link a PRIVATE Blob store headless (no browser, injects BLOB_READ_WRITE_TOKEN):
vercel blob create-store vault-review --access private --yes

# 4. Deploy to production
vercel --prod
# note the URL it prints, e.g. https://vault-review-mobile.vercel.app
```

## Run the sync (on the laptop, PowerShell)

```powershell
$env:REVIEW_URL    = "https://vault-review-mobile.vercel.app"   # your deploy URL
$env:REVIEW_SECRET = "<the 40-char secret from step 2>"
node sync.js --watch   # from this folder
```

Leave that running (or run without `--watch` for a one-shot). It pushes every pending card up and
writes any answers you made on your phone back into `~/.claude/reviewer/results/`, archiving the
incoming file — so the existing local watcher routes each decision to its origin WORK_QUEUE exactly
as if you'd answered on the desktop board.

To keep it running unattended, wrap that last line in a Task Scheduler task, or just launch it in a
terminal when you want to triage from your phone.

## On the phone
Open the deploy URL, enter the passcode once (stored in the browser), tap an option per card. Done
cards disappear; the next sync cycle applies them locally.
