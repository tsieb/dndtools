# ADR-025: Agentic Multi-Step Assistant Runs & Expanded Staged Write Surface

- Status: Accepted
- Date: 2026-07-15
- Deciders: Engineering
- Consulted: Product, Design, Security, QA
- Supersedes: N/A
- Amends: ADR-021 — ADR-021 shipped the client-side BYO-key transport and wired the assistant as a
  single bounded ask. This ADR keeps that transport unchanged but (a) turns the assistant into an
  **autonomous multi-step run** the user starts with one prompt, (b) **expands the staged MCP write
  surface** so the model has real work to do, and (c) corrects the staged-write payload to match the
  direct-write path. It relaxes no safety rule — every model write is still a staged proposal a human
  approves (ADR-002), and the Processing-Core AI boundary (`mcp/ai-boundary.ts`: AI proposes, never
  disposes) is reaffirmed.
- Amended by: ADR-031 (2026-09-04) — the expanded staged write surface gains
  `widget.package.propose`. It is restricted to `template`-runtime drafts (a model may not author
  `custom-html-js`), carries `authoring.source = 'generated'` provenance, and its approval installs
  an unreviewed package that still needs a per-permission `widget.package.review`.

## Context

After ADR-021 the model could _talk_ to the vault through the fail-closed MCP pipeline, but the
baseline registry exposed only two write tools (`note.create`, `create_scene_card`). It could not
create a character, generate and save a table, or revise a note — so it could not "work through" the
multi-step creative tasks a DM actually wants (build a level-N NPC, roll up a random table). The UI
also returned the whole exchange in one batch behind a bare "Thinking…" badge and capped at six tool
passes, which is too little feedback and too little budget for an autonomous run.

The product decision is that these multi-step processes are **opaque and agentic**: the user prompts
once, and the model independently exchanges with the provider over many passes — reading the vault,
reasoning, and staging writes — with no dedicated step-wizard UI. The job of the platform is to give
the model a rich, well-described, fail-closed tool surface and to keep the user informed while it runs.

## Decision

1. **Expanded staged write tools** (`packages/core/src/mcp/tool-registry.ts`), each `kind:'write'`,
   `durable`, and carrying **no `visibility`** argument so an agent-authored write fails closed to
   `dm-only`. Each binds to an EXISTING command (no new mutation path) and ships a rich `description`
   telling the model how to work through the task:
   - `table.create` → `content.create-item`, producing a rollable `dice-table` Vault Object
     (`fields[{subtype:'dice-table'}], dice, entries` — the exact shape `readDiceTable` draws). Its
     schema admits only `1dN` (1–100) with exactly N rows, so an invalid table is denied before staging.
   - `character.create` → `character.quick-create` (npc/monster/sidekick); the model assembles the
     complete level-N statblock across its reasoning and stages ONE proposal.
   - `note.update` → `content.update-item` (title/body revision only), requiring the current
     `baseRevision` so approval records a conflict instead of overwriting a newer human edit.
     A new optional `description` field on `McpToolDefinition` feeds the model spec via
     `buildAiToolSpecs`. **Deferred:** agentic _leveling of an existing PC_ (the advancement command
     trio needs applied intermediate state, which a single-run staged proposal cannot provide).

2. **Staged payload now equals the mapped command payload** (`packages/core/src/mcp/agent-dispatch.ts`).
   Previously the staged path stored the raw validated tool input while the direct-write path applied
   `writeCommandPayload`; approval re-dispatches `proposal.payload` verbatim, so a tool whose input
   differs from its command payload (like `table.create`) would have staged an un-dispatchable payload.
   Staging now applies the SAME `writeCommandPayload` transform — identity for the baseline tools,
   correct for the mapping tools. This is a latent-bug fix, not a behavior change for shipped tools.

3. **Streaming, cancellable, longer agent loop** (`apps/gm-react/src/ai/mcpBridge.ts`). The exchange
   emits a live event stream (`onEvent`: run status transitions + each display event as it happens),
   accepts an `AbortSignal` (cancel between passes), raises the default budget 6 → 16 passes, and
   surfaces the Core's structured validation issues so the user watches the model self-correct. The
   run resolves with a terminal status (`completed | failed | cancelled | budget-exhausted`) and never
   rejects (event-observer failures are isolated). When the tool budget is exhausted, pending calls
   receive explicit budget errors and the model gets one final tools-disabled turn, so the transcript
   closes with an assistant summary. The transport (`transport.ts`) is untouched.

