# Planning Tiers — Goal Hierarchy and Work Decomposition

This document defines the five-tier hierarchy used to describe, track, and decompose project goals in DND Tools. The structure is designed to keep every layer of planning actionable, clearly owned, and consistently sized — from multi-month strategic direction down to minute-level atomic steps.

---

## Why a Tiered System

Software projects fail at planning for predictable reasons: goals are too vague to act on, or too granular to communicate, or the connection between daily work and strategic intent is lost. A tiered system solves this by:

- Giving every piece of work a home at the right level of abstraction
- Making scope and ownership explicit at each layer
- Ensuring that daily tasks trace back to meaningful outcomes
- Preventing over-engineering at the atomic level and under-specification at the strategic level

The five tiers below are ordered from largest to smallest. Each tier answers a different planning question, operates at a different timescale, and has a different definition of "done."

---

## The Five Tiers

### Tier 1 — Initiative

**Timescale:** Months to quarters
**Owned by:** Project lead or product direction
**Lives in:** `docs/planning/ROADMAP.md`, release milestones, project board epics

An Initiative is a strategic goal that defines a major direction for the project. It represents a capability, product area, or outcome that takes sustained effort across multiple features to achieve. Initiatives do not map to code directly — they map to intent.

An Initiative is complete when a meaningful product-level outcome has been delivered: a system that did not exist now works, or a class of user problems is now solved.

**Characteristics:**

- Broad enough to contain multiple independent features
- Not tied to a single PR, sprint, or developer
- Should be expressible as a one-sentence outcome statement
- Decompose into 2–8 Epics

**Examples:**

- MCP Agent Tooling System
- Offline-first desktop application shell
- Vault intelligence and campaign health features
- Full object embed and stat block system

---

### Tier 2 — Epic

**Timescale:** One to several weeks
**Owned by:** A single developer or small team
**Lives in:** `docs/planning/initiatives/` story tables, sprint planning, GitHub project columns

An Epic is a coherent feature domain — a system or subsystem that can be described independently and delivers observable value when complete. Epics are the primary unit of feature planning. They sit at the level of a folder, module, or logical capability area.

An Epic is complete when its features are usable, tested, and documented — not just coded.

**Characteristics:**

- Maps naturally to a code domain (`mcp/tools/vault/`, `src/lib/domain/`, etc.)
- Has a clear acceptance boundary: you can demonstrate it working end-to-end
- Can be tracked as a GitHub milestone or project column
- Decompose into 2–8 Stories

**Examples:**

- Vault intelligence tools (`get_campaign_health`, `get_coverage_gaps`, etc.)
- Session board management (create, update, tile layout)
- Note soft-delete and restore lifecycle
- Character sheet and stat block object types

---

### Tier 3 — Story

**Timescale:** One to several days
**Owned by:** One developer
**Lives in:** GitHub issues, PR descriptions, sprint backlog

A Story is a complete, reviewable, demonstrable unit of work. It is the smallest piece of work that provides standalone value — something that can be shipped, code-reviewed, or shown to a stakeholder as a finished thing. Stories are the primary unit of developer planning.

A Story is complete when it passes review, its tests pass, and any relevant documentation is updated.

**Characteristics:**

- Scoped to a single PR or a tight sequence of related commits
- Has a clear input state and output state
- Does not depend on in-flight work from another Story in the same Epic (or that dependency is explicit)
- Decompose into 2–8 Tasks

**Examples:**

- Implement `get_campaign_health` tool with scoring logic and response schema
- Add soft-delete flag to note storage and expose it via MCP `delete_note`
- Build `ObjectEmbedMenu` component with search and insert flow
- Write integration tests for note migration from v1 to v2 schema

---

### Tier 4 — Task

**Timescale:** Hours
**Owned by:** One developer, mid-story
**Lives in:** Branch commits, in-session todo lists, linear sub-items

A Task is a concrete implementation step that contributes to a Story. It corresponds to a focused, coherent code change — something that can be described as "change X in file Y to achieve Z." Tasks are the unit of developer execution.

A Task is complete when the code compiles, relevant unit tests pass, and the change does what it says it does.

**Characteristics:**

