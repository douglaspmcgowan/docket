# SPEC — Unified Review/Decide/Briefs App

<!-- STATUS: active -->
<!-- One WHAT document. Technology-agnostic: no stack/storage/framework nouns in §Product or §Functional.
     §Acceptance is the machine-consumable oracle for /user, /probe, /design-review, /verify. -->

## §Product

### Root problem
Douglas dockets work — things to **review**, **decisions** to make, and **briefs** to read — from Claude
sessions, and adjudicates them on a persistent board instead of losing them in chat. Today that board exists as
**two separate apps with two separate stores**: a full-capability desktop app (review + every decision type +
briefs) and a limited online board (review + one decision type, no briefs). Because the stores are separate and
the capabilities differ, the online board shows **different content** than the desktop one and **cannot show
briefs at all**. The problem beneath "the apps look different" is that there is no single source of truth: the
same docketed item is present in one place and absent in the other, so neither surface can be trusted as "the
board." The fix is one app over one store, reachable from both the desk and the phone.

### Users & context
- **Douglas** — the sole user, an expert reviewing his *own* docketed work. Impatient, keyboard-first at the
  desk, thumb-first on the phone, evaluating content he already has context on. No onboarding, no hand-holding;
  density and speed over guidance.
- **Claude sessions (the producer)** — automated `/docket` runs are the only writer of new items. The human
  never authors an item inside the app; the app is where items are *reviewed and answered*, not created.
- **Environment** — accessed from a desktop browser and a phone browser, over the network, behind one shared
  passphrase. Content is all public/personal (Douglas confirmed); nothing CUI/NASA-internal is docketed.

### Jobs to be done (ranked)
1. **See one trustworthy queue** of everything pending, identical on every device.
2. **Find work by project** — see the items belonging to a given project grouped together, the same way on
   every surface; loose items that belong to no project sit at the top.
3. **Answer a review or a decision** (pick an option, add a note) and have that answer stick everywhere.
4. **Read a brief** (formatted long-form) on whichever device is at hand.
5. **Ask for more detail** on an item without consuming it ("tell me more"), and get the enriched version back.
6. **Keep the board clean** — mark items read/answered, and archive old ones in one tap, so the queue reflects
   only what still needs him.
7. **Choose the lens** — look at **one project with all three kinds together** (everything for that project on
   one screen), or flip to the **classic three-kind view** (review / decide / briefs across all projects, the
   way the desktop app works today).
8. **Keep projects & sets canonical** — when work is docketed, it attaches to an **existing** project/set by
   picking from what already exists, so the same real project doesn't fracture into near-duplicate names
   ("cad-forge" vs "cadforge" vs "CAD forge"). Douglas can **view, rename, and edit** existing sets and
   projects, not only add or delete them.
9. **Resolve a review without deciding** — leave a comment and submit with no option picked, when the right
   response is feedback rather than a verdict.

### Success criteria (outcomes — measurable, solution-agnostic)
- **SC-001** — From any device, the set of pending items shown is **identical** (same ids, same content); there
  is zero divergence between the desktop and phone views of the same store.
- **SC-002** — **Every** item type Douglas dockets — review, all six decision types, and briefs — is viewable on
  the one app; no type is "desktop-only" or silently dropped.
- **SC-003** — An answer recorded on one device is reflected on every other device within one refresh cycle; an
  already-answered item is never presented again as pending, and no answer is lost or overwritten by a racing
  writer.
- **SC-004** — A newly docketed item becomes visible in the app within **10 s** of the docket call completing
  (p95, single item, normal network).
- **SC-005** — **Zero** items containing CUI/NASA-internal markers are ever accepted into the shared store; the
  push path rejects them before they leave the machine.
- **SC-006** — An item docketed under a project appears under that project's group on **every** surface
  (review, decide, briefs), with identical grouping across surfaces; items with no project appear ungrouped,
  above the project groups.
- **SC-007** — Douglas can archive any item from the UI in a single action; an archived item leaves the active
  board and is never presented again as pending.
- **SC-008** — From any screen, Douglas can switch between the **by-project** lens (one project, all three
  kinds) and the **by-kind** lens (review/decide/briefs across projects) without losing his place or the
  underlying store; both lenses read the same items.
- **SC-009** — When work is docketed, the rate of **accidental near-duplicate** projects/sets (same real
  project under differently-spelled names) trends to zero, because the docket path attaches to an existing
  canonical name rather than minting a new one from free text.
