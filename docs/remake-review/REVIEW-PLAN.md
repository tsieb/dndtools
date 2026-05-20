# Remake Review — Extraction & Requirements Plan (v2)

**Purpose:** Systematically produce the full context package for remaking DND Tools as version
0.2.0 — a canvas-first, cloud-native, multi-user TTRPG platform. Outputs are markdown documents
in `docs/remake-review/`.

**Status:** Groups 1 and 2 (v1 extraction) were completed prior to this plan revision. All
extraction documents (`01` through `07`) exist and are considered done. The v2 vision brief
(`00`) was written in the same session as this revision. Remaining work starts at Group 0 below.

**Important:** Documents `01`–`07` were written against the v1 extraction frame. They do not
reflect the v2 vision changes. They are used as source material — read through the v2 lens during
requirements writing, not as authoritative v2 statements.

---

## How to Make Requirements Effective — Method

Before running any steps, read this. Poor requirements are the most common cause of rework.

### Rule 1: Vocabulary before requirements

Requirements written before terms are defined are ambiguous by construction. The first step
(Group 0) produces a shared glossary. No feature requirement is written until every noun in it
exists in the glossary.

### Rule 2: Role actions, not system capabilities

Weak: *"The system shall support layer visibility toggling."*
Strong: *"The DM shall be able to toggle the visibility of any named layer on an active map
without affecting other layers or interrupting player view."*

Write requirements as: **[Role] shall be able to [action] [object] [under conditions] [with
observable result].**

System-level framing (`The system shall...`) is reserved for NFRs, constraints, and interface
contracts that have no single role actor.

### Rule 3: Architecture requirements precede feature requirements

The cloud/sync model, the widget interface contract, the role permission model, and the
processing/display decoupling contract are not features — they are constraints on every feature.
Group 2 produces these before Group 3 writes any feature requirement.

### Rule 4: Capability trees, not flat lists

Every requirement belongs to a tree: **Domain → Capability → Sub-capability → Requirement.**
This makes gaps visible. If a domain has no requirements below a certain depth, it's underspecified.

### Rule 5: Compatibility matrix

Every feature requirement is checked against four compatibility questions:

| Check | Question |
|---|---|
| Offline | Does this work with no network? Or degrade gracefully? |
| Multi-user | Does this compose with concurrent DM + player access? |
| Mobile | Can a slimmed mobile GUI express this? |
| Player mode | Is DM-only content correctly hidden? |

Requirements that fail a check without an explicit exception noted are incomplete.

### Rule 6: Acceptance criteria are not descriptions

Each requirement has 2–5 acceptance criteria that are binary pass/fail tests. They describe
how you would verify the requirement is met — not what the requirement means.

Weak AC: *"Layer visibility works correctly."*
Strong AC: *"Given a map with three named layers, when the DM hides Layer B, then Layer B
elements are invisible on DM view and player view, and Layer A and Layer C are unaffected."*

### Rule 7: Prioritize with honest stakes

Use three tiers only:

- **Must-have:** App cannot ship without it. Failure here means the product doesn't work.
- **Should-have:** Meaningfully degrades the product but it still ships. Fix in early releases.
- **Nice-to-have:** Genuine enhancement. Only built after must-haves are solid.

Avoid inflating must-have. If you're tempted to call everything must-have, you have not
done the prioritization work.

---

## Output Documents

| File | Status | Contents |
|---|---|---|
| `00-vision-brief.md` | ✅ Done | Canonical v2 direction |
| `01-project-overview.md` | ✅ Done | v1 scope, constraints, user roles, phase plan |
| `02-tech-stack.md` | ✅ Done | v1 stack analysis |
| `03-architecture.md` | ✅ Done | v1 architecture and boundary audit |
| `04-data-model.md` | ✅ Done | v1 data model and schema history |
| `05-feature-inventory.md` | ✅ Done | v1 feature audit including MCP tools |
| `06-ci-cd.md` | ✅ Done | v1 CI/CD and pipeline audit |
| `07-known-defects.md` | ✅ Done | v1 defects, debt, failure mode taxonomy |
| `08-glossary.md` | **Next** | Canonical v2 vocabulary — every term defined before requirements |
| `09-architecture-contracts.md` | Pending | Cloud model, widget contract, role permissions, sync protocol |
| `10-requirements.md` | Pending | Complete atomic requirements |
| `11-lessons-learned.md` | Pending | What worked, what to change, v2 starting principles |