- Directly touches specific files or modules
- Can be expressed as a verb + noun + file reference ("Add `staleAfterDays` param to tool schema in `vault-intelligence.ts`")
- No further decomposition is needed to understand what to do
- Decompose into 2–6 Atomic actions when complex

**Examples:**

- Add `healthScore` field to vault summary response type
- Refactor `get_vault_summary` to call shared `computeHealth()` helper
- Write unit test for stale note threshold edge cases
- Update `mcp/tools/index.ts` to register new tool

---

### Tier 5 — Atomic

**Timescale:** Minutes
**Owned by:** Developer mid-task
**Lives in:** In-session todo list (TodoWrite), inline code comments, scratchpad

An Atomic action is a single, indivisible step. It requires no further planning or decomposition — you either do it or you don't. Atomics are the operational unit of a working session. They are appropriate to track in a real-time task list during active development but should not be elevated to issue trackers or sprint planning.

An Atomic action is complete when it is done. No review, no test gate — just a checkbox.

**Characteristics:**

- Cannot be meaningfully split further
- Takes a predictable amount of time (under 15 minutes)
- Produces a visible side effect: a line added, a test written, a type updated
- Does not need documentation or review to verify

**Examples:**

- Add `staleAfterDays` param to Zod schema
- Fix lint error on line 42 of `vault-intelligence.ts`
- Update import path in `mcp/tools/index.ts`
- Run `pnpm check` and verify clean output

---

## Summary Table

| Tier | Name       | Timescale | Owned By            | Tracked In           | Done When                      |
| ---- | ---------- | --------- | ------------------- | -------------------- | ------------------------------ |
| 1    | Initiative | Months    | Project lead        | Roadmap / milestones | Outcome delivered              |
| 2    | Epic       | Weeks     | Developer / team    | initiatives/ / board | Feature is usable + tested     |
| 3    | Story      | Days      | One developer       | Issues / PRs         | Reviewed + tests pass          |
| 4    | Task       | Hours     | One developer       | Commits / todo list  | Code correct + unit tests pass |
| 5    | Atomic     | Minutes   | Developer (session) | In-session todo      | Checkbox checked               |

---

## Decomposition Rules

Good decomposition keeps the hierarchy honest. Apply these rules when breaking work down:

**1. Each tier decomposes into 2–8 items of the next tier.**
If you have 20 Tasks under one Story, you likely have two Stories. If you have a single Task under a Story, the Story was already a Task.

**2. A tier is correctly sized when one person can hold its full scope in their head.**
If you cannot describe an Initiative in one sentence, it is too broad. If you need a paragraph to describe a Task, it is a Story.

**3. Tiers should not be skipped.**
A Story does not decompose directly into Atomics. Tasks exist precisely to bridge that gap. Skipping tiers produces plans that feel clear but fall apart during execution.

**4. An item belongs at the tier that matches its uncertainty.**
High-uncertainty work lives higher up the hierarchy until it is understood well enough to decompose. Do not write Tasks for work you have not scoped.

**5. Atomics are ephemeral; everything above is persistent.**
Tier 5 lives in a session context (Claude todo list, scratchpad). Tiers 1–4 should be written down and survive between sessions.

---

## Mapping to This Project

| Project artifact                         | Tier       |
| ---------------------------------------- | ---------- |
| `docs/planning/ROADMAP.md` phase entries | Initiative |
| `docs/planning/initiatives/I*.md` epics  | Epic       |
| GitHub issues                            | Story      |
| Commit messages                          | Task       |
| Claude `TodoWrite` session items         | Atomic     |

When writing new Epics, add them to the relevant `docs/planning/initiatives/I*.md` file. When opening a GitHub issue, scope it to a single Story — one PR, one reviewable outcome.

---

## Anti-Patterns to Avoid

- **Mega-epics**: An Epic that spans months and contains 20+ Stories is an Initiative wearing an Epic's label. Split it.
- **Nano-stories**: A Story that is a single file change is a Task. Elevating it wastes issue-tracking overhead.
- **Floating tasks**: Tasks with no parent Story have no traceability. Every Task should belong to a Story, even informally.
- **Premature atomics in planning docs**: Atomic actions should not appear in initiative epic/story files or GitHub issues. They exist only in active session context.
- **Stale Initiative debt**: Initiatives that sit open for more than two quarters without producing Epics are goals that were never real. Archive or re-scope them.