4. **Start→completion protocol in the existing panel** (`Settings.tsx`, `AiAssistantPanel`). No new
   screen. A skeleton stands in for the pending answer while the model works; a phase line shows
   "working · step k · <tool>"; a Cancel button aborts; and a completion toast (plus an opt-in,
   permission-gated web `Notification`) fires on the terminal state. Notification opt-in persists only
   after permission is granted. The built-in assistant passes Core's `forceStageWrites` restriction, so
   even a selected `trusted_direct` agent binding produces proposals here. Staged proposals land in the
   existing review panel.

5. **Guided provider onboarding + local model** (`AiProviderPanel`). Connect cards for Anthropic,
   OpenAI, Google Gemini (OpenAI-compat endpoint), OpenRouter, and a **local Ollama** runner
   (`http://localhost:11434/v1`, allowed by `validateAiBaseUrl` for dev loopback), with an
   user-initiated detect probe (opening Settings performs no loopback request). A headless smoke harness
   (`scripts/ai-agent-smoke.ts`) drives the REAL Core
   pipeline against live Ollama and asserts staged, schema-valid proposals.

## Consequences

- The model can complete genuinely multi-step creative tasks, and every result is a staged, DM-approved
  change — the AI-boundary contract is preserved and strengthened by more capable but still fail-closed
  tools.
- Agent policies remain exact allowlists: adding to `MCP_BASELINE_TOOL_IDS` does not silently grant new
  tools to a persisted agent. Settings shows partial baseline membership and lets the DM explicitly add
  the missing baseline ids while preserving non-baseline grants.
- The invariant is now explicit: **an MCP write tool's `writeCommandPayload` output IS the payload both
  the staged and direct paths dispatch.** New write tools must map input → a valid command payload there.
- Cancellation is between-pass (the transport takes no signal), so an in-flight request completes before
  the loop stops. Threading a signal into the transport is a future option.
- The local Ollama origin is only network-authorized in dev / via `VITE_AI_ALLOWED_ORIGINS` / the
  Electron `allowAiOrigin` bridge — surfaced in the Ollama card copy so a hosted build fails honestly.

## Amendment — RC-AI-1.2 as built (2026-09-05)

Six more staged write tools land on the same contract (`kind:'write'`, `durable`, **no `visibility`
argument** ⇒ fail closed to `dm-only`, each bound to an EXISTING command, each with a model-facing
`description`):

- `encounter.create` → `encounter.build`. Combatant selection, party context, terrain notes,
  legendary/lair actions, loot. It forwards `sessionLogLinks: []` (an agent cannot bind vault
  references) and never takes a difficulty — the core computes the challenge guidance itself.
- `quest.create` → `content.create-item`, producing a `quest` Vault Object (`status` plus
  `{id, text, done}` objectives). Objective ids are index-derived, keeping the mapping pure.
- `faction.create` → `content.create-item`, producing a `faction` dossier. `secret` is the subtype's
  DM-only field, so it stays redacted from players even if the DM later shares the note.
- `map.poi.create` → `map.create-poi`, in normalized (0..1) map space. `layerId` is optional.
- `scene.card.update` → `scene-card.update`. Title/mood/flavor only; the command cannot change
  visibility at all, and hero-image/audio refs are never forwarded.
- `note.append` → `content.update-item`. Appends rather than replaces, so a model adding to a long
  note cannot silently drop the DM's prose.

**`writeCommandPayload` is now state-aware and fallible.** Two of these tools resolve their payload
against current state — `note.append` needs the note's present body and revision, `map.poi.create`
needs a layer on the target map — so the mapper's signature becomes
`(state, tool, actorId, input) → {ok:true, payload} | {ok:false, message}`. It reads state ONLY
through the actor-filtered queries (`getContentItemDetailForActor`, `getMapViewForActor`), so it
confers no authority: an agent can only touch what its bound actor may already see, and the bound
command still re-validates and re-checks authority at dispatch. A failed resolution denies with the
same generic `invalid-input` envelope a schema failure produces, and a hidden target is
indistinguishable from a missing one — the write surface is not an existence probe. Both the direct
path (`invokeMcpTool`) and the staged path (`invokeMcpToolAsAgent`) go through it, so the ADR's
staged-equals-direct invariant above still holds.

`note.append` snapshots the note's revision as `baseRevision` at STAGING time. A human edit landing
before approval therefore records a `content.item-conflict` rather than clobbering the newer text —
the same conflict posture as `note.update`.

**Not covered by the live-model smoke harness:** `map.poi.create`, `scene.card.update`, and
`note.append` all need a seeded vault (a map, a card, a note) that the harness's empty headless state
does not have. They are covered by dedicated core tests instead
(`packages/core/tests/mcp-agent-write-tools.test.ts`); the three creation tools that work from an
empty vault gained smoke scenarios.