---

## ✅ Completed — Groups 1 & 2 (v1 Extraction)

The following was completed prior to this plan revision. No further action required.

**Group 1 — v1 Source Reads (parallel):**
- 1-A: Project scope and overview → `01-project-overview.md`
- 1-B: Technology stack audit → `02-tech-stack.md`
- 1-C: Architecture and boundary audit → `03-architecture.md`
- 1-D: Data model audit → `04-data-model.md`
- 1-E: CI/CD and tooling audit → `06-ci-cd.md`
- 1-F: Defects and debt audit → `07-known-defects.md`

**Group 2 — v1 Feature Inventory (parallel):**
- 2-A: Feature inventory by domain → `05-feature-inventory.md`
- 2-B: MCP tool inventory → folded into `05-feature-inventory.md`

---

## Group 0 — Glossary (Do First, Do Not Parallelize)

This group must complete before any other group starts. It produces the vocabulary that all
requirements depend on.

### 0-A · Glossary of v2 Concepts

**Read:**
- `00-vision-brief.md`
- `docs/GLOSSARY.md` (v1 terms — carry forward, redefine, or retire)
- `05-feature-inventory.md` (scan for domain nouns used in feature descriptions)
- `04-data-model.md` (entity names that carry into v2)

**Produce:** `08-glossary.md`

Define every term used in the vision brief and anticipated in requirements. Include:

- **Scene / Canvas** — define the chosen name, what it is, what it contains
- **Widget** — definition, data contract shape, lifecycle
- **Command Center** — definition, relationship to canvas
- **Workspace** — if different from canvas, define it
- **Vault** — definition (unchanged? extended?)
- **DM / Player / Observer** — role definitions with capability summary
- **Session** — what constitutes an active session
- **Embed** — when something is embedded vs. linked
- **Layer** (map context) — definition, types
- **Nested map** — definition, containment rules
- **Sync source** — Obsidian vault / Google Docs / local — how each is described
- **Agent** — MCP agent vs. AI agent vs. local agent — disambiguate
- **Handout** — what a handout is in v2
- **Player view** — definition, relationship to canvas
- **Override** (DM context) — what constitutes a DM override on player data
- **Permission grant** — a record assigning a capability set to a specific player on a specific entity
- **Capability set** — a named group of allowed write operations on a specific entity type
- **Ownership** — the `owner` capability set on a character; who "plays" it
- **Visibility** (vs. permission) — whether content appears in a player's view at all; distinct from whether they can write to it
- Any other terms that appear more than twice in the vision brief

Each entry format:
```
### [Term]
**Definition:** One clear sentence.
**Scope:** When this term applies (e.g., "map context only").
**Related:** Other terms it is often confused with or paired with.
**v1 equivalent:** The v1 term it maps to, if any. "New in v2" if none.
```

## Group 3 — Architecture Contracts (Prerequisite for Requirements)

Depends on Group 0 completing. This is the most important prerequisite for requirements quality.
Do not skip or abbreviate.

### 3-A · v2 Architecture Contracts

**Read:**
- `00-vision-brief.md`
- `08-glossary.md` (output of Group 0)
- `03-architecture.md` ✅ (completed)
- `04-data-model.md` ✅ (completed)
- `05-feature-inventory.md` ✅ (completed — review entity/state ownership patterns)
- `02-tech-stack.md` ✅ (completed — review sync/rendering technology notes)

**Produce:** `09-architecture-contracts.md`

This document defines the four foundational contracts that all feature requirements must
be compatible with. Each contract is a set of binding rules, not aspirations.

#### Contract 1: Processing / Display Decoupling

Define:
- The exact boundary between "processing core" and "GUI layer"
- What the processing core exposes (state shape, event types, command API)
- What the GUI layer is allowed to know (it reads state, dispatches commands — nothing else)
- How platform-specific GUI profiles are selected at runtime
- What "simplified for slimmer devices" means in concrete terms

#### Contract 2: Cloud Sync & Offline Model

