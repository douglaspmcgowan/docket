# Docket bridge for Codex — send to and receive from Douglas's review board

This is the self-contained protocol for a Codex agent to use the review board
(https://vault-review-mobile.vercel.app) exactly the way Claude does: push cards in, pull
Douglas's decisions back out. Hand this whole file to Codex; it needs nothing else.

The board is a public bearer-auth HTTP API. Claude reaches it through the `enqueue.js` CLI over
those endpoints. Codex uses the same CLI and the same endpoints — the only difference is where the
passcode comes from.

## Auth — from a Codex sandbox

Codex does **not** have `.passcode.txt` (it is machine-local and never committed). Authenticate with
the `REVIEW_SECRET` environment variable instead — `enqueue.js` reads it before falling back to the
file. The dispatcher (the main session that launches Codex) sets it:

```
# the caller injects this into Codex's environment; Codex never prints it
export REVIEW_SECRET=<the board passcode>
```

Never echo, log, or write the secret into a card body. If `REVIEW_SECRET` is unset the commands fail
with `no passcode` — that means the dispatcher did not inject it, not that the board is down.

## SENSITIVITY GATE — run first, every push

Cards route by a `sensitive` flag that is **TRUE by default (fail-safe)**. Only add **`--public`** for
**public / personal / NASA-cleared** content — that (and only that) reaches the cloud. **NASA-internal /
CUI / ITAR content: never add `--public`** — the default keeps it on the local mirror, which never leaves
the machine. When unsure, omit `--public`.

Two guards enforce this so a mistake can't leak: `enqueue.js` REFUSES to send a sensitive card to any
non-loopback URL, and the cloud board REFUSES to store any `sensitive:true` card. Forgetting `--public`
on public content just lands it locally — re-run with `--public`.

## Two boards — routed by the flag

One client, one set of commands; the flag picks the board:

- **`--public`** → **Cloud** (`https://vault-review-mobile.vercel.app`) AND mirrored to local. Public /
  personal / NASA-cleared only.
- **no flag** (default) → **Local mirror** (`http://127.0.0.1:8471`), localhost-bound; nothing leaves the
  machine. This is where sensitive cards go.

Everything below — push, pull, list, groups — works identically on either board; only `--public` differs.
(An explicit `--url http://127.0.0.1:8471` still targets local and is equivalent to the default route.)

## SEND — push a card in

One card per call. Direct flags for a simple card; a JSON file for anything structured.

```
# public / cleared content -> add --public (routes to cloud + mirrors local):
node enqueue.js --public --title "Ship the fillet fix?" --options "Ship,Hold" --source "cad-forge: reviews"
# sensitive content -> NO flag (routes to the local mirror only):
node enqueue.js --title "..." --source "..."
node enqueue.js --public --file card.json   # a full JSON card (schemas below)
```

`enqueue.js` prints `pushed 1 <public|SENSITIVE> card -> <id>  @ <url>`. **Keep that id** — it is how you pull the decision back.
For a re-pushable card (a resumed run might push it again) set a stable content-derived `--id` so a
repeat push overwrites in place instead of filing a duplicate.

## RECEIVE — pull Douglas's decisions back out

```
node enqueue.js --pull                    # every recorded decision, newest first
node enqueue.js --pull <id-or-substring>  # just the card(s) whose id contains this
```

Each line is one decision: `chose: <option>`, `comment only` (he left a note, picked nothing),
`archived`, or `MORE — remake fuller`. A card with **no** line yet is still pending — he hasn't
acted. The flow is: push → note the returned id → later `--pull <id>` → read his answer.

**`action:'more'` = remake fuller.** If a card's decision is `MORE`, regenerate that card with more
depth (honor any note) and push the richer version under a **NEW id** — the original id is answered
and stays hidden, so reusing it would never surface. Read any comment before acting on a rejection:
a rejection with a reason is a course correction.

## Schemas

- **review** — `{ "title", "description"?, "options"? (default ["Approve","Reject"]), "project"?,
  "set"?, "source"?, "blocking"? }`. One card per independently-decidable thing.
- **brief** — `{ "kind":"brief", "title", "format":"md"|"html", and ONE of "body" (inline) or "src"
  (absolute path — inlined at push), "source"?, "project"?, "set"?, "blocking"? }`.
- **decision** — `{ "kind":"decision", "title", "type": option-select|tradeoff|reversibility|
  reasoning-tree|diff|critique, + that type's fields, "project"?, "set"?, "blocking"? }`.

Every card must be decidable from the card alone — Douglas reads it on his phone without the
transcript. Put the recommendation + a one-line why in the `description`. Use `"blocking": true` only
when the card gates work still to be done.

## Reuse groups — don't spawn near-duplicates

```
node enqueue.js --groups                  # existing project/set names — reuse them
node enqueue.js --list "<project>"        # existing cards + ids in a project (to --id-update one)
```

## Fallback client (a sandbox where `node`/global fetch isn't available)

The endpoints are plain HTTPS; if this sandbox has working `curl` but not node, call them directly —
same bearer auth. **`curl` bypasses `enqueue.js`'s client guard, so NEVER put sensitive content in a
cloud curl** — the cloud rejects `sensitive:true` at ingestion, but the honest gate is still yours to run:

```
# send
curl -s -X POST "https://vault-review-mobile.vercel.app/api/sync?op=push" \
  -H "Authorization: Bearer $REVIEW_SECRET" -H "Content-Type: application/json" \
  -d '{"items":[{"id":"my-card-1","title":"...","type":"reviewer","options":["Approve","Reject"],"submitted_at":"2026-07-22T00:00:00Z"}]}'
# receive
curl -s "https://vault-review-mobile.vercel.app/api/sync?op=pull" -H "Authorization: Bearer $REVIEW_SECRET"
```

Prefer `enqueue.js` when node is present — it builds the id/envelope for you and its global `fetch`
works where `curl`'s TLS may not.
