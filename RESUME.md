# RESUME — vault-review-mobile

## What this is
A phone-accessible mirror of the local Workbench review board. Cards (review items sourced from
`~/.claude/reviewer/`) are triaged from a browser; decisions flow back to the laptop. Two run modes:

- **Local mirror** (NASA-safe, default) — `local-server.js` serves the UI at `http://127.0.0.1:8471`;
  nothing leaves the machine.
- **Cloud** (optional) — Vercel serverless API (`api/`) backed by a private Vercel Blob store, kept in
  step with the laptop via `sync.js` (two-way push/pull). Running the cloud sync uploads vault content;
  that is a deliberate egress step you trigger yourself.

Node 22 (see `.nvmrc`). All machine-specific values (deploy URL, passcode, store location) come from
`.env` — copy `.env.example` and fill it in. This bundle ships templates only; the real `.env.local`,
`.passcode.txt`, `.vercel/`, and bulk/scratch artifacts are gitignored and stay on the laptop.

## One-command bootstrap
```sh
cp .env.example .env && npm ci && node local-server.js
```
Then open http://127.0.0.1:8471.

## How to run it
- **Local mirror:** `node local-server.js` (port 8471; nothing leaves the machine).
- **Tests:** `npm test` (`node --test`).
- **Cloud sync (optional, uploads vault content):** set `REVIEW_URL` + `REVIEW_SECRET`, then
  `node sync.js --watch`. Full deploy walkthrough is in `README.md`.

## Where things live
- `api/` — Vercel serverless endpoints (items / submit / sync / auth / store).
- `public/index.html` — mobile UI.
- `local-server.js` — NASA-safe local mirror.
- `sync.js` / `sync-cloud.js` — laptop-side two-way sync.
- `SPEC.md`, `CODEX.md` — spec + build notes.
