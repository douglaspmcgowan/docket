# Project instructions

This repository contract travels with Docket for Claude, Codex, Cursor, and cloud agents.

<!-- agent-harness:portable:v3:start -->
## Portable operating rules

Use subagents immediately for every independent, file-disjoint workstream. This is explicit authorization to parallelize. Keep only destructive or dependent final gates serial.

Agents may create local commits for in-scope work without asking. Never push, merge, force-update, discard, delete a worktree, or remove a task workspace unless the user explicitly authorizes that action.

- Answer questions before task narration. Keep routine updates concise.
- Never invent facts, paths, APIs, versions, source content, measurements, credential state, or passing results. Name the source checked.
- Verify inherited claims against repository, Git, runtime, or current primary evidence.
- Match commands and paths to the user's actual shell and device.
- Avoid the rhetorical "it is X, not Y" construction.
- Preserve unrelated changes. Inspect exact targets before destructive or broad operations and prefer recoverable changes.
- Before creating, replacing, renaming, or removing an artifact, search the repository and available shared harness for its existing owner, equivalents, consumers, wiring, tests, and documentation. Extend or consolidate the closest adequate owner. Record search evidence and the reason for a truly new owner in authoritative task state.
- Extract every discrete obligation from a multi-step prompt into authoritative task state. In an enrolled project, use Work Scope tasks or discoveries; otherwise use legacy `TASK.md` checkboxes.
- Read a named or clearly matching skill in full. Keep canonical workflows under `.agents\skills` and product adapters thin.
- Reproduce bugs before fixing them and add a regression test when practical. Exercise the assembled system under the condition that exposed the failure.
- For browser-visible changes, run the repository browser or end-to-end verifier.
- When a correction requests permanent prevention, use the `correct` skill and implement a durable, narrowly scoped artifact.
- Treat `MEMORY.md` as a lean index. Keep behavior in instructions, skills, hooks, permissions, tests, or verifiers.
- Before claiming non-trivial work complete, run the verification recorded in authoritative task state, relevant tests, and an adversarial pass.
<!-- agent-harness:portable:v3:end -->

## Project identity

- Name: `docket`
- Purpose: Phone-accessible review, brief, and decision queue over one authenticated cloud authority.
- Default branch: `master`

## Start and resume

1. Read this file, `TASK.md`, `STATUS.md`, and recent `LOG.md`.
2. Run `git status --short --branch` and inspect worktrees.
3. Read `SPEC.md` for the feature contract, `MAP.md` for architecture and data flow, and `DESIGN.md` for interface rules.
4. Read `data-manifest.yaml` before external-data work.

## Commands

- Setup: `npm.cmd ci; npm.cmd run browser:install`
- Test: `npm.cmd test`
- Lint: `node --check enqueue.js; node --check local-server.js; node --check sync-cloud.js; node --check scripts\docket-data.js; node --check scripts\verify-blob-concurrency.js`
- Build: no build step
- End-to-end: `node --test test\phone-e2e.test.js`

Record current proof and the exact next verifier in `TASK.md`.

## Project-specific rules

- `SPEC.md` owns product behavior and acceptance criteria.
- The private Vercel Blob store is the network authority named by `data-manifest.yaml`.
- Treat production Blob paths and live card IDs as shared mutable resources. Use isolated `verification/` prefixes for live tests and remove only the fixture created by that test.
- Run Docket writes through `api/_document-store.js`; direct aggregate overwrites bypass lost-update protection.
- Validate all four documents through `api/_schema.js`.
- Cloud restore is disabled. Verify exports through a dry run and an empty disposable local target.
- Never read or print credential values. Use the existing Vercel login with `vercel env run` when the linked project must inject storage credentials.

## Product adapters

- Claude loads `CLAUDE.md`, which imports this file.
- Codex loads this file.
- Cursor loads `.cursor\rules\00-project-contract.mdc`, which points here.

When the local shared harness exists, also follow `~/.agents/AGENTS.md`.