- **SC-010** — Douglas can rename or edit an existing set/project and every item under it follows the change
  (no orphaned items, no split group).
- **SC-011** — On a review item, Douglas can submit a comment with **no option selected**; it clears the item
  and records the comment as the outcome.

### Non-goals
- **Keeping the two apps.** The separate desktop app retires; there is exactly one app afterward. This spec does
  not preserve a second codebase or a second store.
- **In-app authoring.** The app does not create items; items arrive only via `/docket`. No compose/new-item UI.
- **Multi-user / accounts / per-item permissions.** One user, one shared passphrase, one flat store. No login
  system, no roles, no per-item clearance gate (unneeded — content is all public/personal).
- **Offline-first / installable-app sync.** The app requires the network; no local-first replication or
  conflict-merge engine.
- **New generation features.** Any "generate options with an LLM" capability is out of scope here; this spec
  unifies review/decide/briefs surfacing, not content generation.

### Constraints & assumptions
- **ASSUMED:** the unified app is the existing responsive web app extended in place, not a ground-up rebuild.
- **ASSUMED:** one shared store and one shared passphrase; all docketed content is public/personal.
- **ASSUMED:** `/docket` repoints its default target to the shared store, so new items of every type land there.
- **ASSUMED:** the five additional decision types (tradeoff, reversibility, reasoning-tree, diff, critique) are
  the lowest-priority slice; **briefs** are the primary missing capability and rank above them.
- **ASSUMED:** answers/decisions flow back to the producer (Claude) through the same store, replacing the old
  one-way local pull.
- **ASSUMED:** existing desktop-only items (review/decision/brief) are migrated into the shared store at cutover
  so they appear on the unified app alongside new items.
- **ASSUMED:** `/docket` tags each item with the project it belongs to (or leaves it un-projected); the docket
  skill is updated to set the project consistently.
- **ASSUMED:** Project and Set become **canonical named entities** the docket path picks from (with fuzzy-match
  against existing names to prevent near-duplicates), rather than free-text minted anew per push. Delivering
  view/rename/edit of existing projects/sets and the canonical registry **may require changes to the ingest
  CLI / MCP / API**, not only the app UI — that is in scope.
- **ASSUMED:** the app offers **two lenses over the same store** — by-project (all kinds for one project) and
  by-kind (the classic review/decide/briefs split) — switchable from the chrome.
- **ASSUMED:** a **brief may embed** review/decision cards (the cards it is about), rendered inline within the
  brief's reading flow and answerable in place.
- **DONE (shipped):** a review item can be resolved comment-only (a note, no option) — recorded as
  `{chosen: null, comment}`; see FR-032.

---

## §Functional

### User stories (prioritized; each independently testable)

- **P1 — One board over one store, on both devices.**
  *As Douglas, I want a single app that shows the same review and simple-decision cards from one store on both
  my desktop and my phone, so that the board is trustworthy no matter where I open it.*
  Why P1: this is the MVP that ends the divergence; without it nothing else matters. Independent test: docket a
  review card, open the app on two viewport sizes, confirm the same card appears and can be answered on either.

- **P2 — Briefs on the one app.**
  *As Douglas, I want to read a docketed brief (formatted long-form) inside the same app, so that briefs stop
  being desktop-only.*
  Why P2: briefs are the single biggest capability gap between the two current apps. Independent test: docket a
  markdown brief, open the app, confirm it renders formatted and is markable read/archived.

- **P3 — The rich decision types on the one app.**
  *As Douglas, I want the richer decision types (tradeoff, reversibility, reasoning-tree, diff, critique) to
  render and be answerable in the same app, so that every decision type reaches full parity.*
  Why P3: these are used less often than review/briefs; parity completes the unification but isn't the MVP.
  Independent test: docket one of each type, confirm each renders its structure and records an answer.

### Functional requirements

**Single store & surfacing**
- **FR-001** — The system MUST serve all item types from **one shared store**; there is no second store any
  surface reads from.
- **FR-002** — The system MUST present the identical set of pending items regardless of the device/viewport it
  is opened on (same content, adapted layout).
- **FR-003** — The app MUST be usable at both desktop and phone viewport widths without loss of function.
- **FR-004** — The system MUST require a single shared passphrase before any item content is shown or any answer
  accepted.

**Items & review**
- **FR-005** — The system MUST display a **review** item's title, description, source, and its declared options
  (defaulting to Approve/Reject when none are given).
