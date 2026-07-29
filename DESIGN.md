<!-- agent-harness:universal-design:v1:start -->
## Universal interface rules

- Never use IBM Plex Mono.
- Use a proportional body face for prose, navigation, labels, dates, names, and human-readable metadata.
- Reserve monospace for code, commands, identifiers, timestamps, and genuinely tabular numeric data.
- Define explicit body, display, and monospace roles. Use tabular numerals on the proportional face for aligned quantities.
- Establish hierarchy through size, weight, spacing, and placement before decoration.
- Give each screen a clear primary action or reading path. Use spacing and alignment to show relationships.
- Reuse existing tokens and components before adding variants.
- Cover relevant default, hover, focus, active, disabled, loading, empty, error, and success states.
- Use semantic structure and native controls, visible keyboard focus, logical tab order, accessible names, sufficient contrast, and non-color state cues.
- Support narrow, medium, and wide layouts, zoom, text resizing, touch targets, and reduced motion.
- Inspect the existing design system, screenshots, and implementation before proposing a new rule or component.
- Verify browser-visible work with browser or end-to-end tests across responsive, keyboard, loading, empty, and error behavior.
<!-- agent-harness:universal-design:v1:end -->

# Design record

## Goals

- Keep one phone-accessible queue for reviews, briefs, and structured decisions.
- Preserve stable card IDs, cross-device read state, and result round trips.
- Prevent concurrent clients from silently overwriting one another.
- Make the complete network authority exportable and restorable into a safe target.

## Constraints

- Credential values stay outside Git and agent output.
- Local and cloud adapters preserve the existing card schema.
- Production Blob state is a shared mutable resource.
- The detailed feature contract remains `SPEC.md`.

## Decisions

- The private Vercel Blob store is the current network authority. It contains exactly four aggregate documents: `items.json`, `results.json`, `tickets.json`, and `reads.json`.
- Every aggregate mutation uses compare-and-swap. The writer reads an ETag, writes with `ifMatch`, and retries from the current document after a conflict.
- Schema validation runs at ingest, read, write, export, and restore boundaries. Corruption fails visibly.
- A complete export contains all four documents, source ETags, record counts, and SHA-256 checksums.
- Restore defaults to a mutation-free dry run. A material restore is permitted only into an empty disposable local target through the committed adapter.
- The local SQLite server remains a compatibility mirror and recovery cache. It uses guarded transactions and emits readable JSON exports.
- The selected choices remain reversible through this record and `data-manifest.yaml`.
