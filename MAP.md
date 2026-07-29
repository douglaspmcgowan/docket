# Project map

## Core documents

| File | Audience | Loaded or read when | Owns |
|---|---|---|---|
| `AGENTS.md` | Agents and humans | Every repository session | Portable project contract |
| `CLAUDE.md` | Claude adapter | Every Claude repository session | Imports `AGENTS.md` |
| `.cursor/rules/00-project-contract.mdc` | Cursor adapter | Every Cursor repository session | Requires `AGENTS.md` |
| `CURRENT-TASK.md` | Agents and humans | Start, resume, handoff | Active goal, progress, exact next verifier |
| `WORK_QUEUE.md` | Agents and harness | Multi-step work | Actionable checkbox state |
| `STATUS.md` | Agents and humans | Start, resume, milestone | Durable project state |
| `LOG.md` | Agents and humans | Recent history, handoff | Append-only work record |
| `BACKBURNER.md` | Humans and agents | Planning | Parked backlog |
| `VERIFY.md` | Agents and CI | Before completion | Required evidence and commands |
| `MAP.md` | Agents and humans | Orientation | This document graph and project navigation |
| `DESIGN.md` | Agents and humans | Feature and architecture work | Goals, constraints, decisions |
| `MEMORY.md` | Agents | Recall | Lean links to durable topic notes |
| `data-manifest.yaml` | Agents and applications | Data access | Value-free data locations and classifications |
| `secret-manifest.json` | Agents and automation | Credential-dependent setup | Value-free credential inventory |
| `skills-manifest.json` | Agents and cloud setup | Skill selection and export | Project skill bindings |
| `.agents/feedback/FEEDBACK-LOG.md` | Agents and humans | Explicit correction or recurrence review | Append-only, value-free feedback records |
| `SPEC.md` | Agents and humans | Feature and architecture work | Detailed product requirements |
| `README.md` | Humans and agents | Setup and operations | Local/cloud operating guide |
| `CODEX.md` | Cloud/Codex adapter | Cloud development | Docket-specific cloud context |

## Architecture

| Component | Purpose | Entry point | Owner |
|---|---|---|---|
| Browser application | Browse, search, read, and triage cards | `public/index.html` | Project |
| Cloud API | Authenticated items, submit, sync, artifact, read-state, and group operations | `api/*.js` | Project |
| Storage adapter | Vercel Blob or local SQLite plus JSON exports | `api/_store.js` | Project |
| Local mirror | Loopback-only server for sensitive cards | `local-server.js` | Local runtime |
| Enqueue client | Validate, classify, and route one card | `enqueue.js` | Shared agents |
| Sync daemon | Keep the local mirror alive and exchange public cards/results | `docket-daemon.js`, `sync-cloud.js` | Local runtime |

## Important paths

| Path | Purpose | Generated | Committed |
|---|---|---|---|
| `public/` | Browser UI and local rendering helpers | No | Yes |
| `api/` | Cloud and shared storage handlers | No | Yes |
| `test/` | Node test suite | No | Yes |
| `%USERPROFILE%\.docket-local` or `LOCAL_STORE_DIR` | Local `docket.sqlite3`, current JSON exports, and previous exports | Yes | No |
| `C:\Users\dougl\Data\Projects\agent-harness\docket-outbox` | Credential-free card generation outbox | Yes | No |
| `%PROJECT_DATA_SYNC_ROOT%\docket\sqlite\docket.sqlite3` | Immutable transactionally consistent SQLite snapshots, SHA-256 sidecars, and value-free metadata | Yes | Google Drive |
| `C:\Users\dougl\.docket-local` | Local SQLite authority plus readable JSON exports | Yes | No |

## Data flow

Agents create value-free/public or sensitive card JSON. `enqueue.js` validates the schema and routes sensitive cards to the loopback mirror while public cards may cross the network boundary to Vercel. The local adapter writes SQLite and a portable JSON export in the same synchronous mutation path. `.agents\data\Sync-ProjectData.ps1` uses the installed shared harness to create or restore checksummed SQLite snapshots under `PROJECT_DATA_SYNC_ROOT`; Google Drive carries those immutable snapshots between computers. The browser reads pending items and submits decisions. Sync clients pull results into local durable state. Artifacts are resolved only through the documented artifact endpoint and configured root.

## Integrations

| System | Direction | Authentication name | Failure behavior |
|---|---|---|---|
| Vercel deployment | Both | `REVIEW_SECRET`, `APP_SECRET` | Authentication failure returns 401; client retains the local card |
| Vercel Blob | Both | `BLOB_READ_WRITE_TOKEN` | API returns a storage error and does not claim success |
| Local mirror | Both | `REVIEW_SECRET` | Loopback-only server; local store remains authoritative for sensitive cards |
| Docket browser | Both | `REVIEW_SECRET` | Passcode prompt and local cached read state |

## Ownership and concurrency

One agent owns each writable worktree. Parallel tasks receive distinct `LOCAL_STORE_DIR` paths and ports. Production Vercel deployment, production Blob data, the shared local store, and live card IDs are shared mutable resources and require explicit ownership. Tests use disposable local directories.

## Update rule

Update this file whenever a core document, component boundary, data flow, owner, integration, or important path changes.