- **FR-006** — The system MUST let the user select exactly one option for a review/decision item and optionally
  attach a free-text note, and MUST record that answer to the shared store.
- **FR-007** — The system MUST reject an answer whose chosen option is not one of the item's declared options.
- **FR-008** — The system MUST NOT present an item as pending once it has a recorded answer.

**Briefs**
- **FR-009** — The system MUST render a **brief** as formatted long-form content for both supported formats
  (a lightweight-markup format and a rich-markup format).
- **FR-010** — A brief MUST carry exactly one content source: inline body **or** a reference to a content file,
  never both and never neither.
- **FR-011** — Briefs are informational: the system MUST allow marking a brief read/archived and MUST NOT
  require an option-answer to clear it.

**Decision types**
- **FR-012** — The system MUST support these decision types, each rendering its distinct structure:
  `option-select` (choose among option cards), `tradeoff` (a 2–5-option × criteria matrix of stances),
  `reversibility` (a one-way/two-way door with cost and consequences), `reasoning-tree` (nodes with
  active/pruned/chosen status), `diff` (before/after with a language hint), and `critique` (an artifact to
  critique).
- **FR-013** — For every decision type that resolves to picking an option, the system MUST record the chosen
  option and optional note exactly as a review answer (FR-006), so answering is uniform across types.
- **FR-014** — The system MUST reject a decision item whose payload does not satisfy its type's required fields.

**"Tell me more" (enrichment request — shipped model)**
- **FR-015** — The system MUST let the user request more detail on any card. *(Shipped model, superseding the
  original consumable-ticket design:)* "Tell me more" is a **feedback submit** — it resolves the card (clears
  it from pending) and records the outcome `{action:'more'}`, so the producer remakes the item **fuller under a
  new id**. There is no separate ticket store.
- **FR-016** — The recorded `{action:'more'}` outcome MUST be retrievable by the producer through the same
  answer-return path as any other outcome (FR-021), and MUST NOT be presented again as pending once recorded.
- **FR-017** — Re-pushing an item under the **same id** MUST replace the card's content in place while it
  remains pending (an unanswered card stays visible with the new content). *(This is the direct in-place-update
  path via `enqueue --id`, independent of the "tell me more" flow above.)*

**Ingest (the /docket push)**
- **FR-018** — The ingest path MUST accept **all** item types — review, every decision type, and briefs — into
  the shared store (not only review + option-select).
- **FR-019** — The ingest path MUST reject any item whose content matches CUI/NASA-internal markers, before that
  content leaves the machine, and MUST report the rejection. Matching is case-insensitive across nested string
  fields and covers standalone `CUI`, `Controlled Unclassified Information`, `NASA Internal`, and
  `NASA Sensitive` markings. An explicit `sensitive: true` is also ineligible for the shared store.
- **FR-020** — A newly ingested item MUST become visible to the app without a manual server restart.

**Answer return**
- **FR-021** — Recorded answers MUST be retrievable by the producer from the shared store, so a `/docket` run
  can see what was decided.
- **FR-022** — Concurrent answer writes MUST NOT clobber one another such that a recorded answer is silently
  lost.

**Projects, archive & lifecycle**
- **FR-023** — An item MAY carry a project label. The system MUST preserve that label unchanged through ingest,
  storage, and display on every surface.
- **FR-024** — The system MUST group items by project, and MUST present the same grouping consistently across
  all three surfaces (review, decide, briefs). Items with no project MUST appear ungrouped, ordered **above**
  the project groups.
- **FR-025** — The system MUST let the user archive any item, of any kind, from the UI in a single action. An
  archived item MUST NOT appear in the active board and MUST NOT be presented as pending.
- **FR-026** — The system MUST support importing pre-existing items (review/decision/brief) from the prior
  desktop-only store into the shared store, after which each appears on the unified app like any native item,
  carrying its project (if any).
- **FR-027** — The app MUST reflect item lifecycle changes — new items, in-place re-pushes (FR-017), and
  answered/archived state — without a manual server restart, matching the desktop's live-update behavior.

**Briefs-as-inbox & chrome**
- **FR-028** — Each brief MUST have a read/unread toggle the user can flip **both ways** from the UI; the
  read/unread state MUST persist in the shared store and reflect across devices. Unread briefs MUST be visually
  distinguished from read ones (inbox convention).
