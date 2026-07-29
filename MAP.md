# Project map

## Core documents

| File | Audience | Loaded or read when | Owns |
|---|---|---|---|
| `AGENTS.md` | Agents and humans | Every repository session | Portable project contract |
| `CLAUDE.md` | Claude adapter | Every Claude repository session | Imports `AGENTS.md` |
| `.cursor/rules/00-project-contract.mdc` | Cursor adapter | Every Cursor repository session | Requires `AGENTS.md` |
| `TASK.md` | Agents and humans | Start, resume, handoff | Active goal, actionable queue, progress, exact next verifier |
| `STATUS.md` | Agents and humans | Start, resume, milestone | Durable project state |
| `LOG.md` | Agents and humans | Recent history, handoff | Append-only work record |
| `BACKBURNER.md` | Humans and agents | Planning | Parked backlog |
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
| Storage adapter | Compare-and-swap document store over Vercel Blob or local SQLite | `api/_store.js`, `api/_document-store.js` | Project |
| Schema boundary | Validate all authoritative documents and incoming cards | `api/_schema.js` | Project |
| Recovery layer | Stable export, atomic publication, tiered retention, verification, and disposable restore | `api/_transfer.js`, `api/_retention.js`, `scripts/docket-data.js`, `.agents/data/Manage-DocketBlob.ps1` | Project |
| Local mirror | Loopback-only compatibility mirror and recovery cache | `local-server.js` | Local runtime |
| Enqueue client | Validate, classify, and route one card | `enqueue.js` | Shared agents |
| Sync daemon | Keep the local mirror alive and exchange public cards/results | `docket-daemon.js`, `sync-cloud.js` | Local runtime |

## Important paths

| Path | Purpose | Generated | Committed |
|---|---|---|---|
| `public/` | Browser UI and local rendering helpers | No | Yes |
| `api/` | Cloud and shared storage handlers | No | Yes |
| `test/` | Node test suite | No | Yes |
| `scripts/` | Docket authority operations and live concurrency verifier | No | Yes |
| `%USERPROFILE%\.docket-local` or `LOCAL_STORE_DIR` | Local `docket.sqlite3`, current JSON exports, and previous exports | Yes | No |
| `C:\Users\dougl\Data\Projects\agent-harness\docket-outbox` | Credential-free card generation outbox | Yes | No |
| `%PROJECT_DATA_SYNC_ROOT%\docket\sqlite\docket.sqlite3` | Optional legacy SQLite snapshots, SHA-256 sidecars, and value-free metadata | Yes | Google Drive |
| `C:\Users\dougl\.docket-local` | Local SQLite compatibility mirror plus readable JSON exports | Yes | No |
| `%PROJECT_DATA_ROOT%\docket\private\docket-cloud-exports` | Complete checksummed cloud-authority exports | Yes | No |

## Data flow

Agents create card JSON and publish it through the authenticated API. `api/_schema.js` rejects malformed cards, and `api/_content-guard.js` rejects sensitive flags and declared CUI/NASA markers at both publisher and shared-store boundaries. The private Vercel Blob store carries the four authoritative aggregates. Every mutation reads the current ETag and uses a conditional write; a conflict restarts the mutation against the current document. The browser reads pending items and submits decisions through the same authority. The project-owned data adapter confirms an exact five-file export inventory, atomically publishes a verified snapshot, applies tiered retention only to valid snapshots, and verifies restoration into a physically empty disposable target. The local SQLite server can mirror the same schema for compatibility and recovery work.

## Integrations

| System | Direction | Authentication name | Failure behavior |
|---|---|---|---|
| Vercel deployment | Both | BWS-brokered `REVIEW_SECRET`, Vercel `APP_SECRET` | Authentication failure returns 401; client retains the local card |
| Vercel Blob | Both | `BLOB_READ_WRITE_TOKEN` | API returns a storage error and does not claim success |
| Local mirror | Both | Loopback trust marker | Loopback-only compatibility and recovery surface |
| Docket browser | Both | `REVIEW_SECRET` | Passcode prompt and local cached read state |

## Ownership and concurrency

One agent owns each writable worktree. Parallel tasks receive distinct `LOCAL_STORE_DIR` paths and ports. Production Vercel deployment, production Blob data, and live card IDs are shared mutable resources. Blob mutations use ETag compare-and-swap. Tests and restore exercises use isolated prefixes or disposable local directories.

## Update rule

Update this file whenever a core document, component boundary, data flow, owner, integration, or important path changes.
