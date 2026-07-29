# Codex adapter

Read and follow `AGENTS.md`, then use `README.md` for Docket operations and `SPEC.md` for product requirements.

## Agent review flow

- Publish a review card with `node enqueue.js --file <card.json>`.
- Pull its decision with `node enqueue.js --pull <card-id>`.
- Reuse a stable card ID when updating the same unanswered decision.
- A `MORE` decision asks for a fuller replacement card under a new ID.

`enqueue.js` reads `REVIEW_SECRET` from the process environment or the machine-local passcode file. Never print or persist the value. Agents should use the project command directly; raw HTTP calls bypass its validation and routing safeguards.

The private Vercel Blob store is the selected authority. The loopback SQLite service is a compatibility mirror and recovery surface. Data architecture, recovery, and verification commands live in `MAP.md` and `README.md`.