- **FR-029** — The briefs surface MUST follow established inbox conventions surfaced by the design research
  (e.g. unread emphasis, scannable list rows, read state that does not delete the item) — the concrete
  conventions adopted are recorded in the plan/design, not invented ad hoc.
- **FR-030** — The theme (light/dark) toggle MUST be presented as an icon control in the top-right of the app
  chrome.
- **FR-031** — The app chrome MUST NOT show redundant static surface-name text (the "review / decide / briefs"
  label) in the top-left; the current surface is conveyed by the primary navigation, not duplicated as a label.

**Comment-only resolution (shipped)**
- **FR-032** — On a review/decision item, the system MUST let the user submit a **comment with no option
  selected**; this resolves the item (clears it from pending) and records the outcome as
  `{chosen: null, comment: <note>}`. A comment-only submit with an empty note MUST be refused. *(Shipped.)*

**Two lenses over one store**
- **FR-033** — The system MUST offer two switchable lenses over the same store: **by-project** (a chosen
  project shows all its items of every kind together) and **by-kind** (review / decide / briefs across all
  projects, the classic desktop split). Switching lenses MUST NOT change the underlying store or lose the
  user's passphrase session; both lenses MUST show the same items, only grouped differently.
- **FR-034** — In the by-kind lens, each kind (review, decide, briefs) MUST be reachable as its own section;
  in the by-project lens, a project view MUST interleave its review/decision/brief items under that project.

**Canonical projects & sets**
- **FR-035** — Projects and Sets MUST be **canonical named entities**: the system MUST expose the set of
  existing project/set names, and the docket/ingest path MUST attach an item to an existing name (offering a
  fuzzy-match against existing names) rather than minting a new group from free text, so near-duplicate groups
  ("cad-forge" vs "cadforge") are prevented.
- **FR-036** — The system MUST let the user **view existing** projects and sets and **rename** them; a rename
  MUST re-home every item under the old name to the new one with no orphaned items and no split group.
  *(Scope note: moving an individual item between sets in the UI is a non-goal — set membership is assigned at
  docket time and adjusted in bulk via rename, not per-item.)*
- **FR-037** — Delivering FR-035/FR-036 MAY require changes to the ingest CLI / MCP / API (a way to list
  canonical names and to rename/edit); those surfaces MUST stay in sync with the app's view of projects/sets
  (one source of truth for the name set).

**Briefs that embed cards**
- **FR-038** — A brief MAY embed review/decision cards it is about. The system MUST render those embedded cards
  **inline within the brief's reading flow** and MUST let the user answer each embedded card in place (recording
  answers exactly as FR-006), without leaving the brief.

### Key entities
- **Item** — a unit to act on. Common: id, title, source, submitted-at, blocking flag, read/archived state, an
  optional **project** label, and a kind ∈ {review, decision, brief}. Kind-specific payload as in FR-005/009/012.
- **Project** — a named grouping an item may belong to; the same label groups items identically on every
  surface. Not an entity of its own with state — it is a label carried on items and derived into groups.
- **Answer** — a recorded response to an item: the item id, the chosen option, an optional note, and when it was
  answered. Exists only for review/decision items.
- **Ticket** *(retired)* — the original design recorded "tell me more" as a separate consumable ticket. The
  shipped model records it instead as an **Answer** with `{action:'more'}` that resolves the card (see FR-015);
  no ticket entity exists.

---

## §Design principles (researched)

Distilled from a four-domain practitioner study (inbox/triage clients, brief/annotation viewers, decision
visualizers & trackers, review dockets). Each rule is checkable against the built UI. Full digests with all
source URLs: `Claude/vault-review-mobile/design-research.md` in the vault. Cross-verified unless tagged `[1src]`.

### D1 — Inbox & triage (the briefs surface, and the pending queue generally)
- **Unread = bold title + a leading accent dot; read drops to regular weight.** Bold weight is the primary
  unread signal (Gmail, Slack). Give unread its own emphasis, not just a subtle tint.
