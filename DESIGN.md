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

### Design libraries

Concrete things to reach for — animation packages and working skeletons, icon kits, typeface pools, design-system install commands and canonical documentation. Read the leaf you need; each one loads on its own.

- **Index** `~/.agents/design/LIBRARIES.md`
- **Motion** `~/.agents/design/animation/` — libraries, sticky-stack, horizontal-pan, scroll-reveal, frosted glass, forbidden patterns
- **Icons** `~/.agents/design/icons/libraries.md`
- **Type** `~/.agents/design/type/families.md`
- **Design systems** `~/.agents/design/systems/install.md` and `sources.md`
- **Design languages** `~/.agents/design/languages/registry.md` — read it before committing a visual world or generating a new design language, and register the world committed for this project there in the same work unit

The full universal rules are `~/.agents/DESIGN.md`. Where a library entry and a rule disagree, the rule wins.
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
- One shared content guard excludes explicit sensitive cards and declared CUI/NASA marker strings from publishers and the shared authority while preserving legitimate personal/public cards.
- A complete export captures all four documents twice, retries when any source version changes, verifies in a temporary sibling, and publishes the directory atomically.
- Export verification requires exactly four plain JSON documents plus the plain manifest file. Retention never applies recursive deletion to an invalid snapshot.
- Timestamped recovery snapshots retain the union of 3 UTC daily, 4 ISO-weekly, and 3 monthly buckets. Counts remain adapter parameters, and the newest verified point always survives.
- Restore defaults to a mutation-free dry run. A material restore is permitted only into a physically empty disposable local target through the committed adapter.
- Local cloud synchronization receives `REVIEW_SECRET` only through the shared Bitwarden Secrets Manager exact-command broker.
- The local SQLite server remains a compatibility mirror and recovery cache. It uses guarded transactions and emits readable JSON exports.
- The selected choices remain reversible through this record and `data-manifest.yaml`.
