# Backburner

<!-- agent-harness:intake:v1:start -->
## Intake - filed by agents working on other projects

> An agent that finds something wrong here while working elsewhere records it and does
> not fix it. This block is where those records land; this project's own agent triages
> them, promotes what it takes into TASK.md, and deletes nothing to make a count look
> better. Written by `Add-ProjectIntake.ps1` -- add items with that tool rather than by
> hand, so the id-collision check and the format actually hold.

### docket-cli-create-does-not-inline-brief-src-20260810

**docket-cli.js create pushes a brief card without resolving its src into a body, so the documented brief-push route produces an empty card on the board**

- **Filed** 2026-08-10 by an agent working on agent-harness -- pushing the Every Skill Available brief under DOCKET-PROTOCOL Briefs
- **Relationship** defect - **Value** high - **Risk** low
- **Evidence** verifier=command; subject=a brief card pushed through docket.ps1 create with only a src path came back from the cloud board with no body and no format field; result=verified; reference=docket-cli.js

DOCKET-PROTOCOL.md's Briefs section documents the brief push as: "pass the note's `src` path and the
cloud inlines the file at push time (it cannot read local paths) while keeping the path as a copyable
chip." That is true of enqueue.js -- resolveBriefBody at enqueue.js:34-44 reads the src file into
`body`, sets `format` from the extension, moves the path to `filepath` and deletes `src`. It is not
true of docket-cli.js `create`, which pushes the card verbatim.

The two halves of the break:

1. enqueue.js can no longer authenticate. Running `node enqueue.js --public --file card.json` on
   2026-08-10 returned: "REVIEW_SECRET is required through the approved Bitwarden Secrets Manager
   broker: Invoke-WithBitwardenSecret.ps1 -CommandId <approved-command-id>; the docket-sync command
   authorizes sync-cloud.js only". The broker allowlist registers docket-sync (sync-cloud.js),
   docket-admin (docket-cli.js --from-request) and docket-align-vercel-secret. There is no tuple for
   enqueue.js, so the only working cloud push path is docket.ps1 -> docket-admin -> docket-cli.js.

2. docket-cli.js create does not resolve src. Pushing a brief card whose only content was a `src`
   path produced a cloud card carrying that raw local path, no `body` and no `format` -- confirmed by
   reading it back with `docket.ps1 "get <id>"`. The board cannot read a local path, so the brief
   rendered with nothing in it. The workaround was to inline the markdown into `body` by hand and
   re-push under the same id.

Suggested fix: have docket-cli.js `create` (and `update`) call the same resolveBriefBody logic, or
export it from a shared module both entry points use. Either way one function owns the rule instead
of one of the two entry points knowing it.

Filed by the agent-harness session that hit it while pushing the "Every Skill Available" brief. Not
fixed here, per the cross-project ownership rule in AGENTS.md.

### cloud-kit-rollout-prerequisite-20260811

**Enroll docket in the shared hosted-agent cloud kit**

- **Filed** 2026-08-11 by an agent working on agent-harness cloud rollout routing 2026-08-11
- **Relationship** prerequisite - **Value** high - **Risk** medium
- **Evidence** verifier=inspection; subject=.agents/cloud is absent and the shared rollout registry assigns project-owned enrollment; result=verified; reference=AGENTS.md

<!-- agent-harness:intake:v1:end -->