- **Auto-mark-read on open, but keep "mark unread" a first-class toggle both ways** (Gmail Shift-I/Shift-U).
  Don't overload unread as a hidden to-do flag — if a "come back to this" primitive is wanted, make it explicit
  (HEY's Reply-Later) rather than abusing unread. `[1src rationale]`
- **Archive is the default "clear it" verb, not delete** (Gmail `E`) — filed & still findable, not destroyed.
- **Prefer instant action + an Undo toast over a confirm modal** for anything reversible; reserve confirm
  dialogs for the truly irreversible. Confirmation-on-everything trains click-through.
- **Row shape is standardized: title + short preview + relative time**, adjustable density, with the group's
  unread **count badged on the container** (project/set row), not just the row.
- **Empty state ("all caught up") is a deliberate destination**, styled, not a blank list. (Already present.)
- **Optimistic UI**: render the action before the server confirms; the queue keeps moving, undo is the net.
- **Auto-advance focus after an action** and support bulk select for triage-at-scale (keyboard-first at the
  desk). Anti-pattern: forcing one unified stream when work genuinely splits by kind — hence the two lenses.

### D2 — Brief / long-form reading & annotation (the briefs reader)
- **Measure 45–75 chars per line (66 ideal); line-height 1.2–1.45; body 15–18px; cap width in `ch` not px**
  (Butterick, NN/g, iA Writer). The app's `.md-body` max-width:66ch honors this.
- **Never preserve source hard-wraps — always reflow paragraphs to the column** (every reader surveyed treats a
  single newline as a soft wrap). This is exactly the markdown-it `breaks:false` fix already shipped.
- **Left-align ragged-right; no justified body text** (rivers without hyphenation control).
- **For a long brief: a section outline / "on this page", a scroll-position indicator, sticky title.**
- **Read state as progress, not just binary**; don't auto-mark-read on ambient scroll — gate on deliberate open.
- **Embedded cards should be true inline containers in the reading flow** (Notion callout model), answerable in
  place — directly supports FR-038.
- **Annotations, if added later, anchor by quoted-text + offset (never offset alone)** so edits don't orphan
  them (Hypothesis/W3C). Keep comment (discussion) distinct from suggestion (tracked edit). `[future]`

### D3 — Decision visualizers & trackers (the five rich decision types)
- **Consistent, scannable option layout; surface only the differences that matter**, collapse identical
  attributes, and state the sort basis so position doesn't imply preference (NN/g).
- **Tradeoff matrix: options × criteria, baseline-relative stance (+/S/−, Pugh) beats absolute 1–10 scores.**
  Encode stance with **shape/icon + color, never color alone** (WCAG 1.4.1); cap criteria (~≤10) and scale
  granularity; flag the leading option but don't over-claim precision (gaps <~5% = a tie, not a winner).
- **Reversibility: make door-type (one-way/two-way) the visually dominant badge**, with **cost-to-reverse as a
  separate explicit field**, and the consequence list directly beneath — reading order type → cost → what-if.
- **Reasoning tree: color + a redundant channel for status** (chosen = bold border/check; pruned =
  dimmed/strikethrough), and **collapse pruned branches** as it grows rather than rendering the full tree.
- **Diff: side-by-side, emphasize only changed regions**, suppress unchanged context.
- **Critique: state the stage and the kind of feedback wanted up front**; match artifact fidelity to the stage.
- **Rationale & status: record why + alternatives-rejected; status lifecycle Proposed→Accepted→(Superseded|
  Deprecated); hide-don't-delete closed items; link a decision to what it affected** (ADR/RAID practice).

### D4 — Review docket & approval queue (the review surface)
- **Three first-class verbs: Approve / Reject(request-changes) / Comment-without-deciding.** Comment is an equal
  path, not a fallback — the shipped comment-only submit (FR-032) IS this pattern; keep it visually co-equal.
- **Decision + note are captured in one atomic submit** (GitHub's review modal), not two steps. (Already so.)
- **Queue rows show title + source/age + status; aging/staleness is a first-class signal**, and skip/defer is a
  distinct state from untouched — nothing rots silently.
- **Separate "needs me" from "mine/other"**; group by project/set explicitly (a flat cross-project queue stops
  scaling) — this is the by-project lens plus canonical groups (FR-033/035).
- **Batch then submit once** for multi-item passes; keyboard shortcuts (`j`/`k` list, one-letter actions) at
  volume; bulk approve/select for high-count triage.
- **State changes must always accompany a decision** — never approve-while-requesting-changes without moving
  state (Phabricator's named antipattern). The author/producer's queue is ground truth.
- **Anti-pattern: forcing a binary when feedback is the real intent** — the entire reason for the comment verb.

### D0 — Cross-cutting (house rules these reinforce)
- **Never encode status by color alone** (WCAG 1.4.1) — pair with icon/shape/label. Applies to stance cells,
  tree nodes, unread dots, blocking flags.
- **Separation by elevation/whitespace over borders** (house DESIGN.md) — already the app's token model.
- **One reserved accent** spent on meaning (pending/answered/blocking), not decoration.

---

## §Acceptance

```yaml
acceptance:
  - id: AC-001
    story: P1
    fr: [FR-001, FR-002]
    verification: Test
    given: "one review card in the shared store"
    when: "the app is opened at a desktop width and at a phone width"
    then: "both views show the same card id and the same title/description/options"
    grader:
      type: code
      config:
        assertions:
          - "desktop.card_ids == phone.card_ids"
          - "desktop.card['title'] == phone.card['title']"

  - id: AC-002
    story: P1
    fr: [FR-003]
    verification: Test
    given: "the app open"
    when: "the viewport is resized from desktop width to phone width"
    then: "the primary review controls (option buttons, note field) remain visible and operable"
    grader:
      type: code
      config:
        assertions:
          - "phone.option_buttons_visible == true"
          - "phone.note_field_operable == true"

  - id: AC-003
    story: P1
    fr: [FR-004]
    verification: Test
    given: "a request carrying no valid passphrase"
    when: "it asks for item content or posts an answer"
    then: "the request is refused and no content or write occurs"
    grader:
      type: code
      config:
        assertions:
          - "response.status == 401"

  - id: AC-004
    story: P1
    fr: [FR-005, FR-006]
    verification: Test
    given: "a review card with options [Approve, Reject]"
    when: "the user selects Approve with note 'looks good' and submits"
    then: "an answer {chosen: Approve, note: 'looks good'} is recorded in the shared store"
    grader:
      type: code
      config:
        assertions:
          - "store.answer(id).chosen == 'Approve'"
          - "store.answer(id).note == 'looks good'"

  - id: AC-005
    story: P1
    fr: [FR-007]
    verification: Test
    given: "a review card with options [Approve, Reject]"
    when: "an answer with chosen 'Maybe' is submitted"
    then: "the answer is rejected and nothing is recorded"
    grader:
      type: code
      config:
        assertions:
          - "response.status == 400"
          - "store.answer(id) == null"

  - id: AC-006
    story: P1
    fr: [FR-008]
    verification: Test
    given: "a review card that has already been answered"
    when: "the pending queue is fetched"
    then: "that card is not present in the pending set"
    grader:
      type: code
      config:
        assertions:
          - "id not in pending.card_ids"

  - id: AC-007
    story: P2
    fr: [FR-009, FR-010]
    verification: Test
    given: "a brief docketed with inline body in the lightweight-markup format containing a heading and a list"
    when: "the app renders the brief"
    then: "the heading and list appear as formatted structure, not raw markup"
    grader:
      type: code
      config:
        assertions:
          - "rendered.has_heading == true"
          - "rendered.has_list == true"
          - "'#' not in rendered.visible_text"

  - id: AC-008
    story: P2
    fr: [FR-010]
    verification: Test
    given: "a brief payload that carries both an inline body and a file reference"
    when: "it is ingested"
    then: "the brief is rejected for having more than one content source"
    grader:
      type: code
      config:
        assertions:
          - "ingest.rejected == true"

  - id: AC-009
    story: P2
    fr: [FR-011]
    verification: Test
    given: "a rendered brief"
    when: "the user marks it read/archived"
    then: "it clears from pending without any option-answer being required"
    grader:
      type: code
      config:
        assertions:
          - "id not in pending.card_ids"
          - "store.answer(id) == null"

  - id: AC-010
    story: P3
    fr: [FR-012]
    verification: Demonstration
    given: "one docketed item of each decision type (option-select, tradeoff, reversibility, reasoning-tree, diff, critique)"
    when: "each is opened in the app"
    then: "each renders its type-specific structure (e.g. tradeoff shows an options×criteria matrix; diff shows before and after)"
    grader:
      type: prompt
      config:
        rubric: "For each of the six decision types, the rendered card visibly presents that type's structure and is not a blank or fallback card. All six must pass."

  - id: AC-011
    story: P3
    fr: [FR-013]
    verification: Test
    given: "a tradeoff decision whose options include one labeled 'Option-A'"
    when: "the user chooses Option-A and submits"
    then: "an answer {chosen: Option-A} is recorded exactly as a review answer"
    grader:
      type: code
      config:
        assertions:
          - "store.answer(id).chosen == 'Option-A'"

  - id: AC-012
    story: P3
    fr: [FR-014]
    verification: Test
    given: "a tradeoff decision payload with fewer than 2 options"
    when: "it is ingested"
    then: "the item is rejected for failing its type's required fields"
    grader:
      type: code
      config:
        assertions:
          - "ingest.rejected == true"

  - id: AC-013
    story: P1
    fr: [FR-015]
    verification: Test
    given: "a pending card"
    when: "the user taps 'tell me more'"
    then: "the card clears from pending and an outcome {action:'more'} is recorded for its id"
    grader:
      type: code
      config:
        assertions:
          - "id not in pending.card_ids"
          - "store.answer(id).action == 'more'"

  - id: AC-014
    story: P1
    fr: [FR-016]
    verification: Test
    given: "a card resolved via 'tell me more'"
    when: "the producer pulls recorded outcomes from the shared store"
    then: "the pulled outcomes include {id, action:'more'} and the id is not presented as pending"
    grader:
      type: code
      config:
        assertions:
          - "any(a.id == id and a.action == 'more' for a in pulled_outcomes)"
          - "id not in pending.card_ids"

  - id: AC-015
    story: P1
    fr: [FR-017]
    verification: Test
    given: "an unanswered card with id X showing description 'v1'"
    when: "an item with the same id X and description 'v2 expanded' is ingested"
    then: "the pending card for X now shows 'v2 expanded' and is still unanswered"
    grader:
      type: code
      config:
        assertions:
          - "pending.card(X).description == 'v2 expanded'"
          - "store.answer(X) == null"

  - id: AC-016
    story: P2
    fr: [FR-018]
    verification: Test
    given: "one item of each kind (a review, a brief, and a decision) submitted through the ingest path"
    when: "the store is read"
    then: "all three kinds are present in the shared store"
    grader:
      type: code
      config:
        assertions:
          - "store.has_kind('review') and store.has_kind('brief') and store.has_kind('decision')"

  - id: AC-017
    story: P1
    fr: [FR-019]
    verification: Test
    given: "an item whose body contains a CUI/NASA-internal marker string"
    when: "it is pushed through the ingest path"
    then: "the push is refused, the item never reaches the shared store, and the refusal is reported"
    grader:
      type: code
      config:
        assertions:
          - "push.rejected == true"
          - "store.has(id) == false"

  - id: AC-018
    story: P1
    fr: [FR-020, FR-027]
    verification: Test
    measure:
      metric: p95_visible_after_docket_s
      threshold: 10
      op: "<="
      condition: "single item, normal network, no server restart"
    grader:
      type: code
      config:
        assertions:
          - "p95(visible_after_docket_s) <= 10"

  - id: AC-019
    story: P1
    fr: [FR-021]
    verification: Test
    given: "a review card answered Approve in the app"
    when: "the producer pulls recorded answers from the shared store"
    then: "the pulled answers include {id, chosen: Approve}"
    grader:
      type: code
      config:
        assertions:
          - "any(a.id == id and a.chosen == 'Approve' for a in pulled_answers)"

  - id: AC-020
    story: P1
    fr: [FR-022]
    verification: Analysis
    given: "two different items answered at nearly the same time"
    when: "both answers are written to the shared store"
    then: "both recorded answers survive; neither is lost to the other's write"
    grader:
      type: code
      config:
        assertions:
          - "store.answer(id_a) != null and store.answer(id_b) != null"

  - id: AC-021
    story: P1
    fr: [FR-023, FR-024]
    verification: Test
    given: "a review card, a decision, and a brief all docketed under project 'apollo'"
    when: "each surface (review, decide, briefs) is opened"
    then: "on every surface the item appears under a group labeled 'apollo', and the group label is identical across surfaces"
    grader:
      type: code
      config:
        assertions:
          - "review.group_of(id) == 'apollo'"
          - "decide.group_of(id) == 'apollo'"
          - "briefs.group_of(id) == 'apollo'"

  - id: AC-022
    story: P1
    fr: [FR-024]
    verification: Test
    given: "one item with project 'apollo' and one item with no project"
    when: "the board is rendered"
    then: "the no-project item is shown ungrouped above the 'apollo' group"
    grader:
      type: code
      config:
        assertions:
          - "board.ungrouped_ids contains the no_project_id"
          - "board.index_of(no_project_id) < board.index_of('apollo group')"

  - id: AC-023
    story: P1
    fr: [FR-025]
    verification: Test
    given: "a pending item of any kind on the active board"
    when: "the user taps Archive on it"
    then: "the item leaves the active board in one action and is absent from a subsequent pending fetch"
    grader:
      type: code
      config:
        assertions:
          - "id not in pending.card_ids"
          - "store.item(id).archived == true"

  - id: AC-024
    story: P1
    fr: [FR-026]
    verification: Test
    given: "a pre-existing desktop-only brief in the prior local store, under project 'legacy'"
    when: "the migration import is run and the app is opened"
    then: "that brief appears on the unified app under the 'legacy' group"
    grader:
      type: code
      config:
        assertions:
          - "store.has(legacy_brief_id) == true"
          - "briefs.group_of(legacy_brief_id) == 'legacy'"

  - id: AC-025
    story: P2
    fr: [FR-028]
    verification: Test
    given: "a brief currently marked read"
    when: "the user toggles it to unread, then re-fetches on another device"
    then: "the brief shows as unread on both devices and is visually distinguished as unread"
    grader:
      type: code
      config:
        assertions:
          - "store.item(id).read == false"
          - "other_device.brief(id).unread_styled == true"

  - id: AC-026
    story: P1
    fr: [FR-030]
    verification: Inspection
    given: "the app chrome on any surface"
    when: "the top-right region is inspected"
    then: "a theme toggle icon is present there and flips between light and dark when activated"
    grader:
      type: code
      config:
        assertions:
          - "chrome.top_right.has_theme_toggle_icon == true"
          - "after_toggle.theme != before_toggle.theme"

  - id: AC-027
    story: P1
    fr: [FR-031]
    verification: Inspection
    given: "the app chrome on any surface"
    when: "the top-left region is inspected"
    then: "it does not contain redundant static 'review'/'decide'/'briefs' surface-name label text"
    grader:
      type: code
      config:
        assertions:
          - "chrome.top_left.has_redundant_surface_label == false"

  - id: AC-028
    story: P1
    fr: [FR-032]
    verification: Test
    given: "a review card with options [Approve, Reject]"
    when: "the user types a comment 'needs a second pass' and submits with no option selected"
    then: "the card clears from pending and an outcome {chosen: null, comment: 'needs a second pass'} is recorded"
    grader:
      type: code
      config:
        assertions:
          - "id not in pending.card_ids"
          - "store.answer(id).chosen == null"
          - "store.answer(id).comment == 'needs a second pass'"
          - "empty_comment_submit.rejected == true"

  - id: AC-029
    story: P1
    fr: [FR-033, FR-034]
    verification: Test
    given: "a review, a decision, and a brief all under project 'apollo'"
    when: "the user views the by-project lens for 'apollo' and then the by-kind lens"
    then: "the by-project view lists all three items together; the by-kind view lists each under its kind; the underlying item set is identical"
    grader:
      type: code
      config:
        assertions:
          - "set(by_project['apollo'].ids) == set(by_kind.all_ids_for('apollo'))"
          - "by_kind.has_section('review') and by_kind.has_section('decide') and by_kind.has_section('briefs')"

  - id: AC-030
    story: P1
    fr: [FR-035]
    verification: Test
    given: "an existing canonical project 'cad-forge'"
    when: "an item is docketed with the near-duplicate project text 'cadforge'"
    then: "the item attaches to the existing 'cad-forge' group and no new near-duplicate project group is created"
    grader:
      type: code
      config:
        assertions:
          - "store.item(id).project == 'cad-forge'"
          - "'cadforge' not in board.project_names"

  - id: AC-031
    story: P1
    fr: [FR-036]
    verification: Test
    given: "a set 'Viewer UX' with two items under project 'cad-forge'"
    when: "the set is renamed to 'Viewer'"
    then: "both items now sit under 'Viewer', no item remains under 'Viewer UX', and the group is not split"
    grader:
      type: code
      config:
        assertions:
          - "all(store.item(i).set == 'Viewer' for i in the_two_ids)"
          - "'Viewer UX' not in board.set_names_for('cad-forge')"

  - id: AC-032
    story: P2
    fr: [FR-038]
    verification: Demonstration
    given: "a brief that embeds one review card"
    when: "the brief is opened"
    then: "the embedded review card renders inline within the brief and can be answered in place without leaving the brief"
    grader:
      type: prompt
      config:
        rubric: "The embedded review card is visible inside the brief's body (not a separate screen), shows its options, and answering it records an answer while the brief stays open."
```
