# Design record

## Goals

- Keep one phone-accessible queue for reviews, briefs, and structured decisions.
- Keep sensitive cards on the local loopback mirror.
- Preserve stable card IDs, cross-device read state, and result round trips.
- Make local storage durable, queryable, and safely backed up.

## Constraints

- Cloud ingestion refuses `sensitive: true`.
- Credential values stay outside Git and agent output.
- Local and cloud adapters preserve the existing card schema.
- Production Blob state and the local store are shared mutable resources.
- The detailed feature contract remains `SPEC.md`.

## Decisions

- The laptop-local adapter uses SQLite as its authority.
- Every successful local mutation emits a current JSON export and retains the immediately previous export.
- Existing JSON documents import lazily on first read, preserving a reversible migration path.
- Vercel retains private Blob persistence; its serverless filesystem is outside the local SQLite design.
- The adapter preserves stable IDs, API behavior, and local/cloud sensitivity rules.