Define:
- Local-first invariant: exactly what the app can do with zero network
- Sync unit: what is the smallest thing that gets synced (note? field? operation?)
- Conflict model: what happens when two users edit the same note simultaneously
- Sync source contract: the interface that Obsidian sync and Google Docs sync must implement
  (so a third source can be added without architectural changes)
- Cloud storage model: what lives in cloud vs. what is device-local only

#### Contract 3: Role, Visibility & Permission Grant Model

The permission model has two independent axes that must both be specified:

**Axis 1 — Visibility** (content-level, affects all viewers equally):
- Define the three visibility states: `dm-only`, `player-visible`, `shared`
- Define where visibility is evaluated: at the data/storage layer before any UI render
- Define how visibility is authored: per-entity, per-section, per-field (for structured entities)
- Define the DM override mechanism: how a DM field value differs from the underlying player value

**Axis 2 — Permission grants** (player-specific, additive over their base role):
- Define the **capability set** pattern: what a capability set is, how it maps to a set of
  writable fields or allowed operations on a specific entity type
- Define which entity types have capability sets and what sets each type supports at minimum:
  - Character: `owner`, `combat-participant`, `backstory-editor`, `viewer`
  - Note/section: `section-editor`, `contributor`, `viewer`
  - Widget: `manager`, `operator`, `viewer`
  - Canvas: `co-editor`, `viewer`
  - Timer/tool widget: `operator`, `viewer`
- Define the **grant record** structure: `{ entityId, entityType, playerId, capabilitySet }`
- Define grant inheritance rules: e.g., `owner` on a character implies `combat-participant`
- Define the DM's always-present override: the DM bypasses all capability set restrictions
- Define the enforcement layer: grants are evaluated at the data/storage layer, not the UI
- Define the session join model: how a player authenticates into a session and receives their
  role + any grants

**Distinguish clearly:**
- Visibility answers "can this player see this content at all?"
- Permission grant answers "can this specific player write to or interact with this content?"
- These are independent: a player can have write permission on content they cannot see without
  a visibility grant (edge case — flag as a consistency requirement)

**Sustainability constraints to define:**
- Capability sets are defined per entity type in the system schema, not freely authored per
  instance — this prevents combinatorial configuration explosion
- The DM's grant UI must present capability sets as named options, not raw field checkboxes
- A player's total permission surface at any moment must be computable from:
  `base_role_permissions ∪ (all active grants for this player)`

#### Contract 4: Widget / Canvas Interface

Define:
- Widget definition: what a widget is, what it must implement
- Widget data contract: how a widget reads entity data (character HP, map state, etc.)
- Widget lifecycle: create / configure / display / destroy
- Canvas state: what a canvas persists (layout only? widget state too?)
- Embed rules: when something is embedded vs. linked vs. projected

---

## Group 4 — Requirements

Depends on Group 3 completing. This is a single sequential step — requirements are
interdependent and cannot be written in parallel without creating conflicts.

### 4-A · Complete Requirements Document

**Read before writing:**
- `00-vision-brief.md`
- `08-glossary.md` (output of Group 0)
- `09-architecture-contracts.md` (output of Group 3)
- `01-project-overview.md` ✅
- `05-feature-inventory.md` ✅
- `07-known-defects.md` ✅
- `docs/development/ACCESSIBILITY.md`
- `docs/architecture/SECURITY.md`
- `docs/development/UX_GUIDELINES.md`

**Produce:** `10-requirements.md`

**Apply all seven quality rules from the Method section above.**

After writing all requirements, run the compatibility matrix:
- For every Must-have feature requirement: confirm offline / multi-user / mobile / player-mode
  behavior is either specified or noted as "DM-only, not applicable"
- Any requirement that fails without a noted exception is incomplete — fix before finalizing

**Domain taxonomy and ID prefixes:**

