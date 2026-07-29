# RESUME — vault-review-mobile

## What this is
A phone-accessible mirror of the local Workbench review board. Cards (review items sourced from
`~/.claude/reviewer/`) are triaged from a browser; decisions flow back to the laptop. Two run modes:

- **Local mirror** (NASA-safe, default) — `local-server.js` serves the UI at `http://127.0.0.1:8471`;
  nothing leaves the machine.
- **Cloud** (optional) — Vercel serverless API (`api/`) backed by a private Vercel Blob store, kept in
  step with the laptop via brokered `sync-cloud.js` push/pull. Running the cloud sync uploads local content;
  that is a deliberate egress step you trigger yourself.

Node 22 (see `.nvmrc`). Public configuration can come from `.env`; credentials enter approved child
processes through Bitwarden Secrets Manager. The ignored legacy `.passcode.txt` name remains only to
prevent accidental commits while old copies are removed. No runtime code reads that file.

## One-command bootstrap
```powershell
Copy-Item .env.example .env
npm.cmd ci
node local-server.js
```
Then open http://127.0.0.1:8471.

## How to run it
- **Local mirror:** `node local-server.js` (port 8471; nothing leaves the machine).
- **Tests:** `npm test` (`node --test`).
- **Cloud sync (optional, uploads local content):** run
  `& "$env:USERPROFILE\.agents\tools\Invoke-WithBitwardenSecret.ps1" -CommandId "docket-sync"`.
  Full broker and deployment guidance is in `README.md`.

## Where things live
- `api/` — Vercel serverless endpoints (items / submit / sync / auth / store).
- `public/index.html` — mobile UI.
- `local-server.js` — NASA-safe local mirror.
- `sync.js` / `sync-cloud.js` — laptop-side two-way sync.
- `SPEC.md`, `CODEX.md` — spec + build notes.