```
CANVAS-xxx   Canvas, scene management, widget system
CMD-xxx      Command Center
MAP-xxx      Map creation, layers, nesting, POIs
CHAR-xxx     Character suite (PC creation, DM quick-create, widget bindings)
SES-xxx      Session tools (combat, dice, handouts, timers)
CONTENT-xxx  Notes, editor, templates, snippets
GRAPH-xxx    Link graph, backlinks, Obsidian navigation
SRCH-xxx     Search and discovery
SYNC-xxx     Cloud sync, Obsidian sync, Google Docs sync
COLLAB-xxx   Collaboration, player sessions, real-time state
PERM-xxx     Permission grants, capability sets, ownership, visibility enforcement
AUDIO-xxx    Audio, atmosphere, scene ambiance
MCP-xxx      MCP tools, AI agent integration
PLAT-xxx     Platform shell (desktop, mobile, web), vault config, persistence
NAV-xxx      Navigation, information architecture
A11Y-xxx     Accessibility
SEC-xxx      Security, permissions, IPC isolation
PERF-xxx     Performance budgets and constraints
CON-xxx      Hard constraints (things the system must never do)
```

**Each requirement entry:**
```
### [ID]
**Statement:** [Role] shall be able to [action] [object] [under conditions] [with result].
**Source:** [vision section / defect ID / ADR / v1 feature]
**Priority:** Must-have / Should-have / Nice-to-have
**Compatibility:** Offline: [yes/no/degrade] | Multi-user: [yes/no/dm-only] | Mobile: [yes/slim] | Player-safe: [yes/dm-only]
**Acceptance criteria:**
- Given [context], when [action], then [observable result].
- Given [context], when [edge case], then [observable result].
**Notes:** (optional)
```

**Minimum requirement counts:**

| Domain | Min |
|---|---|
| CANVAS | 12 |
| CMD | 8 |
| MAP | 15 |
| CHAR | 12 |
| SES | 10 |
| CONTENT | 10 |
| GRAPH | 8 |
| SRCH | 8 |
| SYNC | 10 |
| COLLAB | 10 |
| PERM | 10 |
| AUDIO | 6 |
| MCP | 10 |
| PLAT | 10 |
| NAV | 8 |
| A11Y | 8 |
| SEC | 8 |
| PERF | 6 |
| CON | 5 |
| **Total** | **≥ 174** |

---

## Group 5 — Lessons & Principles

Depends on Group 4 completing.

### 5-A · Lessons Learned & v2 Starting Principles

**Read:**
- `00-vision-brief.md`
- `07-known-defects.md` ✅
- `06-ci-cd.md` ✅
- `03-architecture.md` ✅
- `10-requirements.md` (output of Group 4)

**Produce:** `11-lessons-learned.md`

Structure:
1. **What worked well** — specific decisions from v1 that proved sound and should carry forward
2. **What to change** — specific decisions that caused the most rework, bugs, or user-facing
   problems, with the recommended v2 alternative
3. **Architecture regrets** — the 3–5 decisions in v1 that caused the most downstream pain
4. **Process failures** — what in the development process (not code) created problems
5. **v2 Starting Principles** — 10–15 short, opinionated, non-obvious principles that encode the
   key lessons. These should be the kind of rules that a developer joining the project in week 2
   would not automatically follow without being told.

   Example format:
   > **Principle:** The canvas owns layout; widgets own data. Never let a widget make layout
   > decisions and never let the canvas own entity state.
   >
   > **Why:** In v1, SessionBoard mixed layout and state which made testing, persistence, and
   > syncing all harder than they needed to be.

---

## Execution Notes

**Remaining sequence:**
1. **Group 0** — Glossary (`08-glossary.md`). Blocking. Nothing else starts until this is done.
2. **Group 3** — Architecture contracts (`09-architecture-contracts.md`). Blocking. Requirements
   written before contracts are in place will need revision.
3. **Group 4** — Requirements (`10-requirements.md`). The primary output of this entire effort.
4. **Group 5** — Lessons learned (`11-lessons-learned.md`). Can be deferred if time runs short.

**Quality rules:**
- Do not resolve conflicting requirements silently — flag the conflict explicitly.
- Every Must-have requirement must have a filled compatibility row before the doc is final.
- When a source document (from the completed 01–07 set) contradicts `00-vision-brief.md`,
  the vision brief wins. Note the conflict in a comment if it represents a meaningful gap.

**Scope reminder:** Documents `01`–`07` were written against the old v1 frame. Treat them as
evidence and raw material, not as authoritative v2 statements. The v2 direction lives in
`00-vision-brief.md`.
