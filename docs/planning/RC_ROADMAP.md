# Lamplight — Release Candidate Roadmap (RC-1)

_Authored 2026-09-04 from a full read of the repo, the docs corpus, the ADRs, the initiative
backlog, the feature ledger, and the live code in `apps/gm-react` and `packages/core`. This is the
execution plan from the current state to a polished, feature-complete first release candidate._

> **Audience.** Engineers and coding models that will be handed work items from this document.
> Every work item is written so a model can start cold: it names the outcome, the current state with
> file evidence, the files it may touch, the contracts it must respect, the acceptance criteria, and
> the gate it must pass. Sizes are calibrated for a single focused agent session.

---

## 0. How to use this document

### 0.1 Structure

| Section | What it holds                                                                                               |
| ------- | ----------------------------------------------------------------------------------------------------------- |
| §1      | The baseline: what is real today, what is thin, what is missing — with evidence. Read before claiming work. |
| §2      | What "Release Candidate" means: the exit criteria and the gates that must be green.                         |
| §3      | The critical path and the parallel lanes, with the milestone plan.                                          |
| §4–§19  | The sixteen workstreams. Each is Outcome → Current state → Epics → Stories.                                 |
| §20     | The cross-cutting "second pass" checklists applied to every surface.                                        |
| §21     | Distribution rules for parallel agents (file ownership, branch model, conflict avoidance).                  |
| §22     | Risk register.                                                                                              |
| §23     | Complete story index (one row per story: id, lane, phase, deps, size, files).                               |

### 0.2 Identifiers and sizing

- Stories are identified `RC-<LANE>-<epic>.<story>` (e.g. `RC-SYS-1.2`). Lanes: `STB` stabilize,
  `SYS` system packages, `WID` widgets, `CAN` canvas/scenes/board, `MAP` maps, `SES` session,
  `CHR` characters & player, `KNW` knowledge/campaign/graph, `AUD` audio/atmosphere, `AI`
  assistant, `CLD` cloud/collab/community, `DSN` design system/brand, `UX` UX/a11y/i18n/learnability,
  `PLT` platform shells, `ENG` engineering/quality/perf/security/release, `DOC` docs.
- Size: **S** ≤ 1 agent-day · **M** 2–4 · **L** 5–10 · **XL** must be split before it is claimed.
- Phase: **P0** stabilize · **P1** foundations (critical path) · **P2** feature depth · **P3**
  polish passes · **P4** RC hardening. A story's phase is the earliest it may start.
- Every story lists `Deps:` (story ids that must be merged first) and `Owns:` (the files the
  story may edit; touching anything else requires a `Deps:` on the story that owns it).

### 0.3 Non-negotiable guardrails (apply to every story)

These are the architecture and design contracts already in force. A story that violates one is
rejected at review regardless of how good the feature is.

1. **Every durable mutation is a core command** dispatched through `SceneRuntime.dispatch`
   (`docs/architecture/ARCHITECTURE.md` §2.2, §4). No screen writes state; no screen re-derives
   visibility. New state = new command + reducer + schema in `packages/core` first.
2. **The core stays framework-free** (zod-only; `scripts/boundary-lint.ts` enforces). GUI platform
   access is allow-listed in `apps/gm-react/platform-access-exceptions.json` (PLAT-006/012).
3. **Actor-scoped reads only.** Player-facing data comes from `packages/core/src/queries/*ForActor`
   functions. A player never sees DM-only content; the core decides, never the UI.
4. **Schema discipline.** A persisted-shape change bumps the slice `schemaVersion` and ships a
   migration + test (`docs/architecture/DATA_MODEL.md` §6). Additive fields that keep byte-identical
   round-trips (as ADR-024 did) are preferred; a bump breaks cloud-backup restore.
5. **Design system first.** Screens compose `apps/gm-react/src/ds` components and semantic tokens
   through `screen-kit`'s `T` map. No raw hex, no bespoke primitives, no emoji, one icon family
   (Lucide) via the semantic vocabulary in `docs/reference/ICON_VOCABULARY.md`.
6. **IA contracts.** `nav.ts` is the only navigation source of truth; the top bar owns only what
   `TOPBAR_CHARTER.md` allows; layout branches on the `Viewport` tier from `useViewport`, never on
   ad-hoc width reads (`LAYOUT_TIERS.md`, `NAVIGATION_CONTRACT.md`).
7. **Voice and copy.** The content fundamentals in `docs/design-package/readme.md` are binding:
   sentence case, verbs first, explicit safety language (DM only · Shared · Player visible), no
   engine jargon, no exclamation marks, "project" = maps/scenes to players, "push" = handouts only.
8. **WCAG 2.2 AA is the floor** (`docs/development/ACCESSIBILITY.md`). Every pointer operation has a
   keyboard equivalent that dispatches the identical command. Every new surface enters the axe gate
   route list if it is a durable workspace.
9. **Fail closed and honest.** Unavailable capability states why in-UI. No dead controls, no fake
   success. AI proposes, never disposes (ADR-002/025).
10. **Docs move with code.** A story that changes a contract updates the doc in the same PR
    (`docs/README.md` quality rules). Material runtime/storage/security/platform decisions need an
    ADR (`docs/adr/000-template.md`, index in `docs/adr/README.md`).
11. **Gates.** `pnpm check` green before handoff; the affected e2e specs on both Playwright profiles;
    `pnpm validate` for anything spanning layers (`docs/development/VALIDATION.md`). Never add a
    repo-wide `format:check` to CI; run `pnpm format:fix:changed` before committing.

---

## 1. Baseline — where the product actually is (2026-09-04)

### 1.1 Shape of the codebase

| Area            | Location                                                | Size                                                                                                                                        | Maturity                                                                                                    |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Processing core | `packages/core/src`                                     | commands 50 files / 22.8k lines · state 70 / 24.1k · queries 72 / 17.4k · generation 11 / 12.1k · 223 test files                            | **Deep.** The core is far ahead of the UI on most domains.                                                  |
| React GM app    | `apps/gm-react/src`                                     | 14 screens (42k lines in `screens/` + `app/`), DS library of 14 component groups, 73 unit test files, 32 e2e specs / 253 tests × 2 profiles | **Broad, wired, uneven.** Every surface is core-wired; polish and depth vary widely.                        |
| Cloud           | `packages/cloud-fns`, `infra/` (8 SAM stacks)           | 7 test files; dev stage live, prod account bootstrapped                                                                                     | **Beta.** Prod promotion, SES production access, and paid billing are pending.                              |
| Shells          | `electron/`, `android/`                                 | Unsigned desktop alpha, alpha-key-signed Android                                                                                            | **Alpha.** No signing certs, no auto-update, no iOS, no PWA.                                                |
| Design          | `docs/design-package/`, `src/ds/`, `src/styles/tokens/` | 67-component design system (external project A), vendored copy, React realization                                                           | **Realized, drifting.** Three themes in the app; the package readme claims five and still says "DND Tools". |

### 1.2 What is genuinely done (do not rebuild)

- Command runtime, Dexie persistence with transactional op-log, crash-safe migrations, content-
  addressed asset store, full backup/restore, privacy modes + recovery keys (ADR-019/026).
- Every screen reads actor-filtered core state and dispatches real commands (FEATURE-GAPS §0★★★★★).
- Session hot path (combat, dice, handouts, projection, prep/recap, calendar), guided character
  builder + full sheet + inventory + advancement, knowledge/campaign/graph, audio playback + presets
  - automation + scene cards + second display, co-DM role, custom vault-object types (ADR-023),
    agentic BYO-key assistant with staged writes (ADR-021/025), LAN + cloud remote play, E2EE backup,
    app-api marketplace/invites/wiki/entitlements (simulated checkout), Google Docs/Calendar.
- Procedural map suite: 13 generators, geometry kit, derivations, UVTT export, and a creative-app
  editor with tool rail, options bar, four-panel dock, generate-as-a-tool, local undo/redo, Quick Map
  on Android (ADR-024). `MapBuilder.tsx` is now a thin wrapper that mounts `map/MapEditor.tsx`.
- Quality automation: gates registry, boundary lint, contrast lints, axe gate (register empty),
  responsive reachability specs, `pnpm validate` harness, feature-audit drift check, release
  workflow with SBOM/attestations, Android API 36 acceptance.
- Lamplight rebrand and `lamplight.click` domain (commit `729be436`, `73053095`).

### 1.3 What is thin, stubbed, or only designed — the honest gap list

Each item below is a finding from the code, not from the ledger. It is the reason the corresponding
workstream exists.

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Evidence                                                                                                                                                                     | Workstream      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| G1  | **"Modular systems" is not a rules contract.** The active campaign system is `WidgetPackageState.activeSystemPackageId` — a widget-package id. There is no `CampaignSystemModule`/System Package declaring attributes, resources, conditions, dice model, action economy, creature schema, or vocabulary. 5e is hardcoded across `character-*`, `combat-tracker`, `encounter`, the DS `CONDITIONS` registry, and CharBuilder. The design package readme specifies the full System Package contract and ships a `system-package-picker` template that nothing implements. | `packages/core/src/state/widget-package-state.ts:302`, `commands/widget-package.ts:777`, `queries/system-switch-query.ts`, `docs/design-package/readme.md` "SYSTEM PACKAGES" | §5 SYS          |
| G2  | **Custom widgets cannot render.** The core declares `renderEntrypoint.runtime: 'custom-html-js'` with iframe/worker sandboxes, a host API, and an exfiltration gate (`security/custom-widget-runtime.ts`, `widget-host-api.ts`, `widget-exfiltration.ts`), but the React app has no sandbox host: `widget-bodies.tsx` renders ten builtin bodies and nothing else. Starter-library packages install as "sandboxed shells" that draw nothing.                                                                                                                             | `apps/gm-react/src/app/widget-bodies.tsx`, no iframe host under `src/app`                                                                                                    | §6 WID          |
| G3  | **The manual widget builder is a JSON textarea.** Extensions → Plugins offers a starter library (scaffolded by `scaffoldCustomWidgetPackageDraft`) and "Install or upgrade from JSON". There is no form-driven builder for definitions (config fields, bindings, data queries, template selection, style tokens), no preview, no validation UI beyond the rejection toast.                                                                                                                                                                                               | `src/screens/Extensions.tsx:132–600`                                                                                                                                         | §6 WID          |
| G4  | **The AI widget builder does not exist.** `SceneEditor.tsx:65` lists "the AI-generate dialog, the custom-code widget builder" as honest deferrals. `WidgetAuthoringSource` already includes `'generated'` and the scaffolder stamps drafts as LLM-generated, but no MCP tool produces a widget package and no UI runs one.                                                                                                                                                                                                                                               | `src/screens/SceneEditor.tsx:65`, `packages/core/src/mcp/tool-registry.ts` (no widget tool)                                                                                  | §6 WID, §13 AI  |
| G5  | **No trust-review command.** Installed packages land `unreviewed` with every host permission denied "and that denial is permanent (only code-defined system.\* packages are trusted)". The trust lifecycle in the widget brief (review → enable) has no command.                                                                                                                                                                                                                                                                                                         | `src/screens/Extensions.tsx:72–76`                                                                                                                                           | §6 WID          |
| G6  | **Scene canvas has no history and no restore.** "local undo/redo (the core has no layout history command)"; "Destroying a widget is unrecoverable — the core has no `scene.restore-widget`". The map editor got local undo via core inverse builders (ADR-024 §4); the scene canvas did not.                                                                                                                                                                                                                                                                             | `SceneEditor.tsx:66, 183–186`                                                                                                                                                | §7 CAN          |
| G7  | **Board/scene tile experience is the I20 backlog, unbuilt in React.** No tile-type identity tokens, no note depth levels, no action menu, no resize presets, no zoom presets, no mobile stacked-panel board, no map tile with combat overlay, no tile gallery with previews, no `>board` palette commands, no layout-quality indicator, no templates picker with thumbnails, no virtualization. I20 is marked COMPLETED but its stories are Svelte paths.                                                                                                                | `docs/planning/initiatives/I20-board-tool-ux.md` vs `src/screens/Board.tsx`, `SceneEditor.tsx`, `app/SceneBoardCanvas.tsx`                                                   | §7 CAN          |
| G8  | **Map combat is not on the map.** The tracker and the map are separate; there are no combatant-linked tokens with HP/conditions, no movement ranges, no AoE templates, no token↔tracker selection sync, no combat-map session persistence, no party-location marker, no travel-time tool. ADR-024 follow-ups (canvas-2d bake, room-graph view, live sea-level knob) are open. `map-los.ts` and `map-travel.ts` exist in core with no UI.                                                                                                                                 | I9 Epics 9.3/9.5 vs `src/app/map/*`; `packages/core/src/queries/map-los.ts`, `state/map-travel.ts`                                                                           | §8 MAP          |
| G9  | **Session mode does not reshape the app.** No app-level "session active" posture (nav pulse, right-panel auto-open, compact status bar), no persistent dice bar, no roll labels/history export, no inline `[[roll:]]` in notes, no rollable-tables tab (although `dice-table` objects exist), no condition duration decrement, no stat-block quick-ref in the tracker, no one-handed HP sheet, no end-session capture → session-log note, no continuity-check integration.                                                                                               | I16 vs `src/screens/Session.tsx`, `AppShell.tsx`                                                                                                                             | §9 SES          |
| G10 | **Character depth stops at the sheet.** No class-resource definitions by class (they need G1), no rest workflow with hit dice, no concentration/death-save tracking, no downtime tracker, no character history timeline, no XP/milestone mode, no printable sheet, no live party HP panel over P2P, no player-private vault, no NPC impressions, no highlight compilation. DEBT-2026-005 preview edges open; "Trusted tier remains aspirational".                                                                                                                        | I10 vs `src/screens/Player.tsx`, `PlayerView.tsx`, `Characters.tsx`                                                                                                          | §10 CHR         |
| G11 | **Knowledge is a plain textarea.** No rich editor (callouts, tables, images, wikilink autocomplete), no templates/snippets UI (core has `content-templates.ts`, `content-snippets.ts`), no saved searches UI (core `saved-search.ts`; remote branch `epic/SRCH-filters-and-saved-searches` unmerged), no link-repair UI (core `graph-link-repair.ts`), no calendar editor UI, no reading-width preference, no note-list information scent, no graph clusters/momentum.                                                                                                   | `src/screens/Knowledge.tsx`, `Campaign.tsx`, `Graph.tsx` vs core `state/content-*.ts`, `graph-*.ts`                                                                          | §11 KNW         |
| G12 | **Audio is `<audio>` elements, not an engine.** No Web Audio crossfade/loop-point engine, no SFX channel, no combat automation trigger, no web sources, no waveform/duration metadata, no bundled starter pack, no `.dndscene` export, no MCP atmosphere tools, second-screen is a same-origin window only.                                                                                                                                                                                                                                                              | `src/runtime/audio-playback.ts`, `src/screens/Audio.tsx` vs I11                                                                                                              | §12 AUD         |
| G13 | **Assistant oversight is thin.** Staged proposals show payload, not a semantic diff; no three-way conflict UI; no audit export; PC leveling deferred; cancel is between-pass only; no model router/status; no local embeddings; the Copilot RAG is blocked on ADR-026 phase 2; no widget/encounter/quest/map write tools.                                                                                                                                                                                                                                                | ADR-025 consequences; `src/screens/Settings.tsx` AI panel; `packages/core/src/mcp/tool-registry.ts`                                                                          | §13 AI          |
| G14 | **Cloud product is pre-launch.** SES sandboxed (public registration cannot complete), prod promotion not run, Stripe ADR-027 Proposed, FCM absent, TURN single-instance beta, Cloud-Enhanced phase 2 security review open, community discovery/curation unbuilt, cross-device sync is backup-only. Infra changes + ADR-028 are uncommitted in the working tree.                                                                                                                                                                                                          | `docs/development/CLOUD_TIER_ROADMAP.md`, `git status`                                                                                                                       | §14 CLD         |
| G15 | **Design fidelity debt.** DEBT-2026-004 (token map lacks spacing/radius; hand-rolled layer panels; raw rgba in widget bodies), untyped `.jsx` DS components behind a loose `index.d.ts`, ~128 `any` sites (DEBT-2026-002), no visual regression suite, no component docs/storybook, no empty-state illustrations, no dice drama, three themes vs the design package's five, design package readme still branded "DND Tools" with CDN fonts.                                                                                                                              | `DEBT.md`, `src/ds/index.d.ts`, `docs/design-package/readme.md`                                                                                                              | §15 DSN         |
| G16 | **i18n is a DOM bridge.** `src/i18n/index.tsx` (351 lines) translates by source text through a MutationObserver plus 186 `t()` calls; the ES catalog is partial; no locale-aware number/date formatting layer, no RTL, no lint for hardcoded strings.                                                                                                                                                                                                                                                                                                                    | `src/i18n/index.tsx`                                                                                                                                                         | §16 UX          |
| G17 | **Learnability surfaces unverified in React.** HelpTip, feature spotlight, `?` shortcut overlay, help menu, "What's new", maturity-signal disclosure triggers are I17 stories written for Svelte; the React app has onboarding + a static shortcut list in Settings.                                                                                                                                                                                                                                                                                                     | I17 vs `src/app/Onboarding.tsx`, `Settings.tsx`                                                                                                                              | §16 UX          |
| G18 | **Mega-files block parallel work.** `Settings.tsx` 4,989 lines, `Player.tsx` 2,677, `Extensions.tsx` 2,611, `CharBuilder.tsx` 2,470, `Session.tsx` 2,295, `PlayerView.tsx` 2,282, `Audio.tsx` 2,114, `Characters.tsx` 1,972, `MapBuilder.tsx` 1,691, `Community.tsx` 1,581. I21's "no file exceeds 500 lines" is violated roughly tenfold; any two agents touching Settings collide.                                                                                                                                                                                     | `wc -l apps/gm-react/src/screens/*.tsx`                                                                                                                                      | §4 STB, §18 ENG |
| G19 | **Perf budgets are all provisional with no measurement pipeline.** Eleven budgets in `perf/budget-registry.ts`; `PERFORMANCE.md` says "no automated capture/compare pipeline wired to scripts today".                                                                                                                                                                                                                                                                                                                                                                    | `docs/development/PERFORMANCE.md`                                                                                                                                            | §18 ENG         |
| G20 | **Docs describe a different app in places.** I13–I20 are "COMPLETED" with Svelte paths; `GLOSSARY.md` lists Capacitor/Android as _historical_ while Android ships; `PROTOTYPE.md` references the deleted `mockCampaign.ts`; the initiative index and design package still say "DND Tools"; FEATURE-GAPS is a reverse-chronological changelog rather than an inventory.                                                                                                                                                                                                   | the files named                                                                                                                                                              | §19 DOC         |
| G21 | **Platform reach.** No code-signing, no auto-update, no PWA/service worker, no iOS, Electron menu/shortcut parity unaudited, Android has no widgets/shortcuts/share-target.                                                                                                                                                                                                                                                                                                                                                                                              | `docs/development/RELEASING.md`, `electron/`, `android/`                                                                                                                     | §17 PLT         |

### 1.4 Working-tree state to resolve first

- Uncommitted: 15 infra files + `docs/adr/028-*.md` + `docs/adr/README.md` (ADR-028 observability).
- Local branches to reconcile or delete: `auto/visual-review-loop`, `feat/agentic-ai-runs`,
  `feat/completion-pass`, `feat/full-e2e-readiness`, `fix/release-draft-gate`, three `salvage/*`,
  `ux/clarity-pass`; a stash (`WIP on feat/unify-widget-platform`); remote `claude/*`,
  `epic/SRCH-filters-and-saved-searches`, `feat/gm-react-p2p`, and 12 dependabot branches.
- The autonomous visual-review loop (`/home/trinkle/Programming/dndtools-review-loop-ctl/`) pushes
  `fix(ui)` commits to `main`; it must be paused or pointed at a branch during Phase 0
  decomposition or it will conflict with every refactor.

---

## 2. Definition of Release Candidate

RC-1 is declared when **all** of the following hold. These are the exit criteria for Phase 4; each
maps to a story in §18/§19.

### 2.1 Feature completeness

1. Every workstream in §5–§17 has its **P1 and P2 stories merged**, and its P3 polish pass signed
   off with the §20 checklist attached to the PR.
2. Every "honest limit" left in the UI is one of the four **external** blockers (payment processor,
   signed desktop certificates, curation service, Cloud-Enhanced phase 2 review) — nothing else.
3. The design package's System Package contract, the widget brief's trust lifecycle and sandbox,
   ADR-024's editor IA, and the I16/I19/I20 interaction models are **implemented in React**, and the
   initiative files are re-pointed at React evidence (§19).

### 2.2 Quality gates (all green on the RC commit)

| Gate          | Command / source                                                    | RC bar                                                                           |
| ------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Static + unit | `pnpm check`                                                        | green; core coverage floors unchanged or raised                                  |
| Browser       | `pnpm e2e` both profiles                                            | green; every §5–§17 epic has ≥1 spec                                             |
| Accessibility | `pnpm a11y:gate`                                                    | zero critical/serious; register empty; every durable workspace in the route list |
| Whole-app     | `pnpm validate:full`                                                | 0 fail; the Prettier warn is the only accepted warn                              |
| Performance   | new `pnpm perf:baseline` (RC-ENG-3)                                 | every budget **measured**, none `provisional`, none breached                     |
| Security      | `pnpm security:audit`, `security:secrets`, phase-2 review checklist | no high; checklist signed or Cloud-Enhanced stays gated                          |
| Visual        | new visual-regression suite (RC-DSN-5)                              | zero unreviewed diffs on the golden route set, all three themes × three tiers    |
| Release       | `release.yml`                                                       | six packages, SBOM, attestations, signed desktop where certs exist               |
| Docs          | `pnpm feature-audit` + RC-DOC-1                                     | zero drift; no COMPLETED initiative pointing at Svelte paths                     |

### 2.3 Non-functional bars

- No source file over 800 lines in `apps/gm-react/src` (I21's 500 is the target; 800 is the RC gate).
- `@typescript-eslint/no-explicit-any` warnings ≤ 20 in the app.
- App boot bundle within `perf/bundle-budget.ts`.
- Every user-visible string routed through the i18n layer; ES catalog ≥ 95% of keys.

---

## 3. Critical path, lanes, and milestones

### 3.1 The dependency spine

```
P0  STB-1 tree hygiene ─┐
    STB-2 decompose mega-files ─┼──► every P1 lane (no parallel work on Settings/Player/Session
    STB-3 docs truth pass ──────┘    before their decomposition lands)
    STB-4 ADRs 029–033 (System Packages · Widget Runtime & Authoring · Scene History ·
                        i18n architecture · Combat-on-map)

P1  SYS-1 core System Package model ──► SYS-2 5e + Generic packages ──► CHR-1, SES-2, WID-4, MAP-3
    WID-1 sandbox host ──► WID-2 manual builder ──► WID-3 AI builder (also needs AI-2)
    CAN-1 scene history commands ──► CAN-2..CAN-6
    MAP-1 combat-on-map model ──► MAP-2 tokens/AoE UI ──► CAN-5 map tile
    ENG-1 perf measurement pipeline (unblocks P4 baselines; independent otherwise)
    UX-1 i18n architecture (unblocks every P3 copy pass)

P2  all feature-depth epics run in parallel by lane (see §3.3 for the collision map)

P3  per-surface polish passes (one PR per screen, §20 checklist) — start when the surface's
    P2 epics are merged; DSN-1..4 (tokens, typed DS, illustrations, visual regression) land early
    in P3 because every polish pass consumes them

P4  ENG-3 measured baselines · ENG-5 security review · PLT-1 signing · DOC-1 realignment ·
    ENG-7 RC checklist run · CLD-1 prod promotion
```

**Longest chain** (the critical path): STB-2 → SYS-1 → SYS-2 → CHR-1 (class resources by package)
→ CHR polish → RC. Second-longest: STB-2 → WID-1 → WID-2 → WID-3 → CAN-4 (builder entry from the
canvas) → CAN polish → RC. Everything else is parallel to these two chains.

### 3.2 Milestones

| Milestone            | Contents                                        | Exit signal                                                                                                                                                                                    |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0 — Clean slate** | §4 STB-1..4                                     | Tree clean, branches pruned, review loop paused/redirected, all ten mega-files decomposed, five ADRs Accepted, docs no longer claim Svelte work as done.                                       |
| **M1 — Foundations** | SYS-1/2, WID-1, CAN-1, MAP-1, ENG-1, UX-1, AI-1 | A Generic package renders a non-5e sheet; a sandboxed custom widget draws on a scene; scene undo works; tokens exist on a map; perf samples are captured in CI; `t()` is the only string path. |
| **M2 — Depth**       | all P2 epics                                    | Every G1–G17 finding closed or re-scoped to an external blocker.                                                                                                                               |
| **M3 — Polish**      | DSN-1..5, then one polish PR per surface        | Visual regression golden set frozen; §20 checklists attached to 16 surface PRs; a11y register still empty.                                                                                     |
| **M4 — RC-1**        | ENG-3/5/7, PLT-1/2, DOC-1/2, CLD-1              | §2 gates all green on one tagged commit; RC notes drafted; prod promoted; beta program opened.                                                                                                 |

### 3.3 Parallel lanes and their collision map

Lanes may run concurrently when they own disjoint files. The table names the shared files that
force sequencing.

| Shared file                                                                 | Lanes that need it       | Rule                                                                                             |
| --------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| `packages/core/src/commands/dispatch.ts`, `schemas/commands.ts`, `index.ts` | every core-touching lane | Append-only edits; each story adds its block in one commit; rebase before merge. Do not reorder. |
| `apps/gm-react/src/App.tsx`, `app/nav.ts`, `app/AppShell.tsx`               | SES-1, UX-3, CAN-4       | One owner at a time; queue via `Deps:`.                                                          |
| `src/screens/Settings.tsx`                                                  | SYS-3, AI-3, CLD-_, UX-_ | **Frozen until STB-2.3 splits it** into `screens/settings/*` category files.                     |
| `src/screens/Session.tsx`                                                   | SES-\*, MAP-2, CHR-3     | Frozen until STB-2.5 splits it into `screens/session/*`.                                         |
| `src/app/widget-bodies.tsx`, `SceneBoardCanvas.tsx`, `board-helpers.ts`     | WID-1, CAN-\*            | WID-1 lands first; CAN stories rebase on it.                                                     |
| `packages/core/src/state/widget-package-state.ts`                           | SYS-1, WID-\*            | SYS-1 first (it moves `activeSystemPackageId` out); WID after.                                   |
| `src/styles/tokens/*.css`, `screen-kit.tsx`                                 | DSN-1                    | Single owner; everyone else consumes.                                                            |
| `src/i18n/*`                                                                | UX-1                     | Single owner during P1; P3 passes only add keys.                                                 |

---

## 4. Workstream STB — Stabilize the tree (Phase 0)

**Outcome.** A clean, decomposed, truthfully documented codebase that many agents can work in at
once without colliding, with the architectural decisions this roadmap depends on recorded.

**Current state.** See §1.4 and G18/G20.

### Epic STB-1 — Tree and branch hygiene

- **RC-STB-1.1 — Land the pending infra/ADR-028 change.** `S` · P0 · Deps: none · Owns: `infra/**`,
  `docs/adr/028-*.md`, `docs/adr/README.md`. Run the `infra-ops-reviewer` audit on the diff, confirm
  the dev stage matches the templates (`pnpm cloud:drift`), commit as one `feat(infra)` with the
  ADR. Acceptance: `git status` clean; `cloud-drift.yml` green.
- **RC-STB-1.2 — Prune and record branches.** `S` · P0 · Deps: 1.1 · Owns: git refs only. For each
  local/remote non-main branch decide merge / cherry-pick / delete; the remote
  `epic/SRCH-filters-and-saved-searches` and `claude/widget-design-brief-y8qc5a` (carries
  `docs/architecture/WIDGET_FEATURE_BRIEF.md`) are inputs to KNW-4 and WID respectively — cherry-pick
  their docs now. Drop the stash after inspection. Merge or close the 12 dependabot PRs (typescript
  6.0.3 and vite 8.1.4 need a typecheck+build run first). Acceptance: `git branch -a` lists only
  `main` + active initiative branches; a `docs/development/BRANCH_LEDGER.md` note records what was
  dropped and why.
- **RC-STB-1.3 — Pause or re-target the visual-review loop.** `S` · P0 · Deps: none · Owns: the
  loop control dir (outside the repo). Either `touch STOP` for the duration of STB-2 or set its
  branch to `auto/visual-review-loop` with a PR flow instead of `HEAD:main` pushes. Record the
  choice in `docs/development/GIT_WORKFLOW.md`. Acceptance: no unreviewed pushes to `main` during P0.

### Epic STB-2 — Decompose the mega-files (the enabler for every parallel lane)

Rule for every story here: **pure moves, no behavior change**, one PR per file, all existing
tests + the screen's e2e specs on both profiles must pass unchanged, and `pnpm feature-audit`
must stay at zero drift. Extract by _responsibility_, not by line count. Keep the public export
(`export function Settings()`) in a thin index so `App.tsx` does not change.

- **RC-STB-2.1 — Split `Settings.tsx` (4,989 lines) into `screens/settings/`.** `L` · P0 · Owns:
  `src/screens/Settings.tsx` → `src/screens/settings/{index,Appearance,Accessibility,Players,
Permissions,Vault,Sync,Ai,AiProvider,AiAssistant,Account,Subscription,Experience,Language,
shared}.tsx`. Keep `settings-validation.ts` where it is. Acceptance: `settings.spec.ts`,
  `ai-assistant.spec.ts`, `co-dm.spec.ts`, `permissions.spec.ts`, `sync.spec.ts` unchanged and
  green; no file > 600 lines.
- **RC-STB-2.2 — Split `Player.tsx` (2,677) and `PlayerView.tsx` (2,282).** `M` · P0 · Owns:
  those two → `screens/player/{Sheet,Vitals,Spells,Equipment,Journal,Party,Advancement}.tsx` and
  `screens/play/{Frame,Home,Sheet,Dice,Handouts,Presence,Elevated}.tsx`, with the shared sheet
  panels (spells, equipment, journal) extracted once into `app/character/` and consumed by both.
  Acceptance: `player-view.spec.ts`, `equipment.spec.ts`, `character-sheet.spec.ts` green.
- **RC-STB-2.3 — Split `Extensions.tsx` (2,611).** `M` · P0 · Owns: → `screens/extensions/
{index,Plugins,Compendium,ObjectTypes,CustomTypes,System,ThemeStudio}.tsx`. Acceptance:
  `custom-types.spec.ts` green; the Plugins panel is a standalone file WID-2 can replace.
- **RC-STB-2.4 — Split `CharBuilder.tsx` (2,470).** `M` · P0 · Owns: → `app/charBuilder/{index,
steps/*,Import,Review}.tsx`. Acceptance: `character-sheet.spec.ts` + `verify:ui` CharBuilder case.
- **RC-STB-2.5 — Split `Session.tsx` (2,295).** `M` · P0 · Owns: → `screens/session/{index,
Lifecycle,CombatTracker,DiceTray,Handouts,ActiveMap,NowPlaying,CampaignDate,PrepRecap,
Schedule}.tsx`. Acceptance: `combat.spec.ts`, `scene-cards.spec.ts`, `verify:ui` Go-live case.
- **RC-STB-2.6 — Split `Audio.tsx` (2,114), `Characters.tsx` (1,972), `Community.tsx` (1,581),
  `Knowledge.tsx` (1,201), `Atlas.tsx` (1,167), `SceneEditor.tsx` (1,165), `AppShell.tsx`
  (1,165), `Onboarding.tsx` (1,290), `MapBuilder.tsx` (1,691 → keep `MapCanvas` + `ImportMapDialog`
  in `app/map/`, delete the wrapper).** `L` (one PR each, 9 PRs) · P0. Acceptance per PR: its e2e
  spec green; `AppShell` extraction yields `app/shell/{Sidebar,TopBar,Footer,MoreSheet}.tsx`.
- **RC-STB-2.7 — Add the file-size gate.** `S` · P0 · Deps: 2.1–2.6 · Owns: `scripts/
quality-gates.ts`, `packages/core/src/platform/quality-gates.ts`, `tests/unit/`. A gate that
  fails when any `apps/gm-react/src/**/*.tsx` exceeds 800 lines (target 500 recorded as a warn).
  Acceptance: `pnpm gates` enforces it; CI green.

### Epic STB-3 — Docs truth pass (so later agents are not misled)

- **RC-STB-3.1 — Re-status the initiative files.** `M` · P0 · Owns: `docs/planning/initiatives/*.md`,
  `docs/planning/README.md`. Change I13–I20 from "COMPLETED" to "SVELTE-ERA PLAN — React status
  tracked in RC_ROADMAP §n"; add a 5-line React-evidence block to each; replace "DND Tools" with
  Lamplight in the index (keep the package/repo names). Acceptance: no initiative claims React
  completion without a file path that exists.
- **RC-STB-3.2 — Fix the known-wrong reference docs.** `S` · P0 · Owns: `docs/GLOSSARY.md`
  (Android is current, not historical; add System Package, Widget Definition/Package/Instance, Scene
  vs Board, Projection), `apps/gm-react/PROTOTYPE.md` (drop `mockCampaign.ts`; point to the demo
  seed), `docs/reference/FEATURE_TIERS.md` (routes `/scenes/`, `/maps/` are stale), `docs/design/
README.md` (three themes today; five is the target), `docs/design-package/readme.md` header
  (Lamplight; fonts are self-hosted in the app). Acceptance: `docs/README.md` quality rule 1 holds.
- **RC-STB-3.3 — Restructure FEATURE-GAPS.md into an inventory.** `M` · P0 · Owns:
  `docs/requirements/FEATURE-GAPS.md`, `scripts/validate/feature-audit.ts`. Replace the
  reverse-chronological changelog with a per-surface table (surface · what it does · honest limits ·
  evidence · e2e spec), moving §0★…§9 to `docs/requirements/history/`. Extend the feature-audit to
  assert each "honest limit" string still exists in the named file. Acceptance: `pnpm feature-audit`
  green; the document is under 300 lines.

### Epic STB-4 — Decisions this roadmap needs recorded (ADRs)

Each ADR follows `docs/adr/000-template.md`, goes in the index with cross-links, and is `S`–`M`.
Write them **before** the corresponding P1 story starts; the story's PR flips the status.

- **RC-STB-4.1 — ADR-029 System Packages as the rules contract.** `M` · P0 · Deps: none · Owns: `docs/adr/`. Decides: a `SystemPackage`
  record in core (attributes, resources, conditions, dice model, action economy, creature schema,
  vocabulary, advancement model), stored in a new `systems` durable slice (schema v1) with the
  active id moved off `WidgetPackageState`; built-in 5e + Generic ship in code; community packages
  arrive as data through the existing package install/trust pipeline; switching runs the existing
  dry-run. Amends ADR-014's "campaignSystem" note and the widget brief §6.
- **RC-STB-4.2 — ADR-030 Custom-widget runtime host and authoring model.** `M` · P0 · Deps: none · Owns: `docs/adr/`. Decides: sandboxed
  iframe host (`sandbox="allow-scripts"`, opaque origin, `postMessage` host API v1 mirroring
  `security/widget-host-api.ts`), a `widget.package.review` command that records a DM trust
  decision per host permission, the manual builder produces `template`-runtime definitions by
  default and `custom-html-js` only behind an explicit "advanced" step, and the AI builder is an MCP
  write tool (`widget.package.propose`) whose proposal is a package draft that goes through the
  same review. Amends ADR-002/025.
- **RC-STB-4.3 — ADR-031 Scene layout history.** `M` · P0 · Deps: none · Owns: `docs/adr/`. Decides: local, non-durable undo/redo for the
  scene canvas built on core inverse builders (mirroring ADR-024 §4), plus a durable
  `scene.restore-widget` (tombstone with TTL) so destroy is reversible. Amends ADR-014.
- **RC-STB-4.4 — ADR-032 Internationalization architecture.** `M` · P0 · Deps: none · Owns: `docs/adr/`. Decides: message-key catalogs per
  locale (`src/i18n/messages/<locale>.ts`), `t()` as the only path, removal of the MutationObserver
  bridge, ICU-style plurals, `Intl` formatters for numbers/dates/units, an ESLint rule for string
  literals in JSX, and the community translation workflow. Amends nothing; new.
- **RC-STB-4.5 — ADR-033 Combat on the map.** `M` · P0 · Deps: none · Owns: `docs/adr/`. Decides: combat tokens are session-owned
  (`session.combat.tokens`) not map features, keyed by combatant id; AoE templates are ephemeral
  session state; movement/range derive from the System Package's speed model and the map scale;
  fog reveal during combat writes the durable MAP-012 log as today. Amends ADR-024.

---

## 5. Workstream SYS — Modular game systems (System Packages)

**Outcome.** The platform is genuinely system-agnostic, as the design package specifies: the rules
vocabulary the chrome reads at runtime comes from a **System Package**. D&D 5e ships as the reference
package, a Generic/narrative package proves the chrome holds with most of the 5e vocabulary absent,
and a DM can fork or author a package from Settings › Extensions & systems. Every sheet, tracker,
builder, condition badge, dice result, and label re-renders against the active package.

**Current state (G1).** `activeSystemPackageId` on `WidgetPackageState`; `widget.package.switch-
system` with a dry-run preview of which _widget types_ would be dropped; 5e hardcoded in
`packages/core/src/state/character-*.ts`, `combat-tracker.ts`, `encounter.ts`, `dice.ts`, the DS
`CONDITIONS` registry, `app/charImport/*`, `app/compendium/*`, `CharBuilder`. The design package
readme's "SYSTEM PACKAGES" section is the spec; `docs/design-package/templates/system-package-picker/`
is the front-door design.

**Contracts.** ADR-029 (RC-STB-4.1). New slice ⇒ `DurableStateDocumentId` gains `systems`,
`TARGET_SCHEMA_VERSIONS` gains it at v1, hydration defaults to the 5e package id, migration test.

### Epic SYS-1 — The System Package model in core (P1, critical path)

- **RC-SYS-1.1 — `SystemPackage` schema + state slice.** `L` · P1 · Deps: STB-4.1 · Owns:
  `packages/core/src/state/system-package.ts` (new), `schemas/system-package.ts` (new),
  `migration/schema-versions.ts`, `state/widget-package-state.ts` (remove `activeSystemPackageId`
  with a hydrator that carries the old value into the new slice), `commands/types.ts`.
  Declares: `id`, `version`, `displayName`, `vocabulary` (gm/dm word, spell/power, level-up verb…),
  `attributes[]` (key, label, abbreviation, derivation: none|modifier(formula)), `resources[]`
  (key, label, kind: pool|slots|dice|clock|track, max derivation, recovery: short|long|scene|never),
  `conditions[]` (key, label, icon name from the icon vocabulary, severity, default duration
  semantics), `dice` (model: d20+mod | pool(successes) | 2d6 pbta | custom; advantage semantics;
  crit rules), `turnModel` (initiative | actions-per-turn(n) | popcorn | none), `creatureSchema[]`
  (field key/type/required), `advancement` (xp-table | milestone | none; level cap),
  `skills[]` (key, label, attribute), `derived` (proficiency bonus by level, passive scores…).
  All primitive/serializable; no functions (formulas are a tiny declarative expression grammar:
  `floor((score-10)/2)`, `2+ceil(level/4)`), evaluated by a pure `evaluateFormula` with a test.
  Acceptance: zod schema rejects unknown keys; `hydrateSystemsState` on an absent slice yields the 5e
  default; round-trip test; boundary lint green.
- **RC-SYS-1.2 — Built-in packages: D&D 5e reference and Generic/narrative.** `M` · P1 · Deps: 1.1
  · Owns: `packages/core/src/systems/{dnd5e,generic}.ts` (new), `systems/index.ts`. 5e carries the
  six attributes, the 15 conditions (icons matching the DS `CONDITIONS` registry), spell slots 1–9,
  hit dice, class resources (ki, rage, bardic inspiration, channel divinity, sorcery points,
  superiority dice, wild shape, lay on hands, action surge, second wind — with max formulas by
  class/level), the XP table, CR→XP, skills. Generic carries: no attributes (or three approaches
  behind a flag), `hp` + `stress`, four conditions, d6 pool dice, no turn order, milestone
  advancement, freeform creature schema. Acceptance: snapshot tests; every 5e constant currently
  hardcoded in core has a test asserting the package value equals the old literal (so SYS-2 can
  swap safely).
- **RC-SYS-1.3 — Commands: `system.select`, `system.define`, `system.update`, `system.delete`,
  `system.fork`.** `M` · P1 · Deps: 1.1 · Owns: `commands/system-package.ts` (new), `dispatch.ts`,
  `schemas/commands.ts`, `queries/system-switch-query.ts` (extend the dry-run to report which
  character resources/conditions/attributes map, carry over, or drop — per instance counts, like the
  widget preview does). DM-only; `custom:` id namespace like ADR-023; delete refused while active or
  while any character references a resource the package defines; select requires the dry-run's
  `acknowledgeLoss` when drops exist. Events: `system.changed`. Acceptance: 30+ core tests
  (authority, fail-closed validation, fork copies + re-ids, select migrates the active id, replay
  determinism).
- **RC-SYS-1.4 — Actor-scoped read: `getActiveSystemForActor`, `resolveVocabulary`.** `S` · P1 ·
  Deps: 1.1 · Owns: `queries/system-query.ts` (new), `index.ts`. Returns the package with DM-only
  authoring metadata stripped for players. Acceptance: tests for both roles.

### Epic SYS-2 — Re-plumb the core domains onto the package (P1→P2)

Each story replaces literals with package reads, keeps behavior byte-identical under 5e (the
SYS-1.2 equality tests prove it), and adds one Generic-package test proving the domain degrades
gracefully when a concept is absent.

- **RC-SYS-2.1 — Characters read attributes/skills/derived from the package.** `L` · P1 · Deps:
  1.2, 1.4 · Owns: `state/character-state.ts`, `character-draft-flow.ts`, `character-sheet.ts`,
  `queries/character-query.ts` (`effectiveProficiencyBonus`, `passivePerception` become
  package-derived), `commands/character.ts`. Ability scores become `attributes: Record<key,
score>` with a 5e hydrator from the six fixed fields (no schema bump if the hydrator is
  byte-stable; otherwise bump `characters` with a migration). Acceptance: existing 3.7k core tests
  green; a Generic character with no attributes validates and renders "no attributes".
- **RC-SYS-2.2 — Resources and rest recovery from the package.** `M` · P1 · Deps: 2.1 · Owns:
  `state/character-resources.ts`, `commands/character-resources.ts`, `character-advancement.ts`.
  Spell slots and class resources become instances of package `resources[]`; `character.rest`
  applies each resource's `recovery`. Acceptance: 5e ki/rage/slots behave as before; Generic stress
  clock ticks and clears on scene end.
- **RC-SYS-2.3 — Conditions from the package.** `M` · P1 · Deps: 1.2 · Owns:
  `state/combat-tracker.ts`, `commands/combat.ts`, `apps/gm-react/src/ds/components/condition/*`
  (the `CONDITIONS` registry becomes a **default** fed from the active package at mount via a
  `SystemProvider` context), `app/EncounterBuilder.tsx` condition picker, `screens/session/
CombatTracker.tsx`. Acceptance: condition badge icons remain distinct-shape per package; a package
  with no conditions hides the picker with an honest note.
- **RC-SYS-2.4 — Dice model and turn model from the package.** `M` · P2 · Deps: 1.2 · Owns:
  `state/dice.ts`, `commands/dice.ts`, `state/combat-tracker.ts` (turn model), `ds/components/
domain/DiceResult.jsx`, `InitiativeRow.jsx`. Pool dice render successes; a `none` turn model
  turns the tracker into an unordered roster with a "spotlight" marker; `actions-per-turn` renders
  action pips. Acceptance: DiceResult snapshot per model; tracker spec per turn model.
- **RC-SYS-2.5 — Creature schema, encounter math, compendium mapping from the package.** `M` ·
  P2 · Deps: 1.2 · Owns: `state/encounter.ts`, `commands/encounter.ts`, `app/compendium/import.ts`,
  `app/charImport/ddbJson.ts`, `ds/components/creature/StatBlock.jsx`. CR/XP budget only when the
  package declares it; compendium import maps into the package's creature schema and refuses with a
  field report when the active package cannot hold a 5e monster. Acceptance: encounter challenge
  meter hides under Generic; import preview lists unmapped fields.
- **RC-SYS-2.6 — Vocabulary everywhere.** `M` · P2 · Deps: 1.4, UX-1.2 · Owns: the i18n message
  catalog keys that carry `{gm}`, `{spell}`, `{levelUp}` placeholders; `AppShell`, `nav.ts`
  subtitles, `Session`, `Characters`, `Player`. "Dungeon Master/DM" is what the 5e package says; a
  horror package says "Keeper". Acceptance: e2e that switches to Generic and asserts the chrome says
  "GM".
- **RC-SYS-2.7 — Widget bodies and templates read the package.** `S` · P2 · Deps: WID-1.3 · Owns:
  `app/widget-bodies.tsx` (character/initiative bodies), template renderers. Acceptance: character
  widget under Generic shows hp+stress, no AC/ability chips.

### Epic SYS-3 — System authoring and switching UX (P2)

- **RC-SYS-3.1 — System Package Picker (the front door).** `M` · P2 · Deps: 1.3, STB-2.3 · Owns:
  `screens/extensions/System.tsx`, new `ds/components/system/SystemPackageCard.jsx`. Realize
  `docs/design-package/templates/system-package-picker/` : a gallery of packages (built-in, custom,
  installed) each showing what it declares (attribute count, resources, conditions, dice model) as
  chips, the active-package context, a Gallery ↔ Detail layout, and the "Build your own" entry.
  Acceptance: e2e `systems.spec.ts` (new) selects Generic through the dry-run dialog and back.
- **RC-SYS-3.2 — Switch dry-run dialog v2.** `S` · P2 · Deps: 1.3, 3.1 · Owns: same files. Shows
  the SYS-1.3 findings grouped as maps / carries over / drops with instance counts, a typed
  acknowledgment for drops, and a "Export a backup first" link into Settings › Vault. Acceptance:
  destructive switch impossible without acknowledgment (e2e).
- **RC-SYS-3.3 — System builder (fork & edit).** `L` · P2 · Deps: 1.3, 3.1 · Owns:
  `screens/extensions/SystemBuilder.tsx` (new), `app/systemBuilder/*` (new). A stepper (DS
  `Stepper`): Identity & vocabulary → Attributes → Resources (with the formula grammar helper and
  live evaluation preview at level 1/5/10/20) → Conditions (icon picker restricted to the icon
  vocabulary) → Dice & turns → Creature schema → Advancement → Review (JSON preview, validation
  issues inline, "Fork from" origin shown). Saves via `system.define`/`update`. Acceptance: e2e
  forks 5e, renames "Dungeon Master" to "Keeper", adds a "Sanity" resource, activates it, and the
  Player sheet shows Sanity.
- **RC-SYS-3.4 — Package export/import and marketplace listing kind.** `M` · P2 · Deps: 1.3, CLD-4.1
  · Owns: `commands/system-package.ts` (export/import helpers), `screens/community/*` (listing kind
  `system-package`). Same JSON install path as widget packages, same trust review (a package is
  data; it needs no host permissions). Acceptance: round-trip test; Community shows a System
  Packages filter.
- **RC-SYS-3.5 — Pathfinder 2e sample package (data only, community-style).** `M` · P2 · Deps: 1.2 ·
  Owns: `packages/core/src/systems/samples/pf2e.json`, a test. Three-action economy, PF2e
  conditions, level 1–20, proves the contract from outside the built-in set. Ships in the starter
  library, not built-in. Acceptance: installs and activates via the picker; tracker shows action pips.

---

## 6. Workstream WID — Widgets: sandbox runtime, manual builder, AI builder, trust

**Outcome.** Widgets are the platform primitive the widget brief describes. Custom widgets render in
a real sandbox with a versioned host API; a DM builds a widget in a form-driven builder without
writing code (and with code, behind an advanced step); the assistant can propose a widget from a
prompt; every installed package goes through a real trust review; and the starter library ships
working widgets, not shells.

**Current state (G2–G5).** Definition/package/instance model, bindings, operator authority,
library query, package install/enable/disable/remove/upgrade/export, review summary, sandbox
security model, exfiltration gate — all in core with tests. In the app: ten builtin bodies in
`widget-bodies.tsx` behind the WID-1.1 render resolver, and a declarative renderer per `template`
kind in `app/widgets/templates/` reading `dataQueries` through `app/widgets/dataEnvironment.ts`
(WID-1.2; a builtin body still wins over the generic template for the same widget type);
Extensions › Plugins = starter library + JSON textarea + the step-by-step widget builder
(`screens/extensions/WidgetBuilder.tsx` over `app/widgetBuilder/`, WID-2.1: identity/layout/data/
config/commands/style/advanced/review, live preview through the WID-1.1 resolver, install or
upgrade with a generated migration); no renderer for `custom-html-js`; no trust-review command; no
AI path. Reference: `docs/architecture/WIDGET_FEATURE_BRIEF.md` (from
branch `claude/widget-design-brief-y8qc5a`; cherry-picked in STB-1.2).

**Contracts.** ADR-030 (RC-STB-4.2); `security/widget-host-api.ts` is the host API contract;
`WIDGET_RENDER_HOST_API_VERSION = 1`; SEC-011 exfiltration policy; `configFields` groups
content/display/style; style tokens exposed as `--widget-<name>`.

### Epic WID-1 — Sandbox runtime host and template renderers (P1, critical path)

- **RC-WID-1.1 — Unified widget render resolver.** `M` · P1 · Deps: STB-2.6 · Owns:
  `app/widgets/resolveRenderer.ts` (new), `app/widget-bodies.tsx` (becomes the `builtin` branch),
  `app/SceneBoardCanvas.tsx` (`WidgetFrame` calls the resolver). One render path for every surface:
  `builtin` | `template` | `custom` | `placeholder` — never throws; a failing renderer yields the
  placeholder with the diagnostic and `coreStateAvailable: true`. Acceptance: unit test per branch;
  `canvas.spec.ts` green; the placeholder shows the widget brief's "disabled, preserved" copy.
- **RC-WID-1.2 — Template renderers for all eight template kinds.** `L` · P1 · Deps: 1.1 · Owns:
  `app/widgets/templates/{DataTable,StatusList,Tracker,ActionPanel,SceneMessage,Chart,StatBlock,
FormPanel}.tsx` (new), built on DS `DataTable`, `ProgressMeter`, `StatBlock`, `Stat`, etc. Each
  reads the definition's `dataQueries` through a new `app/widgets/dataEnvironment.ts` that resolves
  the eight `WidgetDataQuerySource`s against actor-filtered core reads, honors `audience`, and
  evaluates `computedFields`. Acceptance: a fixture package per template renders in a unit test; a
  player actor never receives `dm` audience rows (test).
- **RC-WID-1.3 — Iframe sandbox host for `custom-html-js`.** `L` · P1 · Deps: 1.1, STB-4.2 · Owns:
  `app/widgets/SandboxHost.tsx` (new), `app/widgets/hostBridge.ts` (new), `public/widget-host.html`
  (new, the sandboxed document), `electron/main.cjs` CSP for the sandbox origin,
  `platform-access-exceptions.json`. Opaque-origin iframe (`sandbox="allow-scripts"`), `srcdoc`
  built from the package assets, `postMessage` protocol = host API v1: `ready`, `render(props)`,
  `configChanged`, `bindingChanged`, `dispatch(commandDescriptor)` (routed through `widget.dispatch-
command` with the operator-authority check), `requestPermission(kind)` → denied unless the
  package's review approved it, `outbound(url)` → `evaluateWidgetOutboundRequest`. Theme tokens are
  forwarded as CSS variables when the style capability `host-theme-tokens` is declared. Resize
  observer reports content height. Acceptance: a fixture custom widget renders, receives a config
  change, is refused clipboard by default, and its crash isolates (e2e `custom-widgets.spec.ts`,
  new); `security/renderer-isolation.ts` tests extended to the host document.
- **RC-WID-1.4 — Worker sandbox (data-only widgets).** `M` · P2 · Deps: 1.3 · Owns:
  `app/widgets/WorkerHost.ts`. Same protocol without DOM; result rendered through a template.
  Acceptance: fixture; a worker that loops is terminated on the host timeout and shown as a
  placeholder.
- **RC-WID-1.5 — Trust review command + UI.** `M` · P1 · Deps: STB-4.2 · Owns:
  `packages/core/src/commands/widget-package.ts` (`widget.package.review` — DM-only, records per
  host-permission decisions and a trust state, appends an op, requires the review summary's
  recommendation to be acknowledged when it is `deny-until-fixed`), `screens/extensions/Plugins.tsx`
  (a review sheet listing each requested permission with the summary's reasoning and Allow/Deny
  toggles). Acceptance: core tests; e2e installs a starter, reviews it, enables it, places it.
- **RC-WID-1.6 — Real starter library.** `M` · P2 · Deps: 1.2, 1.3, 1.5 · Owns:
  `packages/core/src/state/starter-widgets/*.ts` (new; replaces the three shells in
  `Extensions.tsx`). Ship: Table Roller (template `action-panel` bound to a `dice-table` object),
  Weather Tracker (`tracker` + config), Party Loot Ledger (`data-table` with `outputWrites` to a
  note), Countdown Clock (`tracker`), Rumor Board (`scene-message`), NPC Quick Card (`stat-block`
  binding), and one `custom-html-js` showcase ("Torchlight" flicker card) to exercise the sandbox.
  Acceptance: each is placeable and functional in e2e.

### Epic WID-2 — Manual widget builder (P1→P2, critical path)

- **RC-WID-2.1 — Builder shell and definition editor.** `L` · P1 · Deps: 1.2, STB-2.3 · Owns:
  `screens/extensions/WidgetBuilder.tsx` (new), `app/widgetBuilder/*` (new). A full-screen overlay
  (same focus/Back contract as MapEditor): left = stepper (Identity → Layout → Data → Config fields →
  Commands → Style → Advanced → Review), center = live preview rendering through WID-1.1 with
  representative sample data, right = the definition JSON (read-only, copyable). Steps write a draft
  in component state; Review dispatches `widget.package.install` (new id) or `upgrade` (existing,
  with a generated migration when config keys changed). Identity: type id (slug-validated), name,
  category, icon (vocabulary picker), surfaces, supported profiles. Layout: default/min size,
  resize policy, dock preference. Acceptance: e2e `widget-builder.spec.ts` (new) builds a
  `status-list` widget bound to current combatants and places it on a scene.
- **RC-WID-2.2 — Data step: bindings, data queries, computed fields.** `M` · P1 · Deps: 2.1 · Owns:
  `app/widgetBuilder/DataStep.tsx`. Pick a template kind; add data queries from the eight sources
  with audience + capability; declare required/optional bindings with entity types and modes;
  computed fields with the SYS-1.1 formula grammar over query columns. Acceptance: preview updates
  live against the demo vault; a `dm` audience query previews as hidden when "Preview as player".
- **RC-WID-2.3 — Config-fields and commands steps.** `M` · P2 · Deps: 2.1 · Owns:
  `app/widgetBuilder/{ConfigStep,CommandsStep}.tsx`. Config fields (text/textarea/number/select/
  toggle/color; group content/display/style; defaults; validation). Commands: pick from a catalog of
  templated command descriptors (roll, advance, tick, set-value, write-note-line…) with
  operate/configure verbs auto-classified per `widget-operator-authority.ts`. Acceptance: the
  Inspector (SceneEditor) renders the built config fields; a viewer cannot fire configure verbs.
- **RC-WID-2.4 — Style step.** `S` · P2 · Deps: 2.1, DSN-1.1 · Owns: `app/widgetBuilder/
StyleStep.tsx`. Declare `--widget-*` tokens with defaults picked from the semantic token list
  (never raw hex unless `custom-stylesheet` capability), isolation mode, capabilities. Acceptance:
  tokens appear in the Inspector's Style group and re-theme with `data-theme`.
- **RC-WID-2.5 — Advanced step: custom HTML/JS.** `M` · P2 · Deps: 1.3, 2.1 · Owns:
  `app/widgetBuilder/AdvancedStep.tsx`. A code editor (plain `<textarea>` with mono font, line
  numbers, and a "format" button — no heavy editor dependency), host API reference panel, requested
  host permissions with the security summary recomputed live, and the SEC-011 destination-class
  picker. Acceptance: the preview runs in the WID-1.3 sandbox; the Review step shows the trust
  recommendation before install.
- **RC-WID-2.6 — Edit-in-place from the canvas.** `S` · P2 · Deps: 2.1, CAN-4.2 · Owns:
  `screens/SceneEditor` inspector ("Edit widget definition" for user-authored packages). Acceptance:
  round-trip edit → upgrade → placed instance migrated.
- **RC-WID-2.7 — Export/share and versioning UX.** `S` · P2 · Deps: 2.1 · Owns: Plugins panel.
  Export downloads the package JSON (via `exportFile`); "New version" pre-fills the builder with a
  bumped semver and a migrations stub; changelog field. Acceptance: upgrade path e2e.

### Epic WID-3 — AI widget builder (P2)

- **RC-WID-3.1 — MCP tool `widget.package.propose`.** `M` · P2 · Deps: 1.2, AI-1.2 · Owns:
  `packages/core/src/mcp/tool-registry.ts`, `mcp/agent-dispatch.ts`, `state/widget-package-state.ts`
  (`scaffoldCustomWidgetPackageDraft` gains template/query/config parameters). Input: a natural-
  language spec the model has already turned into a structured draft (template kind, queries,
  config, commands, style); output: a staged proposal whose payload is a validated
  `WidgetPackageDefinition` with provenance `generated` and the prompt hash. The description teaches
  the model the eight sources and templates. Acceptance: core tests; `scripts/ai-agent-smoke.ts`
  gains a "make me a loot ledger widget" case against local Ollama.
- **RC-WID-3.2 — "Generate a widget" dialog on the canvas and in the builder.** `M` · P2 · Deps:
  3.1, 2.1, AI-2.1 · Owns: `app/widgetBuilder/GenerateDialog.tsx` (new), `screens/SceneEditor`
  (replaces the deferred AI-generate entry), `screens/extensions/Plugins.tsx`. Prompt → run status
  (reusing the ADR-025 phase line) → the proposal opens **in the manual builder at the Review step**
  with every generated field editable, the trust summary, and Install. Never installs without the
  DM pressing Install. Acceptance: e2e with the transport stubbed; the installed package carries
  `authoring.source = 'generated'` and shows a "Generated" badge in Plugins.
- **RC-WID-3.3 — Iterate on a generated widget.** `S` · P2 · Deps: 3.2 · Owns: same. "Ask the
  assistant to change…" from the builder re-runs with the current draft as context and diffs the
  result field-by-field before applying. Acceptance: unit test of the diff view.

### Epic WID-4 — Widget catalog depth (P2)

- **RC-WID-4.1 — Missing builtin bodies.** `M` · P2 · Deps: 1.1 · Owns: `app/widget-bodies.tsx`
  split into `app/widgets/builtin/*.tsx`. Bodies for `atlas`, `characters`, `data-hub`,
  `getting-started`, `notes`, `object`, `player-views`, `search`, `session`, `tools` (today they fall
  to the generic block). Acceptance: every system widget type has a body snapshot test.
- **RC-WID-4.2 — Per-widget operate controls on the canvas.** `M` · P2 · Deps: 1.1 · Owns:
  `app/widgets/builtin/*`. Timer start/pause/reset, dice roll, initiative advance directly on the
  tile (they exist through `widget.dispatch-command`; make every declared operate command a visible
  control with keyboard access). Acceptance: `canvas.spec.ts` operates a timer by keyboard.
- **RC-WID-4.3 — Widget bindings inspector.** `M` · P2 · Deps: CAN-4.1 · Owns: `screens/scene/
BindingInspector.tsx` (new). Search DM-scoped entities, pick binding mode, show resolver state
  (`available/unbound/missing/hidden/conflicted/degraded`) with the fail-closed copy from the
  brief. Acceptance: binding a player-hidden NPC shows `hidden` to a player preview (e2e).

---

## 7. Workstream CAN — Customizable canvas spaces: scenes, the GM Screen board, tiles

**Outcome.** The scene canvas and the GM Screen are the mission-control surfaces the widget brief
and I20 describe: tiles are recognizable at a glance, creation is a two-click gallery with live
preview, layout edits are reversible, the board is fit-first and keyboard-complete on desktop and a
stacked, thumb-reachable panel list on phones, a map tile brings combat onto the board, and scenes
carry templates, backgrounds, docks, and sections that the core already models.

**Current state (G6, G7).** `Board.tsx` (bounded home scene, presets + safe point), `SceneEditor.tsx`
(free canvas, tiered inspector, add panel, metadata), `SceneBoardCanvas.tsx` (dot grid, select/
drag/resize, roving tabindex, arrows/Shift+arrows/Delete). Core scene state already has
`SceneBackground` (paper/parchment/dark/grid), `WidgetDock`, `SectionLayoutRegion`,
`SceneTemplateMeta`, `PlayerViewAssignment`, focus order, command-center presets/auto-save, and
`layout-commands.ts`/`focus-order.ts` queries. No history, no restore, no tile identity, no mobile
board, no map tile.

**Contracts.** ADR-031 (RC-STB-4.3); `NAVIGATION_CONTRACT` (board tile commands are contextual, not
global); every pointer op = a command; WCAG 2.5.7 drag alternatives.

### Epic CAN-1 — Layout history and reversible destruction (P1, critical path)

- **RC-CAN-1.1 — Core inverse builders for scene layout ops.** `M` · P1 · Deps: STB-4.3 · Owns:
  `packages/core/src/queries/layout-commands.ts` (`buildSceneInverse(op)` for move/resize/
  configure/add/destroy/set-focus-order/dock), tests. Acceptance: for each op, apply → inverse →
  byte-identical scene.
- **RC-CAN-1.2 — `scene.restore-widget` + tombstones.** `M` · P1 · Deps: 1.1 · Owns:
  `state/scene-state.ts` (`Scene.tombstones[]` with `destroyedAt`, additive, hydrator-safe),
  `commands/widget.ts`, `schemas/commands.ts`, `dispatch.ts`. Restore re-inserts the instance with
  its layout/config/binding; tombstones expire after 30 days on next mutation. Acceptance: tests;
  replay determinism.
- **RC-CAN-1.3 — App-side undo/redo stack for both canvases.** `M` · P1 · Deps: 1.1, 1.2 · Owns:
  `app/canvas/useLayoutHistory.ts` (new), `screens/Board.tsx`, `screens/SceneEditor.tsx`,
  `app/SceneBoardCanvas.tsx` (toolbar Undo/Redo, `Ctrl+Z`/`Ctrl+Shift+Z` scoped to the canvas).
  Stack depth 50, cleared on scene change, never synced. Destroy becomes an undo toast ("Removed
  Timer — Undo") instead of a confirm dialog, backed by restore. Acceptance: `canvas.spec.ts` undo
  move/resize/destroy on both profiles; live region announces "Undone: moved Timer".

### Epic CAN-2 — Tile identity and content depth (P2)

- **RC-CAN-2.1 — Tile-type semantic tokens.** `S` · P2 · Deps: DSN-1.1 · Owns: `styles/tokens/
colors.css` (`--color-tile-{note,combat,encounter,dice,generator,handout,timer,calendar,map,
character,audio,reference}` per theme, OKLCH-harmonised in the warm family; forced-colors remap),
  `scripts/a11y-nontext-contrast-lint.ts` (add the pairs). Acceptance: contrast lint green in all
  themes.
- **RC-CAN-2.2 — Tile header identity.** `M` · P2 · Deps: 2.1, WID-1.1 · Owns:
  `app/SceneBoardCanvas.tsx` (`WidgetFrame`), `app/widgets/tileMeta.ts` (new: `TILE_TYPE_METADATA`
  — accent token, icon, silhouette class, one-line description; derived from the widget
  definition's `category` + `icon`, overridable per definition). 4px accent left rail, 16px icon,
  label, visibility chip, binding-state link glyph, safe entity name (never a hidden binding's name).
  Acceptance: snapshot per type in all three themes; the "one second scan" rule verified by a
  reviewer note in the PR.
- **RC-CAN-2.3 — Note tile depth levels.** `M` · P2 · Deps: 2.2, KNW-1.1 · Owns:
  `app/widgets/builtin/Note.tsx`, the note widget's `configFields` (`depth: title|summary|full`),
  a depth badge in edit mode. Full depth uses the shared markdown renderer and virtualizes over 200
  lines (IntersectionObserver sentinels). Acceptance: e2e toggles depth; perf test renders a 2,000-
  line note tile under the `widget-update` budget.
- **RC-CAN-2.4 — Tile action menu.** `M` · P2 · Deps: 2.2, CAN-1.3 · Owns: `WidgetFrame`
  (`…` IconButton → DS `Popover` with `role="menu"`): Move (keyboard move mode), Resize, Duplicate
  (new core `scene.duplicate-widget`, `S` core story folded here), Bind…, Configure…, Visibility
  submenu, Open source (note/map/character deep link), Remove. Acceptance: menu keyboard pattern
  test; `canvas.spec.ts` duplicates a tile.
- **RC-CAN-2.5 — Resize presets and keyboard resize.** `S` · P2 · Deps: 2.4 · Owns:
  `SceneBoardCanvas.tsx`. Handle click without drag cycles S/M/L presets from the definition's
  `defaultSize`/`minSize`; resize mode with arrows and live-region size announcements. Acceptance:
  e2e keyboard resize.

### Epic CAN-3 — Board interaction model (P2)

- **RC-CAN-3.1 — Fit / Comfortable / Detail zoom presets.** `M` · P2 · Owns: `screens/Board.tsx`,
  `app/SceneBoardCanvas.tsx`. Replace the free scale with three named presets (`0`/`1`/`2` keys,
  `+`/`-` cycle), Fit never below 0.5 (scroll instead). The free scene canvas keeps continuous
  zoom but gains the same three presets as anchors. Acceptance: e2e; the bounded policy note in
  `Board.tsx` updated.
- **RC-CAN-3.2 — Scroll-natural pan.** `S` · P2 · Deps: 3.1 · Owns: same. Wheel scrolls, Shift+wheel
  horizontal, middle-drag / two-finger pans, single-finger scrolls on touch, no pinch-zoom on the
  board. Acceptance: `responsive.spec.ts` reachability on the board at 320×640.
- **RC-CAN-3.3 — Column-overflow guard and "Fix layout".** `S` · P2 · Owns: `app/board-helpers.ts`
  (greedy repack), `Board.tsx` banner. Acceptance: unit test of repack; e2e banner appears after an
  off-grid drop is snapped back.
- **RC-CAN-3.4 — Layout quality indicator.** `S` · P2 · Deps: 3.3 · Owns: `Board.tsx`. Overlap +
  overflow detection, `Popover` list with "Select" per issue, shape+color status. Acceptance: unit.
- **RC-CAN-3.5 — Keyboard model completion.** `M` · P2 · Deps: 1.3, 2.4 · Owns:
  `SceneBoardCanvas.tsx`. Tab reading order from focus-order metadata (z/group/dock/pin), Enter
  enters tile content, Space = move mode, `a` = add gallery, Delete = undoable remove, spatial
  nearest-neighbour arrow navigation between tiles (the brief's "spatial" mode) alongside nudge.
  Acceptance: an axe + keyboard-only e2e that builds a three-tile board with no pointer.
- **RC-CAN-3.6 — Multi-select, align/distribute, group, z-order.** `L` · P2 · Deps: 1.1, 3.5 ·
  Owns: `SceneBoardCanvas.tsx`, `app/canvas/geometry.ts` (new pure module: marquee "fully
  enclosed" selection, align left/center/right/top/middle/bottom, distribute, bring forward/back),
  core `scene.set-widget-order` + `scene.group-widgets` (additive; `S` core story folded). The
  numeric `TransformPanel` (x/y/w/h/rotation) in the inspector. Acceptance: pure-module unit tests;
  e2e aligns three tiles by keyboard.

### Epic CAN-4 — Creation flow, gallery, palette, map tile (P2)

- **RC-CAN-4.1 — Tile gallery sheet with live previews.** `M` · P2 · Deps: 2.2, WID-1.1 · Owns:
  `app/canvas/AddWidgetGallery.tsx` (new; replaces the add panels in Board and SceneEditor). DS
  `Sheet` (phone) / side panel (desktop); Card per library entry with accent, icon, name,
  description, a **rendered miniature** from the template with sample data, category filter, search,
  profile-unsupported entries dimmed with the reason, "Start from template" header when the scene is
  empty, "Generate with assistant" entry (WID-3.2), "Build your own" entry (WID-2.1). Selecting adds
  at the next free slot and focuses the tile. Acceptance: e2e both profiles.
- **RC-CAN-4.2 — Inspector v2 (noun panel).** `M` · P2 · Deps: 2.4, WID-4.3 · Owns:
  `screens/scene/Inspector.tsx` (split from SceneEditor). Tabs: Content / Display / Style
  (from `configFields` groups), Binding (WID-4.3), Transform, Visibility (with the "who sees this"
  preview line). Empty selection shows scene properties (background, docks, sections, template
  meta). Acceptance: `canvas.spec.ts` configure round-trip retained.
- **RC-CAN-4.3 — `>board` and `>scene` command-palette actions.** `S` · P2 · Deps: 4.1 · Owns:
  `app/CommandPalette.tsx`, `packages/core/src/queries/command-actions.ts` (contextual action
  provider). Add tile of type…, Apply template…, Toggle edit, Undo. Visible only on those routes.
  Acceptance: `command-palette.spec.ts`.
- **RC-CAN-4.4 — Scene templates picker with thumbnails.** `M` · P2 · Deps: 4.1 · Owns:
  `app/canvas/TemplatePicker.tsx` (new), core `command-center` presets reused for scenes
  (`scene.apply-template` — `S` core story: instantiate a preset's widgets into any scene).
  Built-ins: Combat scene, Social encounter, Exploration, Town visit, Session prep — each with a
  generated miniature. User-saved templates show a live miniature. Surfaced only at the three
  contextual moments (empty state, gallery header when empty, palette). Acceptance: e2e applies a
  template to a fresh scene.
- **RC-CAN-4.5 — Map tile.** `L` · P2 · Deps: MAP-2.3, WID-1.1 · Owns:
  `app/widgets/builtin/Map.tsx`, the `map` widget definition (`configFields`: initialZoom, combat
  overlay, follow party), `app/map/MapCanvas` reuse. Renders the actor-filtered `getMapViewForActor`
  inside the tile with pan/zoom; combat overlay draws session tokens/AoE synced with the tracker;
  action menu: Change map, Toggle combat overlay, Open in editor, Project to players. Player view
  projection of a map tile obeys fog. Acceptance: e2e places a map tile, starts combat, sees tokens.
- **RC-CAN-4.6 — Scene backgrounds, docks, and sections UI.** `M` · P2 · Deps: 4.2 · Owns:
  Inspector scene panel, `SceneBoardCanvas.tsx`. Background picker (paper/parchment/dark/grid),
  dock a widget to an edge (`scene.dock-widget` exists? — verify `layout-commands.ts`; add if
  missing as an `S` core story), section regions drawn as labelled bands. Acceptance: e2e.

### Epic CAN-5 — Mobile board and session posture (P2)

- **RC-CAN-5.1 — Compact stacked-panel board.** `L` · P2 · Deps: 2.2 · Owns:
  `app/canvas/StackedBoard.tsx` (new), `Board.tsx`, `SceneEditor.tsx` (phone tier). Tiles sorted by
  y then x as collapsible panels (48px headers), expanded state in `sessionStorage` keyed by scene,
  full-screen expand per tile (`maximize-2`) bounded above the bottom nav, no zoom/pan. Acceptance:
  `responsive.spec.ts` at 320×640 and 360×360; a11y gate on `/board` mobile.
- **RC-CAN-5.2 — Floating session action bar (phone, session live).** `M` · P2 · Deps: 5.1, SES-1.1
  · Owns: `app/canvas/SessionActionBar.tsx` (new). d20/d6 roll buttons, Next turn (when combat is
  active, combat accent), Handout. `role="toolbar"`. Acceptance: e2e.
- **RC-CAN-5.3 — Touch-first combat tile.** `M` · P2 · Deps: SES-3.2 · Owns:
  `app/widgets/builtin/InitiativeTracker.tsx` compact variant (56px rows, tappable HP → numeric
  keypad sheet, swipe-left quick actions with keyboard alternative). Acceptance: e2e on mobile.

### Epic CAN-6 — Player-view projection and previews (P2)

- **RC-CAN-6.1 — Player-view preview overlay on the canvas.** `M` · P2 · Deps: 2.2 · Owns:
  `screens/SceneEditor`, `app/ViewAsControl.tsx`. Non-destructive "what player X sees" overlay
  that dims DM-only tiles and shows the visibility reason per tile; editing suspended; exits with
  Escape. Acceptance: e2e; `isolation-guard`-style assertion that the overlay uses the actor read.
- **RC-CAN-6.2 — Per-player scene assignments UI.** `S` · P2 · Owns: `screens/session/
ActiveMap.tsx`, `app/ProjectionControl.tsx`. Surface `PlayerViewAssignment`/`session.assign-
player-view` so different players can be projected different scenes. Acceptance: `player-view.spec`.
- **RC-CAN-6.3 — Board empty states and first-tile onboarding.** `S` · P3 · Deps: DSN-3.1, 4.1 ·
  Owns: `Board.tsx`, `SceneEditor.tsx`. EmptyState with illustration `session-board-empty`, primary
  "Add your first tile", secondary "Apply a template"; repeat-empty shows only the primary.
  Acceptance: e2e.

---

## 8. Workstream MAP — Maps: combat on the map, spatial intelligence, editor depth

**Outcome.** The map tool is the most spatial and fluid tool in the app (I19's outcome statement),
and it is also where combat happens: tokens tied to the tracker, ranges and AoE templates, fog
revealed live to players with animation, party location tracked through the atlas hierarchy, and
travel measured. The generation suite gains the ADR-024 follow-ups and a real asset/stamp library.
Import handles real images end-to-end. Everything remains engine-free SVG per ADR-014/024.

**Current state (G8).** ADR-024 suite: 13 generators, geometry kit, derivations, UVTT export,
editor with tool rail (select/marquee/pan · terrain brush/fill/erase · room/wall/door/water ·
stamp/scatter · light · fog · token · poi/route/text/measure · generate), options bar, 4-panel dock
(Inspector/Layers/Assets/History), status bar, local undo/redo, keyboard map, Quick Map rail on
Android, projection kinds (flat/equirectangular/web-mercator), regions, scale, nesting, travel
state, LOS query. Not in the UI: combatant tokens with vitals, ranges/paths, AoE, condition
markers, token↔tracker sync, party marker, hierarchy breadcrumb, travel-time, LOS/lighting
visualization, fog reveal animation, list view for AT users, POI note-creation flow, canvas-2d
bake, room-graph view.

**Contracts.** ADR-014/024 (vector model, no pixel engine, delta ops, local undo), ADR-033
(RC-STB-4.5), MAP-012 fog op log, `getMapViewForActor` as the only player-facing read.

### Epic MAP-1 — Combat-on-map model (P1)

- **RC-MAP-1.1 — Session combat tokens.** `L` · P1 · Deps: STB-4.5 · Owns:
  `packages/core/src/state/combat-tracker.ts` (`SessionCombatState.tokens: Record<combatantId,
{mapId, x, y, size, facing?}>`, additive), `commands/combat.ts` (`combat.place-token`,
  `combat.move-token`, `combat.remove-token`, auto-place on `combat.start` when the active map is
  set), `queries/combat-tracker-view.ts` and `map-query.ts` (tokens joined into
  `getMapViewForActor` with the same visibility as the combatant), tests. Players see only visible
  combatants' tokens; hidden foes are absent, never "unknown at (x,y)". Acceptance: 25+ tests incl.
  replay and a leak test.
- **RC-MAP-1.2 — AoE templates and measurement as ephemeral session state.** `M` · P1 · Deps: 1.1 ·
  Owns: `state/combat-tracker.ts` (`templates[]`: sphere/cone/line/cube in normalized units +
  origin + rotation), `commands/combat.ts` (`combat.place-template`, `remove-template`, cleared on
  `combat.end`), `geometry/` (cells-covered helpers for square and hex grids). Acceptance: geometry
  tests against known 5e template coverage tables.
- **RC-MAP-1.3 — Movement range and path.** `M` · P1 · Deps: 1.1, SYS-1.1 · Owns:
  `queries/map-movement.ts` (new): BFS over grid cells with wall/door/difficult-terrain costs from
  layer features (`props.terrain = difficult`), speed from the package's speed model, returns the
  reachable set and a shortest path. Acceptance: tests on fixture dungeons; performance under the
  `map-pan-zoom-desktop` budget for a 60×60 grid.
- **RC-MAP-1.4 — Party location and atlas breadcrumb reads.** `S` · P1 · Owns:
  `state/session-state.ts` (`partyLocation: {mapId, x, y}`; additive), `commands/session-control.ts`
  (`session.mark-party`), `queries/map-query.ts` (`getMapBreadcrumbForActor` using nesting).
  Acceptance: tests; `prep-recap-digest` includes the party location.

### Epic MAP-2 — Combat and live-play on the editor canvas (P2)

- **RC-MAP-2.1 — Token layer UI.** `L` · P2 · Deps: 1.1 · Owns: `app/map/canvas/EditorCanvas.tsx`,
  `app/map/tools.ts` (token tool becomes "combatant" aware), `app/map/dock/InspectorPanel.tsx`.
  Tokens render initials avatar or portrait, an HP bar (DS `HPBar`), condition mini-badges from the
  package registry, active-turn ring; dragging dispatches `combat.move-token` with snapping; clicking
  selects the combatant in the tracker and vice versa (shared selection via a `SessionSelection`
  context). Acceptance: `map-editor.spec.ts` + `combat.spec.ts` sync case.
- **RC-MAP-2.2 — Range/path overlay and AoE tool.** `M` · P2 · Deps: 1.2, 1.3, 2.1 · Owns:
  `app/map/tools.ts` (new `Combat` tool group: move, template sphere/cone/line/cube, measure),
  `ToolOptionsBar.tsx` (template size, rotation), `EditorCanvas.tsx` (reachable cells highlight,
  path preview, affected cells). Keyboard: arrows move the selected token one cell, `Enter` commits.
  Acceptance: e2e places a cone and the status bar lists affected combatants.
- **RC-MAP-2.3 — Shared `MapCanvas` combat overlay for Atlas, Session stage, and the map tile.**
  `M` · P2 · Deps: 2.1 · Owns: `app/map/MapCanvas.tsx` (extracted from MapBuilder in STB-2.6),
  `screens/session/ActiveMap.tsx`, `screens/Atlas.tsx`. Read-only overlay of tokens/templates
  everywhere the map is shown; the player projection obeys fog and visibility. Acceptance:
  `player-view.spec.ts` sees only visible tokens.
- **RC-MAP-2.4 — Live fog reveal to players with animation and sound cue.** `M` · P2 · Deps: 2.3,
  AUD-3.2 · Owns: `app/map/fogRegions.tsx`, `net/viewModels.ts` (fog delta in the player view-
  model), `app/map/MapCanvas.tsx` (0.8s ease-out fade on newly revealed regions, reduced-motion
  static), optional SFX trigger. Acceptance: `collab.spec.ts` reveal reaches the player; motion test.
- **RC-MAP-2.5 — Party marker and "Mark party here".** `S` · P2 · Deps: 1.4 · Owns: editor context
  menu, `ToolRail` (long-press sheet on touch). Acceptance: e2e; the marker projects to players.
- **RC-MAP-2.6 — Combat map persistence and archive.** `S` · P2 · Deps: 1.1 · Owns:
  `state/session-state.ts` archive snapshot (tokens/templates at end), `screens/session/
PrepRecap.tsx` (archived encounter shows the final map thumbnail). Acceptance: test + e2e.

### Epic MAP-3 — Editor depth and the ADR-024 follow-ups (P2)

- **RC-MAP-3.1 — Assets panel becomes a real stamp/prop library.** `M` · P2 · Deps: none · Owns:
  `app/map/dock/AssetsPanel.tsx`, `packages/core/src/generation/scatter.ts` (prop catalog as data:
  furniture, foliage, rubble, treasure, doors, stairs — vector glyphs), `app/map/tools.ts` stamp
  options. Categories, search, favorites, recent; drag-or-click placement; rotation/scale options.
  Acceptance: e2e stamps a prop; catalog snapshot test.
- **RC-MAP-3.2 — Raster import wizard v2.** `M` · P2 · Owns: `app/map/ImportMapDialog.tsx`,
  `app/map/canvas` (raster base layer), `state/map-import.ts`. Grid alignment step (drag two
  corners, cell size, square/hex), scale step ("1 square = 5 ft"), auto-trace walls option using
  the marching-squares pipeline over a luminance threshold (preview before commit), 50 MB cap with
  an honest size note, WebP/PNG/JPEG/SVG. Acceptance: `atlas.spec.ts` import case; a fixture image.
- **RC-MAP-3.3 — Canvas-2d bake layer for dense static fills.** `M` · P2 · Owns:
  `app/map/canvas/BakeLayer.tsx` (new). Terrain/biome fills bake to an offscreen canvas under the
  interactive SVG when feature count exceeds a threshold; hit-testing and a11y stay on SVG.
  Acceptance: perf sample under the pan/zoom budgets on the world generator's max output.
- **RC-MAP-3.4 — Room-graph view and stocking editor.** `M` · P2 · Owns: `app/map/dock/
GraphPanel.tsx` (new), `generation/stocking.ts` UI. A graph of rooms/corridors with stocking
  (monster/treasure/trap/empty) editable per node, keyed to the room polygons; selecting a node
  selects the room. Acceptance: e2e; graph derived by a pure core function with tests.
- **RC-MAP-3.5 — Live "immediate" generation knobs.** `S` · P2 · Owns: `generate/ParamControls.tsx`,
  `generation/registry.ts` (`applies: 'immediate'` params — sea level, forest density). Re-threshold
  without a full re-run where the generator supports it. Acceptance: perf under `widget-update`.
- **RC-MAP-3.6 — Lighting and line-of-sight visualization.** `M` · P2 · Owns:
  `app/map/canvas/LightLayer.tsx` (new) over `queries/map-los.ts`. Light features cast radius with
  walls occluding; a "player vision" preview from a selected token; dim/bright bands. Acceptance:
  visual snapshot; LOS tests already in core extended for doors.
- **RC-MAP-3.7 — Travel routes and travel time.** `M` · P2 · Deps: 1.4, SYS-1.1 · Owns:
  `app/map/tools.ts` route options (name, style), `state/map-travel.ts` UI, `queries/` travel-time
  by pace from the package (5e normal/fast/slow), status bar distance readout in scale units.
  Acceptance: e2e draws a route and reads "2 days at normal pace".
- **RC-MAP-3.8 — Map hierarchy breadcrumb and drill-down.** `S` · P2 · Deps: 1.4 · Owns:
  `app/map/MapEditor.tsx` header, `screens/Atlas.tsx` (tree in the local nav: `role="tree"`,
  arrow keys, filter). POI of kind `map-link` drills into the child map; Escape/Backspace goes up.
  Acceptance: e2e; `NAVIGATION_CONTRACT` local-nav rules honored.
- **RC-MAP-3.9 — Fog brush ergonomics and polygon lasso polish.** `S` · P2 · Owns:
  `ToolOptionsBar.tsx`, `EditorCanvas.tsx`. Live brush-radius preview circle, vertex counter in
  the status bar, dashed closing line, `Enter` closes, feather slider, "Clear all fog" confirm.
  Acceptance: e2e.
- **RC-MAP-3.10 — POI note-creation flow and popover.** `M` · P2 · Deps: KNW-1.3 · Owns:
  `app/map/dock/InspectorPanel.tsx` (POI section), `ds/components/map/POIPopover.jsx`. "Create
  note here" single-page dialog (title, type cards Location/NPC/Faction/Note, template stub) →
  `content.create-object` + link; hover/focus popover with 3-line preview and "Read note".
  Acceptance: e2e creates a linked NPC from a POI.

### Epic MAP-4 — Accessibility, mobile, and library UX (P2→P3)

- **RC-MAP-4.1 — List view and screen-reader inventory.** `M` · P2 · Owns: `app/map/
ListView.tsx` (new), `MapEditor.tsx` toggle. Accessible table of POIs/tokens/routes/layers with
  "Navigate to" per row; `role="application"` label with counts; live region for edit announcements
  (already partially present — audit and complete). Acceptance: axe on `/atlas` with the editor open;
  keyboard-only e2e edits a POI label.
- **RC-MAP-4.2 — POI keyboard navigation (nearest in cardinal direction).** `S` · P2 · Owns:
  `app/map/keyboard.ts`. Acceptance: unit test of the nearest-neighbour picker; e2e.
- **RC-MAP-4.3 — Touch gesture model on the editor.** `M` · P2 · Owns: `EditorCanvas.tsx`,
  `QuickMapRail.tsx`. Inertial pan, pinch centered on midpoint, double-tap zoom step, 300 ms
  long-press context sheet, touch fog brush with a drag handle. Acceptance: `android-quick-map.spec`.
- **RC-MAP-4.4 — Map library gallery.** `M` · P3 · Deps: DSN-3.1 · Owns: `screens/Atlas.tsx`.
  Card grid with 16:9 thumbnails rendered from the vector model (cached data-URI via a worker),
  region label, POI/layer chips, party-here badge, keyboard grid navigation, Space previews in the
  right panel; filtered/empty states with illustration `map-library`. Acceptance: e2e; thumbnails
  generated under 100 ms each in a perf test.
- **RC-MAP-4.5 — Editor onboarding and shortcut discovery.** `S` · P3 · Deps: UX-3.3 · Owns:
  `MapEditor.tsx`. First-open coach marks (once per vault) for rail → options → dock; every tool
  tooltip shows its key; `?` opens the shortcut overlay filtered to the map section. Acceptance:
  e2e; spotlight never repeats.

---

## 9. Workstream SES — Session-time experience

**Outcome.** The app knows when a session is live and shifts posture: navigation, panels, and
information prevalence serve the table. Dice are one action away everywhere, roll history is
labelled and exportable, rollable tables are first-class, combat is persistent, fast, and touch-
ready with condition durations and stat-block quick reference, and the session ends with a capture
flow that writes a session log and closes the loop on continuity.

**Current state (G9).** `screens/session/*` after STB-2.5: lifecycle, encounter builder, tracker,
dice, handouts, active map/projection, now-playing, campaign date, prep/recap digest, Google
Calendar scheduling. Core has `SessionWorkflowState`, `SessionTimer`, dice with visibility/source
kinds (`expression|macro|inline|table`), quick-reference panels, archives/recaps, presence,
`dice-table` objects, `prep-recap-digest`. Missing: app-level session posture, persistent dice
bar, roll labels, inline rolls, tables tab, condition durations, quick-ref in tracker, one-handed
HP, end-session capture, continuity integration.

### Epic SES-1 — Session posture as application state (P2)

- **RC-SES-1.1 — Session-live shell posture.** `M` · P2 · Deps: STB-2.6 (AppShell split) · Owns:
  `app/shell/{Sidebar,TopBar}.tsx`, `app/nav.ts` (a `liveBadge` on the Session entry), `styles`.
  When `session.workflow === 'active'`: Session nav item pulses (reduced-motion → static ring),
  the desktop right rail auto-opens the session quick panel (dice bar + turn + timer), the phone
  gets a 16px accent status strip above the tab bar with elapsed time, the top bar shows "Session
  live · 01:12". Acceptance: e2e on both profiles; `TOPBAR_CHARTER` respected (status only, no
  actions).
- **RC-SES-1.2 — Session quick panel (right rail / sheet).** `M` · P2 · Deps: 1.1 · Owns:
  `app/session/QuickPanel.tsx` (new). Dice bar (d4…d100 as die-face glyphs, Custom), current
  combatant + Next turn, timer, now-playing mini, Handout push. Available on every route while live.
  Acceptance: `combat.spec.ts` advances a turn from `/knowledge`.
- **RC-SES-1.3 — Start/End session flows.** `M` · P2 · Deps: 1.1 · Owns: `screens/session/
Lifecycle.tsx`. Start: "Continue [scene]?" / new with name; End: confirm → capture dialog (SES-4.1).
  Acceptance: e2e; the existing `allowedTransitionsFrom` gating retained.

### Epic SES-2 — Dice everywhere (P2)

- **RC-SES-2.1 — Roll labels, expansion, and export.** `S` · P2 · Owns: `screens/session/
DiceTray.tsx`, core `dice.label-roll` (`S` core: additive `label` on `SessionDiceRoll`). Per-die
  breakdown on hover/tap, nat-20/nat-1 flags, "Export roll log" into the session archive/recap.
  Acceptance: tests + e2e.
- **RC-SES-2.2 — Inline `[[roll:1d20+5]]` in notes and handouts.** `M` · P2 · Deps: KNW-1.1 · Owns:
  `packages/core/src/state/markdown.ts` (parse inline roll nodes), `app/markdown/RollButton.tsx`
  (new), `Knowledge`/`PlayerView` renderers. Click rolls with `source: 'inline'` into the session
  log when live; otherwise a local result chip. Acceptance: tests + e2e.
- **RC-SES-2.3 — Rollable tables tab.** `M` · P2 · Owns: `screens/session/Tables.tsx` (new),
  `queries/quick-reference-query.ts`. Lists `dice-table` objects (and tables the assistant created),
  Roll with weighted rows, pin to the quick panel, log with `source: 'table'`. Empty state per I17.
  Acceptance: e2e rolls a table.
- **RC-SES-2.4 — Dice drama.** `S` · P3 · Deps: DSN-1.3 · Owns: `ds/components/domain/
DiceResult.jsx`, motion tokens. Nat 20 gold shimmer (`--easing-spring`, static gold border under
  reduced motion), nat 1 red pulse, clean chip otherwise; per-package crit rules (SYS-2.4).
  Acceptance: visual snapshot; reduced-motion test.

### Epic SES-3 — Combat tracker depth (P2)

- **RC-SES-3.1 — Condition durations and round ticks.** `M` · P2 · Deps: SYS-2.3 · Owns: core
  `combat-tracker.ts` (`conditions: {key, rounds?}`), `combat.advance-turn` decrements at round
  start and emits `condition.expired`, tracker UI badge countdown + expiry toast. Acceptance: tests.
- **RC-SES-3.2 — One-handed HP sheet and undo.** `M` · P2 · Owns: `screens/session/
CombatTracker.tsx`. Tap-hold HP → sheet with numeric keypad, Damage/Heal/Temp; 5-second undo
  chip; keyboard `d`/`h`. Acceptance: e2e on mobile and desktop.
- **RC-SES-3.3 — Stat-block quick reference from a row.** `M` · P2 · Deps: SYS-2.5 · Owns:
  tracker row action → right panel (desktop) / sheet (phone) rendering DS `StatBlock` from the
  bound character; collapsible actions. Acceptance: e2e.
- **RC-SES-3.4 — Tracker keyboard model.** `S` · P2 · Owns: tracker. `n` next, `p` previous, arrow
  rows, `Enter` opens quick-ref, Move up/down for reordering with announcements. Acceptance: e2e.
- **RC-SES-3.5 — Encounter builder v2.** `M` · P2 · Deps: SYS-2.5, MAP-1.1 · Owns:
  `app/EncounterBuilder.tsx`. Count steppers per creature, difficulty meter from the package, save
  encounters as `encounter` objects for reuse, "Place on map" toggle, ambush/surprise from marching
  order. Acceptance: e2e saves and reloads an encounter.

### Epic SES-4 — Prep and recap workflow (P2)

- **RC-SES-4.1 — End-of-session capture → session log note.** `M` · P2 · Deps: 1.3 · Owns:
  `screens/session/Capture.tsx` (new), core `session.author-recap` extended with structured fields
  (what happened, what changed as entity chips, follow-ups) and a `content.create-item` of subtype
  `session-log`. Acceptance: e2e; the note appears in Knowledge and the Campaign timeline.
- **RC-SES-4.2 — Continuity check after capture.** `S` · P2 · Deps: 4.1, AI-1.3 · Owns: same.
  Present the deterministic continuity bundle ("3 NPCs named without notes — create?") with
  quick-create buttons. Acceptance: e2e.
- **RC-SES-4.3 — Pre-session prep view v2.** `S` · P2 · Owns: `screens/session/PrepRecap.tsx`.
  Open threads cards, notes to review, last recap, handouts to deliver, suggested scene package,
  "Schedule next session" kept. Acceptance: e2e.
- **RC-SES-4.4 — Timer and clocks.** `S` · P2 · Owns: `SessionTimer` UI in the quick panel:
  session elapsed, countdowns, lap marks, break timer with a projected "Back in 10:00" card to
  players. Acceptance: e2e.

---

## 10. Workstream CHR — Characters and the player suite

**Outcome.** Every mechanical element of a character in the active system is tracked with one-tap
spend and automatic recovery; level-up, rests, downtime, and history are guided flows; the party
shares a live overview; players have a private, DM-invisible journal space; and the sheet is
beautiful enough that players prefer it to paper, on any device, printable.

**Current state (G10).** Builder, sheet, proficiencies, attacks, sharing, PC switcher, import,
inventory/currency/encumbrance, staged level-up, journal kinds, marching order, party stash, co-DM
tier — all real. Missing: package-driven class resources (needs SYS-2.2), rest with hit dice,
concentration/death saves, downtime, history timeline, XP vs milestone mode, print, live party
panel over P2P, private vault, impressions, highlight compilation, preview edges (DEBT-2026-005).

### Epic CHR-1 — Resources, rests, and states (P2, on the critical path via SYS-2.2)

- **RC-CHR-1.1 — Class resources UI from the package.** `M` · P2 · Deps: SYS-2.2 · Owns:
  `app/character/Resources.tsx` (shared by Player and PlayerView). Current/max pips or counters per
  resource kind, spend/recover, max auto-updates on level-up, custom homebrew resource add.
  Acceptance: e2e for a Monk (ki) and a Generic (stress clock).
- **RC-CHR-1.2 — Rest workflow.** `M` · P2 · Deps: 1.1 · Owns: `screens/session/Lifecycle.tsx`
  (DM "Call a rest"), `app/character/RestDialog.tsx`, core `character.rest` extended for hit dice
  (roll or average, per die), exhaustion −1 on long rest, session timeline entry. Acceptance: tests.
- **RC-CHR-1.3 — Concentration and death saves.** `M` · P2 · Owns: core `character-state.ts`
  (`concentration?: {spellId}`, `deathSaves: {s,f}` additive), commands, `combat.apply-resource`
  prompts a concentration check on damage, tracker/party panel indicators, broadcast to DM.
  Acceptance: tests + e2e.
- **RC-CHR-1.4 — XP and milestone advancement modes.** `S` · P2 · Deps: SYS-1.1 · Owns:
  `character-advancement.ts` (mode from the package with DM override), Session "Award XP" from the
  encounter log, "Level up available" badge, milestone "Level the party". Acceptance: tests.

### Epic CHR-2 — Advancement, downtime, history (P2)

- **RC-CHR-2.1 — Guided level-up wizard v2.** `M` · P2 · Deps: 1.1 · Owns:
  `app/character/LevelUp.tsx`. Steps: HP (roll/average shown), features unlocked (from the package
  or compendium), ASI/feat, new slots/resources, review; exit/resume via the existing staged
  advancement. Acceptance: e2e levels a PC 1→2.
- **RC-CHR-2.2 — Downtime tracker.** `S` · P2 · Owns: core `character-journal.ts` (entry kind
  `downtime` with type/days/cost/outcome/linked note), UI panel, DM "Award downtime days".
  Acceptance: tests + e2e.
- **RC-CHR-2.3 — Character history timeline.** `S` · P2 · Owns: `app/character/History.tsx`.
  Chronological feed of level-ups, rests, combats, downtime, with in-world dates when the calendar
  exists; export as markdown journal. Acceptance: e2e.
- **RC-CHR-2.4 — Printable sheet.** `S` · P3 · Owns: `styles/print.css` (new), `Player.tsx`.
  Single-page print layout via `@media print`; "Print / Save PDF" through the platform export
  contract on Android. Acceptance: Playwright PDF snapshot.

### Epic CHR-3 — Party coordination (P2)

- **RC-CHR-3.1 — Live party panel over remote play.** `M` · P2 · Deps: SES-1.2 · Owns:
  `net/viewModels.ts` (party vitals in the player view-model), `app/character/PartyPanel.tsx`
  (board tile + quick panel + sheet). HP gradient bars, conditions, concentration, spellcaster slot
  summary collapsed. Acceptance: `collab.spec.ts` HP change propagates within the
  `live-session-delivery` budget.
- **RC-CHR-3.2 — Party stash v2.** `S` · P2 · Owns: `app/character/PartyStash.tsx`. Move items
  between stash and PCs, loot log from encounters, encumbrance baseline. Acceptance: e2e.

### Epic CHR-4 — Player privacy and journal (P2)

- **RC-CHR-4.1 — Player-private notes (DM-invisible).** `L` · P2 · Deps: STB-4 (needs an ADR
  amendment to ADR-004/019: a second Dexie database `dndtools-private-<characterId>` never replicated,
  never in MCP reads) · Owns: `platform/storage/privateStore.ts` (new), `screens/play/Journal.tsx`.
  Private notes, bookmarks with annotations, NPC impressions linked to shared NPC notes, share-one-
  impression-with-DM as a command request. Acceptance: leak test (host never receives private
  content); e2e.
- **RC-CHR-4.2 — Highlight compilation.** `S` · P2 · Deps: SES-4.1 · Owns: core
  `session.compile-highlights` (session-highlight journal entries → shared "Session highlights"
  note), DM pin-to-timeline. Acceptance: tests + e2e.
- **RC-CHR-4.3 — Preview-mode edges (DEBT-2026-005).** `S` · P2 · Owns: `Player.tsx`,
  `PlayerView.tsx`, `SceneRuntime.ts`. Hide manage controls in read-only preview; `/play` honors a
  co-DM preview actor via `ViewAsControl`. Acceptance: e2e; DEBT entry resolved.
- **RC-CHR-4.4 — Trusted tier decision.** `S` · P2 · Owns: docs + `PlayerView.tsx`. Either build
  the "trusted player" seat (ADR-022 amendment: a player who may see shared+ content in the
  elevated nav) or remove the aspirational mention. Acceptance: no aspirational copy remains.

### Epic CHR-5 — Builder and sheet polish (P3)

- **RC-CHR-5.1 — Character sheet template fidelity.** `M` · P3 · Deps: DSN-2.1 · Owns:
  `screens/player/*`, `ds/components/creature/*`, `spell/*`. Match `docs/design-package/templates/
character-sheet/`: identity band, ability grid, saves & skills, live combat panel, spellcasting,
  two-column desktop / stacked phone, portrait upload through the asset store. Acceptance: visual
  snapshot vs the template; a11y gate.
- **RC-CHR-5.2 — Builder step polish.** `S` · P3 · Owns: `app/charBuilder/*`. Point-buy/standard
  array/roll modes, class preview cards with the package's features, import review diff, Stepper
  a11y. Acceptance: e2e; `verify:ui` CharBuilder case.
- **RC-CHR-5.3 — Roster library information scent.** `S` · P3 · Owns: `screens/Characters.tsx`.
  Cards with portrait/initials, class·level, HP bar, conditions, owner chip, last-played; filters by
  kind/owner/tag; keyboard grid. Acceptance: e2e; `authoring-layout.spec` at 320.

---

## 11. Workstream KNW — Knowledge, Campaign, Graph

**Outcome.** Notes are a pleasure to write: a real editor with callouts, tables, images, wikilink
autocomplete, templates and snippets, inline rolls; saved searches and filters are first-class;
the campaign lens has quest/faction/NPC cards with a real calendar editor and timeline; the graph
shows clusters and momentum and offers link repair. Every list has information scent.

**Current state (G11).** Notes/handouts/objects CRUD, visibility, import/export, backlinks,
wikilinks, quests/factions objects, calendar timeline, graph visualization + health — real. Editor
is a textarea; no templates/snippets/saved-search/link-repair/calendar-editor UI although core has
the models (`content-templates.ts`, `content-snippets.ts`, `saved-search.ts`, `graph-link-repair.ts`,
`calendar.ts`). Remote branch `epic/SRCH-filters-and-saved-searches` (Svelte-era) is design input.

### Epic KNW-1 — The editor (P2)

- **RC-KNW-1.1 — Shared markdown renderer with callouts, tables, images, wikilinks.** `M` · P2 ·
  Owns: `app/markdown/{render,plugins}.ts` (new; one sanitized pipeline per ADR-005),
  `state/markdown.ts` (core parse), Knowledge/WikiReader/PlayerView/widget note bodies consume it.
  `[!Lore]/[!Warning]/[!Tip]/[!Secret]` callouts (Secret blurs for non-DM and is stripped from
  player projections by the core, not CSS), tables with sticky header, figures with captions, asset-
  store images, external-link vs wikilink styling. Acceptance: renderer tests incl. XSS corpus;
  visual snapshot; a player projection never contains a `[!Secret]` body (core test).
- **RC-KNW-1.2 — Editor v2: split/preview, toolbar, wikilink autocomplete, slash menu.** `L` · P2
  · Deps: 1.1 · Owns: `app/editor/{NoteEditor,Toolbar,Autocomplete,SlashMenu}.tsx` (new),
  `screens/Knowledge.tsx`. Plain `<textarea>`-based (no heavy editor dependency) with a formatting
  toolbar, `[[` autocomplete over `quick-switcher-query`, `/` menu (template, snippet, roll, table,
  callout, date), live preview pane (desktop) / tab (phone), autosave with visible status and
  conflict-safe `baseRevision`. Acceptance: `knowledge.spec.ts` extended; keyboard-only authoring.
- **RC-KNW-1.3 — Templates and snippets UI.** `M` · P2 · Deps: 1.2 · Owns: `screens/knowledge/
Templates.tsx`, core `content-templates.ts`/`content-snippets.ts` commands surfaced. New note
  from template (Location/NPC/Faction/Session log/Quest with stubs), manage user templates, insert
  snippet. Acceptance: e2e.
- **RC-KNW-1.4 — Reading width and typography preference.** `S` · P3 · Owns: Settings ›
  Appearance, `styles`. Comfortable/Wide/Full for prose only. Acceptance: e2e.

### Epic KNW-2 — Search, saved searches, discovery (P2)

- **RC-KNW-2.1 — Filters and saved searches UI.** `M` · P2 · Owns: `screens/knowledge/
Filters.tsx`, `screens/Graph.tsx` search, core `saved-search.ts` commands. Facets: type, tag,
  visibility, date, linked-to, on-map; save/pin/rename; palette `>search saved`. Acceptance: e2e.
- **RC-KNW-2.2 — Note list information scent.** `S` · P3 · Owns: `screens/Knowledge.tsx`. Type
  icon, title, breadcrumb/folder-tags, 2 tags, relative modified, 2-line excerpt, visibility chip.
  Acceptance: `authoring-layout.spec` at 320.
- **RC-KNW-2.3 — Command palette v2.** `M` · P2 · Owns: `app/CommandPalette.tsx`,
  `queries/quick-switcher-query.ts`. Recent on empty, grouped results (sections/notes/objects/
  maps/POIs/rolls/actions), contextual actions (CAN-4.3), `>` action prefix, shortcut hints.
  Acceptance: `command-palette.spec.ts`.

### Epic KNW-3 — Campaign lens (P2)

- **RC-KNW-3.1 — Calendar editor.** `M` · P2 · Owns: `screens/campaign/Calendar.tsx` (new), core
  `content.define-calendar` surfaced (months, days, moons, eras, holidays), current date on Session.
  Acceptance: e2e defines a calendar and dates a note.
- **RC-KNW-3.2 — Quest/faction/NPC cards to DS spec.** `M` · P3 · Deps: DSN-2.1 · Owns:
  `screens/Campaign.tsx`, `ds/components/campaign/*`. `QuestCard` status/objectives, `NpcCard`
  quick-reference, `SessionTimeline` arc strip. Acceptance: visual snapshot.
- **RC-KNW-3.3 — Relationship editor (faction↔NPC, NPC↔location).** `S` · P2 · Owns:
  `screens/campaign/*`, core `note-relationships.ts` typed edges. Acceptance: graph shows typed edges.

### Epic KNW-4 — Graph intelligence (P2)

- **RC-KNW-4.1 — Clusters and momentum.** `M` · P2 · Owns: core `graph-quality.ts` (label
  propagation communities, momentum = recent mutations / cluster size; pure, tested), `Graph.tsx`
  cluster hulls and a "Dormant arcs" list. Acceptance: tests on the demo vault; e2e.
- **RC-KNW-4.2 — Link repair UI.** `S` · P2 · Owns: `screens/graph/Repair.tsx` over
  `graph-link-repair.ts`: broken wikilinks with suggested targets, one-click fix via
  `content.update-item`. Acceptance: e2e.
- **RC-KNW-4.3 — Graph performance and interaction.** `S` · P3 · Owns: `Graph.tsx`. Level-of-detail
  labels, focus mode, keyboard node walk, `graph-indexing` budget measured. Acceptance: perf sample.

---

## 12. Workstream AUD — Audio and atmosphere

**Outcome.** A real ambient engine (Web Audio: layered loops, crossfades, per-layer gain, SFX
channel), a bundled CC starter pack, scene packages that bundle card + audio + lighting hint and
auto-activate from POIs, automation on combat/scene/POI events, and assistant tools that suggest
atmosphere in prep.

**Current state (G12).** `<audio>`-element driver with ambience layers, presets, automation rules,
output routing, scene cards + display + second window. No Web Audio graph, SFX, combat trigger,
web sources, waveform metadata, starter pack, `.dndscene` export, MCP tools.

### Epic AUD-1 — Engine (P2)

- **RC-AUD-1.1 — Web Audio engine.** `L` · P2 · Owns: `runtime/audio-engine.ts` (new; replaces the
  element driver behind the same authoritative-state reconciliation), `runtime/audio-playback.ts`.
  Up to 6 layers, gain nodes, seamless loop points, crossfade (default 3 s, configurable), master,
  SFX channel, `setSinkId` retained, graceful fallback to elements when `AudioContext` is denied
  (honest "silent mode"). Acceptance: unit tests with a mocked context; e2e `audio-presets.spec`.
- **RC-AUD-1.2 — Asset metadata: duration, waveform thumbnail, tags.** `S` · P2 · Owns:
  `runtime/audio-import.ts`, asset descriptor (additive), Audio library rows. Acceptance: import
  test; the library shows duration.
- **RC-AUD-1.3 — Starter pack.** `M` · P2 · Owns: `apps/gm-react/public/audio/starter/*` (CC0/CC-BY
  with attribution manifest), `NOTICE.md`, install-on-demand into the asset store. Desktop bundles
  it; web fetches from the hosted origin. Acceptance: license manifest test; e2e installs a track.

### Epic AUD-2 — Scenes and packages (P2)

- **RC-AUD-2.1 — Scene packages.** `M` · P2 · Owns: core `scene-card.ts` (package = card + preset
  - lighting hint), commands, `screens/SceneCardsPanel.tsx`. One click plays, shows, pushes.
    Acceptance: tests + e2e.
- **RC-AUD-2.2 — POI-linked scene packages.** `S` · P2 · Deps: 2.1, MAP-2.5 · Owns: map POI
  inspector, `audio-automation.ts` (`map.poi.party-enter` trigger). Acceptance: e2e.
- **RC-AUD-2.3 — `.dndscene` export/import.** `S` · P2 · Deps: 2.1 · Owns: `platform/backup.ts`
  helpers, Community export. JSON + bundled bytes; web-only packages as small JSON. Acceptance:
  round-trip test.
- **RC-AUD-2.4 — Second-screen display v2.** `S` · P3 · Owns: `screens/SceneDisplay.tsx`,
  `electron/main.cjs` (dedicated `BrowserWindow` on a chosen display, kiosk), Ken Burns on hero
  image (reduced-motion static), mood color wash. Acceptance: desktop smoke.

### Epic AUD-3 — Automation and SFX (P2)

- **RC-AUD-3.1 — Combat music automation.** `S` · P2 · Deps: 1.1 · Owns: `audio-automation.ts`
  (`combat.start`/`combat.end` triggers), Audio › Automation. Acceptance: tests + e2e.
- **RC-AUD-3.2 — SFX events.** `M` · P2 · Deps: 1.1 · Owns: `audio-automation.ts` (nat 20/1,
  death save, reveal, handout), SFX library in the starter pack, Settings toggles per event.
  Acceptance: e2e (roll → SFX fired event).
- **RC-AUD-3.3 — Web sources (opt-in).** `S` · P2 · Owns: Audio add-source (YouTube/SoundCloud
  embed with network indicator; never cached; fails over to local layers). Acceptance: e2e with a
  stubbed embed.
- **RC-AUD-3.4 — Assistant atmosphere tools.** `S` · P2 · Deps: AI-1.2 · Owns: MCP tools
  `scene.activate-package` (staged) and `scene.list-packages` (read); prep digest suggests a
  package. Acceptance: core tests.

---

## 13. Workstream AI — Assistant and creative partnership

**Outcome.** The assistant is a trustworthy creative partner: it can do more (widgets, encounters,
quests, factions, POIs, leveling), the DM sees exactly what it proposes as a semantic diff, conflicts
are resolved three-way, the audit trail is exportable, local models are first-class with a status
panel and offline embeddings for semantic search, and the managed Copilot is ready to switch on the
day Cloud-Enhanced phase 2 clears.

**Current state (G13).** ADR-021/025 shipped; smoke harness against Ollama; three write tools.

### Epic AI-1 — Tool surface (P1→P2)

- **RC-AI-1.1 — Transport abort + streaming polish.** `S` · P1 · Owns: `ai/transport.ts`,
  `ai/mcpBridge.ts`. Thread `AbortSignal` into fetch; token streaming into the phase line.
  Acceptance: tests.
- **RC-AI-1.2 — Write tools: `encounter.create`, `quest.create`, `faction.create`, `map.poi.create`,
  `scene.card.update`, `note.append`.** `M` · P1 · Owns: `mcp/tool-registry.ts`, `agent-dispatch.ts`
  (`writeCommandPayload` per tool), tests, smoke cases. Each fail-closed to `dm-only`. Acceptance:
  core tests; smoke.
- **RC-AI-1.3 — Read tools: continuity bundle, coverage gaps, stale notes, cluster momentum.** `S`
  · P1 · Owns: `mcp/semantic-bundles.ts`, registry. Acceptance: tests.
- **RC-AI-1.4 — Agentic PC leveling.** `M` · P2 · Deps: CHR-2.1 · Owns: registry
  (`character.level-up` proposal carrying the full staged choice set; approval runs
  open→set-choices→commit atomically). Acceptance: tests + smoke.

### Epic AI-2 — Oversight (P2)

- **RC-AI-2.1 — Semantic diff preview for proposals.** `M` · P2 · Owns: `screens/settings/
AiAssistant.tsx`, core `mcp/response-contract.ts` (proposal preview computed at staging:
  structural summary, line delta, affected backlinks). Acceptance: tests + e2e.
- **RC-AI-2.2 — Three-way conflict UI.** `M` · P2 · Deps: 2.1 · Owns: same + core conflict record
  (base/AI/current). Keep AI / keep mine / merge / reject. Acceptance: e2e.
- **RC-AI-2.3 — Audit browser + export.** `S` · P2 · Owns: settings AI; JSON export via
  `exportFile`. Acceptance: e2e.
- **RC-AI-2.4 — Batch review with grouping and filters.** `S` · P2 · Owns: settings AI. Acceptance: e2e.

### Epic AI-3 — Local and offline intelligence (P2)

- **RC-AI-3.1 — Model router and status panel.** `M` · P2 · Owns: `ai/providerConfig.ts`
  (capabilities: generation/embeddings/context), Settings › AI status card, per-tool backend choice.
  Acceptance: tests.
- **RC-AI-3.2 — Local embeddings for semantic search.** `L` · P2 · Deps: 3.1 · Owns:
  `ai/embeddings.ts` (Ollama `/api/embeddings`), an `embeddings` asset in the asset store (float32,
  content-addressed per note revision), `queries/search-query.ts` hybrid ranking (TF-IDF + cosine)
  — pure core scoring, app-side vectors. Acceptance: hit@3 on the demo vault ≥ the RAG de-risk
  figure; offline.
- **RC-AI-3.3 — Ollama model management.** `S` · P2 · Owns: Settings › AI › Local models (list,
  pull, delete, disk estimate; desktop only). Acceptance: e2e with a stubbed daemon.

### Epic AI-4 — Managed Copilot readiness (P2, gated)

- **RC-AI-4.1 — Copilot client + indexer contract (behind the phase-2 gate).** `M` · P2 · Deps:
  CLD-2.2 · Owns: `cloud/copilot.ts`, `packages/cloud-fns/src/copilot/*`, `infra/app-api` (scale-
  to-zero). Builds against `docs/development/COPILOT_RAG_DERISK.md`; remains fail-closed until the
  Cloud-Enhanced record is `approved`. Acceptance: contract tests; the UI shows the gated state.

---

## 14. Workstream CLD — Cloud, collaboration, community

**Outcome.** The paid tiers are worth paying for and the free tier is complete: production is
promoted on the dedicated account, public registration works, billing is real on the web, push
reaches players, TURN is production-grade, cross-device sync merges rather than restores, the
community marketplace discovers and curates, and the wiki is a product.

**Current state (G14).** See `docs/development/CLOUD_TIER_ROADMAP.md`; dev stage live on
`dev.lamplight.click`; prod account bootstrapped; SES sandbox case open; ADR-027 Proposed.

### Epic CLD-1 — Production launch (P2→P4; mostly operator actions)

- **RC-CLD-1.1 — SES production access + verified invite sender.** `S` · P2 · Owner: operator.
  Reply to case `178562576600649` with the monitoring evidence, apply foundation + identity in prod.
  Acceptance: a public user completes registration on `lamplight.click`.
- **RC-CLD-1.2 — Prod promotion run.** `S` · P4 · Deps: 1.1, ENG-7 · Owner: operator + CI. Run
  `promote-production.yml` from the RC tag; probes green; `cloud-drift` green in both accounts.
- **RC-CLD-1.3 — TURN production hardening.** `M` · P2 · Owns: `infra/turn/*`. `turns:` with ACM/
  Let's Encrypt on a DNS name, secret rotation runbook + test, second host or documented failover.
  Acceptance: `validate:live` TURN check over TLS.
- **RC-CLD-1.4 — Privacy-respecting product analytics (opt-in).** `M` · P2 · Owns: core
  `diagnostics/*` (event taxonomy, no content), `cloud/telemetry.ts`, Settings consent, infra
  ingestion (scale-to-zero). Acceptance: zero events without consent (test); dashboard in the stage
  overview.

### Epic CLD-2 — Paid capabilities (P2, external-gated)

- **RC-CLD-2.1 — Stripe billing (ADR-027 → Accepted).** `L` · P2 · External: Stripe account.
  Owns: `infra/app-api` webhook Lambda, `packages/cloud-fns/src/billing/*`, `screens/Upgrade.tsx`
  (Checkout redirect + portal), `cloud/entitlements.ts` (`simulated: false`). Acceptance: contract
  tests with Stripe fixtures; e2e with a stub.
- **RC-CLD-2.2 — Cloud-Enhanced phase 2 security review.** `M` · P2 · Owns:
  `docs/security/vault-privacy-modes-threat-model.md` checklist items, KMS key per stage, plaintext
  path gated by server-side mode registration. Acceptance: checklist signed; record flips to
  `approved: true` only in that PR.
- **RC-CLD-2.3 — FCM push.** `M` · P2 · External: Firebase project. Owns: Android plugin, `cloud/
push.ts`, session-scheduling reminders. Acceptance: device receives a scheduled reminder.
- **RC-CLD-2.4 — Cross-device merge sync.** `L` · P2 · Deps: none (ADR-010 exists) · Owns:
  `cloud/syncEngine.ts`, core `sync/conflict-lifecycle.ts`, Settings › Sync. Ciphertext op-log
  push/pull with the existing three-way conflict UI; explicit "Sync now" + background on launch.
  Acceptance: `sync.spec.ts` two-device merge; SYNC-017 stays open.
- **RC-CLD-2.5 — Keyless browser access (Cloud-Enhanced).** `M` · P2 · Deps: 2.2. Acceptance: gated e2e.

### Epic CLD-3 — Remote play UX (P2)

- **RC-CLD-3.1 — Host/join flow polish.** `M` · P2 · Owns: `net/SessionPanel.tsx`, `screens/
Join.tsx`. One panel: LAN discovery list, code, QR, cloud room, PIN, connection quality, reconnect
  status, per-player presence. Acceptance: `join.spec.ts`, `collab.spec.ts`.
- **RC-CLD-3.2 — Player companion parity.** `M` · P2 · Deps: CHR-3.1, CAN-6.2 · Owns:
  `screens/play/*`. Scene projection, map with fog, handouts, party panel, dice, journal, presence,
  chat-free "raise hand" — all matching the DM's projection choices. Acceptance: e2e.
- **RC-CLD-3.3 — Async play: between-session inbox.** `S` · P2 · Owns: `screens/play/Inbox.tsx`,
  wiki recap feed. Acceptance: e2e.

### Epic CLD-4 — Community and wiki (P2→P3)

- **RC-CLD-4.1 — Marketplace listing kinds and module format.** `M` · P2 · Owns: `infra/app-api`
  listings schema (kind: widget-package | system-package | scene-package | content-module),
  `.dndmodule` bundle = manifest + content export + assets (extends `content.export`), install
  runs the review flow. Acceptance: contract tests; e2e publish/install of a content module.
- **RC-CLD-4.2 — Discovery: search, filters, featured, ratings.** `M` · P2 · External: curation
  policy. Owns: app-api (`GET /listings?q&kind&system&license`, ratings table), `screens/community/
Discover.tsx`. Reviews require install; moderation queue endpoint (maintainer-only). Acceptance:
  e2e; the Extensions "Community marketplace — Unavailable" panel is removed.
- **RC-CLD-4.3 — Creator tooling.** `S` · P2 · Owns: Community › Publish: validation checklist
  (broken links, missing assets, license), semver + changelog, yank. Acceptance: e2e.
- **RC-CLD-4.4 — Wiki v2.** `M` · P3 · Owns: `screens/WikiReader.tsx`, app-api wiki. Theme choice,
  sidebar from folders, search, recap journal entries, RSS, sitemap/meta, custom domain (Beacon).
  Acceptance: e2e; Lighthouse SEO on the reader ≥ 90.

---

## 15. Workstream DSN — Design system, visual language, brand

**Outcome.** The candle-lit Lamplight design is realized completely and enforced mechanically:
typed, documented DS components; a token map with no gaps; five themes; illustrations for every
empty state; dice drama; a golden-route visual regression suite; brand assets across every touch
point (app icon, splash, installers, favicon, share cards, wiki, README, Play/Store listings); and
the design package re-synced so source A, prototype B, and repo R agree.

**Current state (G15).** Tokens 1:1 with the package; 14 DS groups in `.jsx` behind a loose
`index.d.ts`; three themes (tavern/parchment/high-contrast); `Brand.jsx` mark; DEBT-2026-004
open; no visual regression; no component docs; `docs/design-package/readme.md` claims five themes.

**Contracts.** `DESIGN_TOKENS.md`, `DESIGN-SOURCES.md` (A → B, A → R; never invert), `ICON_VOCABULARY`.

### Epic DSN-1 — Token completeness and enforcement (P3-early; consumed by every polish pass)

- **RC-DSN-1.1 — Complete the `T` map and lint raw values.** `M` · P3 · Owns:
  `app/screen-kit.tsx` (`T.space.*`, `T.radius.*`, `T.shadow.*`, `T.z.*`, `T.duration.*`),
  `eslint.config.js` (a rule flagging numeric `padding/margin/gap/borderRadius` literals and raw
  `#hex`/`rgba(` in `src/app`, `src/screens` — allow-list per file until the polish passes clear
  it). Acceptance: lint reports the current count; DEBT-2026-004(a),(d) resolved in `widget-bodies`.
- **RC-DSN-1.2 — Five themes.** `M` · P3 · Owns: `styles/tokens/colors.css`, Settings › Appearance,
  `scripts/token-contrast-lint.ts`, `a11y-nontext-contrast-lint.ts`. Add **Scholar** (light,
  cooler, navy accent, for long writing) and **Dungeon** (dark, near-black, brighter accent for dim
  tables) per I15 S15.4.1, harmonised in OKLCH in the warm family; system light/dark maps to
  parchment/tavern; forced-colors block covers all five. Acceptance: both lints green ×5; visual
  snapshot ×5; the design package readme and `docs/design/README.md` updated in the same PR.
- **RC-DSN-1.3 — Motion vocabulary.** `S` · P3 · Owns: `styles/tokens/spacing.css` (motion
  section), `docs/architecture/DESIGN_TOKENS.md`. Named transitions (fade-in, rise, sheet-slide,
  shimmer, pulse) as reusable keyframes; `--easing-spring` reserved for dice/celebration; all collapse
  under `[data-motion='reduced']`. Acceptance: `prepaint-motion.test.ts` extended.
- **RC-DSN-1.4 — Density audit.** `S` · P3 · Owns: `spacing.css` density sets, `screen-kit`.
  Nav item 48/36/28, cards 16/12, list gaps; touch lock to comfortable verified on Android.
  Acceptance: `responsive.spec` target-size checks.

### Epic DSN-2 — Typed, documented, complete component library (P3-early)

- **RC-DSN-2.1 — Convert `src/ds/components/**`from`.jsx`to typed`.tsx`.** `L`· P3 · Owns:`src/ds/\*\*`, delete `index.d.ts`. One PR per group (14 PRs), props typed from the package
`.d.ts`files, no behavior change, existing DS tests green. Acceptance:`any`count in`src/ds`
  = 0; DEBT-2026-002 shrinks accordingly.
- **RC-DSN-2.2 — Missing primitives.** `M` · P3 · Owns: `src/ds/components/{core,forms,data}`.
  `ListItem`, `TagInput`, `RadioCard`, `Kbd`, `Menu` (role=menu wrapper over Popover),
  `Toolbar`, `Callout`, `Figure`, `Stepper` polish, `HelpTip`, `FeatureSpotlight` — each with a
  `.test.tsx` and an entry in the component docs. Acceptance: used by at least one screen each.
- **RC-DSN-2.3 — Component documentation site (in-repo).** `M` · P3 · Owns: `apps/gm-react/
src/dev/Gallery.tsx` (DEV-only route `#/__ds`, stripped from prod by the `__rt`-style guard),
  `docs/design/COMPONENTS.md` generated from the gallery's registry. Every component with every
  variant/state, theme × density switchers. Acceptance: `check-prod-bundle.mjs` asserts absence.
- **RC-DSN-2.4 — Re-sync design source A.** `S` · P3 · Owns: `docs/design-package/**` via the
  DesignSync flow (use the `ux-ui-reviewer` agent; DesignSync is not inherited by general agents).
  Push Lamplight branding, five themes, the new primitives, tile tokens, and the widget-builder /
  system-picker template updates upstream; re-vendor; note the bundle version in `DESIGN-SOURCES.md`.
  Acceptance: `docs/design-package/readme.md` says Lamplight and lists five themes.

### Epic DSN-3 — Illustration, iconography, and delight (P3)

- **RC-DSN-3.1 — Empty-state illustration set.** `M` · P3 · Owns: `src/ds/illustrations/*.tsx`
  (inline SVG, accent-colored line drawings, ~24 keys: knowledge-empty, map-library, session-board-
  empty, note-tile-empty, graph-empty, characters-empty, audio-empty, community-empty, play-waiting,
  search-none, …), `EmptyState` gains an `illustration` key prop. Style: warm line art, no fills
  beyond the accent wash, 160px. Acceptance: gallery page; each key used once.
- **RC-DSN-3.2 — Icon vocabulary completion.** `S` · P3 · Owns: `ds/components/core/Icon.jsx`
  registry, `docs/reference/ICON_VOCABULARY.md`. Add die faces d4–d100, condition set for Generic
  and PF2e samples, tile types, system-package concepts; verify no two concepts share a glyph.
  Acceptance: `Icon.test.ts` uniqueness assertion.
- **RC-DSN-3.3 — Brand asset kit.** `M` · P3 · Owns: `build-resources/` (icon.icns/.ico/.png sets,
  DMG background, NSIS sidebar), `android/app/src/main/res` (adaptive icon, splash, themed icon),
  `public/` (favicon set, `manifest.webmanifest` icons, OG share image), `electron-builder.yml`,
  `index.html` meta. Derived from `assets/logo.svg`; never redesign the mark. Acceptance: release
  packages show the icon on all platforms; Android adaptive icon passes the launcher preview.
- **RC-DSN-3.4 — Loading, skeleton, and progress states.** `S` · P3 · Owns: `ds/components/
system/*`, screens. Skeletons for every list/canvas on first load; determinate progress for
  import/backup/sync/generation with ETA copy. Acceptance: `screen-kit-loading-region` tests.

### Epic DSN-4 — Visual regression and design QA (P3-early)

- **RC-DSN-4.1 — Golden-route visual regression suite.** `M` · P3 · Owns: `apps/gm-react/tests/
visual/*.spec.ts` (Playwright `toHaveScreenshot`), `playwright.config.ts` (a `visual` project
  with fixed fonts/animations/time), `.github/workflows/ci.yml` (path-filtered). Routes: the 8
  axe routes + `/board`, `/scene/:id`, `/atlas` editor open, `/play`, `/display`, `/wiki`, the
  DS gallery; × 3 themes (5 after DSN-1.2) × desktop/rail/phone. Baselines committed under LFS or a
  size cap. Acceptance: CI diffs block; a documented update command.
- **RC-DSN-4.2 — Design conformance checklist in the PR template.** `S` · P3 · Owns:
  `.github/pull_request_template.md`, `docs/CONTRIBUTING.md`. The §20.2 list as checkboxes.

---

## 16. Workstream UX — UX quality, accessibility, i18n, learnability

**Outcome.** One clear way to do everything, discoverable without docs; copy in the Lamplight
voice in every locale; WCAG 2.2 AA everywhere including the canvases and the map; phones and
tablets are first-class; help is where you need it; a new DM reaches real utility in 30 minutes.

**Current state (G16, G17).** Strong a11y gates and responsive specs; a MutationObserver i18n
bridge; onboarding overlay; static shortcut list; no HelpTip/spotlight/`?` overlay/What's new;
DEBT-2026-001 platform-preferences layer open.

### Epic UX-1 — Internationalization done properly (P1)

- **RC-UX-1.1 — Message-key catalogs and `t()` API.** `M` · P1 · Deps: STB-4.4 · Owns:
  `src/i18n/{index.tsx,messages/en.ts,messages/es.ts,format.ts}`, `i18n/index.test.ts`. ICU plurals,
  `Intl.NumberFormat/DateTimeFormat/RelativeTimeFormat`, unit formatting (ft/m), locale from
  Settings › Language with system default. Remove the DOM bridge. Acceptance: tests; placeholder-
  consistency test kept.
- **RC-UX-1.2 — Migrate every user-visible string.** `L` · P1 · Deps: 1.1 · Owns: every screen (one
  PR per decomposed screen directory, coordinated with STB-2 owners). Add the ESLint rule
  (`no-literal-jsx-text` scoped to `src/app`, `src/screens`, `src/ds`) with a shrinking allow-list.
  Acceptance: rule at zero; ES catalog ≥ 95%.
- **RC-UX-1.3 — RTL readiness.** `S` · P2 · Owns: `styles/**` (logical properties), `useViewport`
  (dir), one RTL smoke spec. Acceptance: `responsive.spec` RTL case passes on the 8 routes.
- **RC-UX-1.4 — Community translation workflow.** `S` · P2 · Owns: `docs/development/
LOCALIZATION.md`, a Weblate/Crowdin export script, locale status badge in Settings. Acceptance:
  round-trip export/import of the catalog.

### Epic UX-2 — Accessibility completion (P2→P3)

- **RC-UX-2.1 — Extend the axe route list to every durable workspace.** `S` · P2 · Owns:
  `tests/e2e/a11y-axe-gate.spec.ts`: add `/board`, `/scene/:id`, `/graph`, `/audio`, `/extensions`,
  `/community`, `/upgrade`, `/player`, `/play`, `/display`, `/join`, `/wiki`, and the open states of
  the map editor, widget builder, system builder, char builder. Acceptance: register still empty.
- **RC-UX-2.2 — Canvas and map screen-reader contracts.** `M` · P2 · Deps: CAN-3.5, MAP-4.1 · Owns:
  those surfaces. `role="application"` labels with counts, live regions for every operation, list
  views as the full non-visual path. Acceptance: manual SR checklist in `ACCESSIBILITY.md` §4 run
  with NVDA/VoiceOver/TalkBack and recorded.
- **RC-UX-2.3 — Focus and dialog audit.** `S` · P3 · Owns: `ds/components/overlay/*`, screens.
  Every overlay: trap, restore, Escape, Android Back, `aria-labelledby`; every menu: the menu
  pattern; no positive tabindex anywhere (lint). Acceptance: lint + e2e.
- **RC-UX-2.4 — Text scaling and zoom.** `S` · P3 · Owns: styles. 200% zoom and OS large-text on
  all tiers without loss; `responsive.spec` case at 200%. Acceptance: spec.

### Epic UX-3 — Learnability and help (P2)

- **RC-UX-3.1 — HelpTip placements.** `S` · P2 · Deps: DSN-2.2 · Owns: screens. Beside: vault
  privacy mode, projection pill, visibility chips, staged-proposal counter, calendar, custom types,
  system picker, widget trust review, recovery key. Acceptance: e2e opens one; copy in the voice.
- **RC-UX-3.2 — Feature spotlight system.** `M` · P2 · Deps: DSN-2.2 · Owns: `app/help/
Spotlight.tsx`, core `onboarding.ts` (`seenSpotlights` in a device-preferences slice — see UX-4.1).
  Queued to idle moments, once per vault. Acceptance: e2e; never repeats.
- **RC-UX-3.3 — Keyboard shortcut registry and `?` overlay.** `M` · P2 · Owns: `app/shortcuts/
registry.ts` (single source; handlers and the overlay both read it), `app/help/ShortcutsDialog.tsx`,
  map/canvas/editor registrations. Acceptance: Settings' static list is replaced by the registry; e2e.
- **RC-UX-3.4 — Help menu, Getting started, What's new.** `S` · P2 · Owns: `app/shell/Footer.tsx`,
  `app/help/*`, `CHANGELOG.md` parser. Consistent location (WCAG 3.2.6); milestone progress list
  from maturity signals; What's new badge after an update. Acceptance: e2e.
- **RC-UX-3.5 — Maturity-signal disclosure.** `S` · P2 · Owns: core `onboarding.ts` (signals from
  existing state: notes, links, tags, sessions, maps, objects; thresholds as data), nav badges and
  Settings › Features toggles. Acceptance: tests; e2e reveals Graph at 3 links.
- **RC-UX-3.6 — Onboarding v2.** `M` · P3 · Deps: 3.2, DSN-3.1 · Owns: `app/Onboarding.tsx`.
  Keep the forced privacy-mode step; add the starting-point cards (empty / campaign starter /
  worldbuilding starter) with bundled template vaults; first-action prompts ("try `[[`"); a 10-minute
  target measured by an e2e that reaches note+link+search. Acceptance: `onboarding-consent.spec`.

### Epic UX-4 — Platform preferences layer and mobile ergonomics (P2)

- **RC-UX-4.1 — Device-preferences slice and platform layer (DEBT-2026-001).** `M` · P2 · Owns:
  `platform/preferences.ts` (typed, one place for localStorage/matchMedia/navigator reads),
  refactor the allow-listed sites, shrink `platform-access-exceptions.json`. Acceptance: exceptions
  file ≤ 5 entries; DEBT resolved.
- **RC-UX-4.2 — Mobile primary-action audit.** `S` · P3 · Owns: screens. One primary top-bar
  action per compact screen, overflow sheets, keyboard-safe confirmations (UX-002 contract).
  Acceptance: `responsive.spec` extended per screen.
- **RC-UX-4.3 — Tablet (rail) layouts.** `M` · P3 · Owns: screens. Two-pane list/detail on rail for
  Characters, Knowledge, Campaign, Atlas; right detail panel contract. Acceptance: `responsive.spec`
  at 1024×768 and 820×1180.
- **RC-UX-4.4 — Copy pass v2 in the Lamplight voice.** `M` · P3 · Deps: 1.2 · Owns: `messages/en.ts`.
  Re-read every string against the content fundamentals; rejection messages carry the next action;
  no engine jargon; per-package vocabulary placeholders. Use the `natural-writer` agent for long-
  form help text only. Acceptance: reviewer sign-off; ES updated.

---

## 17. Workstream PLT — Platform shells and reach

**Outcome.** Signed, auto-updating desktop builds; a PWA that installs from `lamplight.click`;
Android on Play (internal track) with widgets/share-target; iOS scoped and either built or
explicitly deferred with a recorded decision; every shell honours the same capability contract.

**Current state (G21).** Unsigned desktop alpha; alpha-key Android; no service worker; no
auto-update; Electron menu hidden.

- **RC-PLT-1.1 — Desktop code signing + notarization.** `S` · P4 · External: certificates. Owns:
  `release.yml` production channel, `electron-builder.yml`, `RELEASING.md`. Acceptance: signed
  packages verified in the release job.
- **RC-PLT-1.2 — Auto-update (electron-updater, GitHub Releases provider).** `M` · P2 · Owns:
  `electron/main.cjs`, `preload.cjs` (explicit channel), Settings › About (check/apply, release
  notes), signature verification. Acceptance: desktop smoke with a staged feed.
- **RC-PLT-1.3 — Electron parity audit.** `S` · P3 · Owns: `electron/*`. Application menu with
  standard roles + shortcuts from the registry, window state persistence, second-screen window
  (AUD-2.4), deep-link protocol `lamplight://join/…`, tray/dock badge for live session.
  Acceptance: desktop smoke extended.
- **RC-PLT-2.1 — PWA.** `M` · P2 · Owns: `vite.config.ts` (service worker with a versioned
  precache, offline shell, update toast), `manifest.webmanifest`, `index.html`. Must not break
  `dndtools://app` Electron or Android WebView (feature-detect). Acceptance: Lighthouse PWA pass;
  offline reload e2e.
- **RC-PLT-2.2 — Android: share-target import, home-screen shortcuts, notification channels.** `M`
  · P2 · Owns: `android/`, `platform/capabilities.ts`. Share a JSON/`.dndmodule` into the app;
  shortcuts to Session/Play; live-session notification. Acceptance: emulator acceptance script.
- **RC-PLT-2.3 — Play internal track.** `S` · P4 · External: Play console. Owns: `RELEASING.md`,
  store listing assets (DSN-3.3). Acceptance: AAB uploaded, listing complete.
- **RC-PLT-3.1 — iOS decision and scaffold.** `M` · P2 · Owns: ADR (`Capacitor iOS`), `ios/` scaffold
  if accepted, `capabilities.ts` `RuntimeKind = 'ios'`. Acceptance: ADR Accepted or Rejected with
  reasons; if accepted, a simulator smoke in CI.

---

## 18. Workstream ENG — Engineering quality, performance, security, release

**Outcome.** The I21 audit framework becomes real: measured performance baselines with regression
CI, tiered branch gates, decomposed files, typed seams, dependency hygiene, a signed-off security
review, and a repeatable RC checklist.

- **RC-ENG-1.1 — Perf measurement pipeline.** `M` · P1 · Owns: `scripts/perf/{capture,compare}.ts`
  (Playwright-driven marks for each budget id: startup, vault open, scene first render, widget
  update, map pan/zoom fps, search, graph indexing, sync, live delivery), `packages/core/src/perf/
measurement.ts` grading, `tests/perf/baseline.json`, `.github/workflows/perf.yml` (path-filtered,
  compare vs baseline, budget breach fails). Acceptance: samples for all 11 budgets on CI hardware.
- **RC-ENG-1.2 — Bundle budget enforcement + route-level analysis.** `S` · P1 · Owns:
  `scripts/check-prod-bundle.mjs`, `perf/bundle-budget.ts`. Acceptance: CI fails on regression.
- **RC-ENG-2.1 — Tiered branch model + smoke gate.** `S` · P1 · Owns: `GIT_WORKFLOW.md`, `ci.yml`
  (initiative branches get smoke; `main` gets full), `test:smoke` expanded to the critical unit
  subset under 60 s. Acceptance: two green runs each tier.
- **RC-ENG-2.2 — Test suite performance.** `M` · P2 · Owns: vitest configs (sharding, isolate
  strategy), Playwright shards (already 3?), fixture reuse. Target: core suite < 90 s, e2e < 12 min
  per profile. Acceptance: CI timing table in `TESTING.md`.
- **RC-ENG-3.1 — Promote budgets from provisional to measured.** `S` · P4 · Deps: 1.1 · Owns:
  `budget-registry.ts`. Acceptance: no `provisional` entries; `PERFORMANCE.md` rewritten.
- **RC-ENG-3.2 — Runtime performance recovery.** `M` · P3 · Deps: 1.1 · Owns: hot paths that
  breach (expected: scene first render with many tiles, map with world output, graph with 2k
  notes, search index). Acceptance: all budgets green.
- **RC-ENG-4.1 — `any` elimination in app seams.** `M` · P2 · Owns: `runtime/*`, `net/*`,
  `screens/settings/*`, `Upgrade.tsx`. Acceptance: ≤ 20 warnings (DEBT-2026-002 resolved).
- **RC-ENG-4.2 — Core coverage floors raised for new domains.** `S` · P2 · Owns: `vitest`
  coverage config, `ci.yml`. Systems, widgets runtime, combat tokens at ≥ 90% branch.
- **RC-ENG-4.3 — Dependency hygiene.** `S` · P0 · Owns: dependabot PRs, `DEPENDENCY_AUDIT.md`,
  `supply-chain.yml`. TypeScript 6 / Vite 8 upgrades validated. Acceptance: audit clean.
- **RC-ENG-5.1 — Security review v2 (whole app).** `M` · P4 · Owns: `docs/security/
app-security-review-<date>.md`, fixes. Scope: sandbox host (WID-1.3), host API, package review,
  system packages as data, private player store, PWA cache, auto-update signature, Stripe webhook,
  Cloud-Enhanced path. Run `/security-review` on each of those PRs first. Acceptance: no open
  high; `SECURITY.md` updated.
- **RC-ENG-5.2 — Regression gates for new security invariants.** `S` · P2 · Owns:
  `security/regression-gates.ts`. Add: custom widget cannot reach `window.parent` state; private
  store never in a view-model; system package cannot carry functions; sandbox CSP exact.
- **RC-ENG-6.1 — Observability in the app.** `S` · P2 · Owns: `diagnostics/*`, Settings › About ›
  Diagnostics (perf marks, error taxonomy counts, storage usage, last sync), export bundle with
  privacy redaction. Acceptance: tests for redaction.
- **RC-ENG-7.1 — RC checklist and beta program.** `M` · P4 · Owns: `docs/development/
RC_CHECKLIST.md` (the §2 gates as a runnable list with commands), `release.yml` `rc` channel,
  beta feedback route (GitHub Discussions template + in-app "Send feedback" via the help menu).
  Acceptance: the checklist run once end-to-end on the RC tag with results attached to the release.

---

## 19. Workstream DOC — Documentation realignment

- **RC-DOC-1.1 — Initiative corpus re-pointed to React evidence.** `M` · P4 · Deps: all P2 merged ·
  Owns: `docs/planning/initiatives/*.md`. Each COMPLETED claim carries a React file path and a spec;
  Svelte-era stories moved to a "history" heading. Acceptance: `requirements-auditor` agent pass
  with zero unverifiable claims.
- **RC-DOC-1.2 — Architecture docs for the new subsystems.** `M` · P2 (rolling, per subsystem
  PR) · Owns: `docs/architecture/{SYSTEM_PACKAGES,WIDGET_RUNTIME,SCENE_HISTORY,COMBAT_ON_MAP}.md`,
  `DATA_MODEL.md` (new slices), `WIDGET_FEATURE_BRIEF.md` updated to React paths. Acceptance:
  every behavior claim maps to a file (docs quality rule 1).
- **RC-DOC-1.3 — User-facing docs.** `M` · P3 · Owns: `docs/user/` (new: Getting started, Running
  a session, Maps, Widgets & builders, Systems, Remote play, Privacy modes, Android/desktop
  install), linked from the Help menu. Use the `natural-writer` agent. Acceptance: reviewed.
- **RC-DOC-1.4 — Release notes and marketing surface.** `S` · P4 · Owns: `CHANGELOG.md` RC entry,
  `README.md` (Lamplight, screenshots from the visual suite), `lamplight.click` landing page
  (`infra/web-hosting` static). Acceptance: natural-writer pass; screenshots current.
- **RC-DOC-2.1 — Roadmap upkeep.** `S` · rolling · Owns: this file. Each merged story flips its
  row in §23 to `done` with the PR; a story re-scoped to an external blocker is annotated, never
  deleted.

---

## 20. The second pass — checklists every surface must clear (Phase 3)

Every screen directory gets **one polish PR** after its P2 epics land. The PR description embeds
these lists with each item checked or explicitly waived with a reason. Reviewers reject waivers
that are not reasons.

### 20.1 Surfaces (one PR each)

Command Center · GM Screen (`/board`) · Scene editor · Session (all panels) · Characters ·
Character builder · Player · Player companion (`/play`) · Atlas + map editor · Story/Campaign ·
Notes/Knowledge · Graph & Search · Audio · Extensions (Plugins/Widget builder/Compendium/Types/
System) · Community · Plans & cloud · Settings (per category) · Onboarding · Join · Scene display ·
Wiki reader · Command palette · App shell (sidebar/rail/tabs/top bar).

### 20.2 Design fidelity

- [ ] Composed only from `src/ds` primitives and `screen-kit`; zero raw hex/rgba/px literals (DSN-1.1 lint clean for this directory).
- [ ] Matches the prototype view for this section (`PROTOTYPE.md` §4 mapping) and the design-package template where one exists; deviations listed with rationale.
- [ ] One primary action per region in gold; supporting tiles flat/sunken; the primary panel raised with `--shadow-md`.
- [ ] Type hierarchy uses 3–4 sizes; Cinzel only ≥ 24px; numbers in mono.
- [ ] Every status color paired with a distinct icon shape; DM-only purple stripe where applicable.
- [ ] Renders correctly in all themes and all three tiers; visual snapshots updated and reviewed.
- [ ] Motion uses named tokens; nothing animates under `data-motion='reduced'`.
- [ ] Empty, loading, error, and "unavailable because…" states all present and illustrated where the key exists.

### 20.3 Interaction and UX

- [ ] Every action has feedback within 100 ms (optimistic or skeleton) and a completion toast or inline state.
- [ ] Every destructive action is undoable or confirmed; every confirm names the thing.
- [ ] Save status visible on auto-persisted surfaces; failures say what to do next.
- [ ] One clear route back; browser back works; Android Back follows the documented order.
- [ ] No hover-only or gesture-only discovery; touch targets ≥ 44 px (48 dp Android).
- [ ] The compact tier exposes one primary top-bar action; overflow in a bounded sheet.
- [ ] Copy follows the content fundamentals; strings via `t()`; ES present.
- [ ] Contextual help (HelpTip) beside any non-obvious control; shortcuts in tooltips.

### 20.4 Accessibility

- [ ] axe clean (desktop + mobile) for this route and its open overlays; register unchanged.
- [ ] Keyboard-only walkthrough of the primary task recorded in the PR; focus visible everywhere.
- [ ] Landmarks and headings correct (`<h1>` once, from `SECTION_TITLES`); `nav` labelled.
- [ ] Live regions announce operations; no announcement spam.
- [ ] Screen-reader spot check on one platform noted.
- [ ] 200% zoom / large text: no clipping; reachability spec case added if new scroll regions.

### 20.5 Core discipline and correctness

- [ ] No state mutation outside `runtime.dispatch`; no client-side visibility filtering.
- [ ] Preview-as-player: writes rejected read-only and controls hidden/disabled accordingly.
- [ ] Player projection of this surface verified through an actor read in an e2e.
- [ ] e2e on both profiles covers the primary task and one failure path.
- [ ] Perf: the surface's budget measured before/after (ENG-1.1); no regression.
- [ ] Docs: FEATURE-GAPS inventory row updated; architecture doc updated if a contract moved.

---

## 21. Distribution rules for parallel agents

1. **Claim by story id.** A claim names the story, the branch (`story/<id>-<slug>` off the lane's
   `initiative/<lane>` branch, per RC-ENG-2.1), and the files it will own. Two claims on the same
   `Owns:` set are a conflict; the later one waits.
2. **Never widen scope.** A story that discovers a needed core change files it as a new `S` core
   story (append to §23), lands it first on the lane branch, then rebases.
3. **Append-only shared files.** `dispatch.ts`, `schemas/commands.ts`, `index.ts`, `nav.ts` —
   add a clearly delimited block; never reorder or reformat neighbours.
4. **Gates before handoff.** `pnpm check`, the story's e2e spec on both profiles,
   `pnpm format:fix:changed`, and `pnpm feature-audit`. A gate is void once another file is
   edited (re-run). Attach outputs to the PR.
5. **Docs in the same PR.** Contract changes update the named doc; new subsystems get their
   architecture page (DOC-1.2) in the first PR that ships behaviour.
6. **Evidence over narrative.** PR descriptions cite file:line and test names for each
   acceptance criterion. "Works locally" is not evidence.
7. **Design review.** Any PR touching `src/ds`, tokens, or a §20.1 surface requests the
   `ux-ui-reviewer` agent pass and links the visual snapshots.
8. **Security review.** Any PR touching sandbox, host API, package review, private store, sync,
   billing, or cloud paths runs `/security-review` and links the report.
9. **Infra.** Any PR under `infra/` runs the `infra-ops-reviewer` agent and the deploy-order
   checklist from the `infra-deploy` skill; prod applies are operator-only.
10. **When blocked**, mark the row in §23 `blocked(<reason>)` rather than silently narrowing the
    story; finish every unblocked acceptance criterion first.

---

## 22. Risk register

| Risk                                                                        | Likelihood | Impact | Mitigation                                                                                                                                              |
| --------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SYS-2 re-plumbing changes 5e behaviour subtly                               | Medium     | High   | SYS-1.2 literal-equality tests before any swap; byte-identical hydration; e2e suite on both profiles per story.                                         |
| Schema bumps break cloud-backup restore                                     | Medium     | High   | Prefer additive fields with stable hydrators; when a bump is unavoidable, ship the migration + restore compatibility test and note it in release notes. |
| Sandbox host opens a new attack surface                                     | Medium     | High   | ADR-030 first; opaque origin; exact CSP; regression gates (ENG-5.2); security review before enabling non-starter packages.                              |
| Mega-file decomposition collides with the review loop or in-flight branches | High       | Medium | STB-1.3 pauses the loop; STB-2 lands before any P1 lane starts; salvage branches inspected in STB-1.2.                                                  |
| AI builder produces low-quality or unsafe widgets                           | Medium     | Medium | Proposals always land in the manual builder's Review step; trust review mandatory; provenance badge; smoke corpus.                                      |
| Combat-on-map performance on large maps                                     | Medium     | Medium | Movement BFS bounded to the viewport grid; bake layer (MAP-3.3); perf pipeline (ENG-1.1) measures `map-pan-zoom-*`.                                     |
| External blockers (Stripe, certs, Firebase, curation, phase-2 review) slip  | High       | Medium | Those stories are isolated behind fail-closed gates; RC-1 ships with honest "not in this edition" only for these four.                                  |
| i18n migration churns every screen at once                                  | High       | Medium | UX-1.2 is one PR per decomposed directory, sequenced after that directory's STB-2 split; lint allow-list shrinks per PR.                                |
| Visual regression suite is brittle                                          | Medium     | Low    | Fixed fonts/time/animations; stable golden routes; documented update flow; diffs reviewed, not auto-accepted.                                           |
| Docs drift again after RC                                                   | Medium     | Medium | FEATURE-GAPS becomes an inventory with an audit that asserts in-UI limits; DOC-2.1 upkeep rule.                                                         |

---

## 23. Story index

_243 stories. By size: S=92 · L=20 · M=131. By phase: P0=18 · P1=26 · P2=153 · P3=37 · P4=8 · rolling=1. Status column starts empty; RC-DOC-2.1 keeps it current._

| Id          | Lane        | Story                                                                        | Size | Phase   | Deps                                                                                                                                         | Status                                            |
| ----------- | ----------- | ---------------------------------------------------------------------------- | ---- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| RC-STB-1.1  | Stabilize   | Land the pending infra/ADR-028 change                                        | S    | P0      | none                                                                                                                                         | blocked(operator: commit the pending infra/ADR-0) |
| RC-STB-1.2  | Stabilize   | Prune and record branches                                                    | S    | P0      | 1.1                                                                                                                                          | blocked(operator: prune remote branches by hand)  |
| RC-STB-1.3  | Stabilize   | Pause or re-target the visual-review loop                                    | S    | P0      | none                                                                                                                                         | done                                              |
| RC-STB-2.1  | Stabilize   | Split `Settings.tsx` (4,989 lines) into `screens/settings/`                  | L    | P0      | —                                                                                                                                            | done (74442ff)                                    |
| RC-STB-2.2  | Stabilize   | Split `Player.tsx` (2,677) and `PlayerView.tsx` (2,282)                      | M    | P0      | —                                                                                                                                            | done (16715d2)                                    |
| RC-STB-2.3  | Stabilize   | Split `Extensions.tsx` (2,611)                                               | M    | P0      | —                                                                                                                                            | done (79fba78)                                    |
| RC-STB-2.4  | Stabilize   | Split `CharBuilder.tsx` (2,470)                                              | M    | P0      | —                                                                                                                                            | done (93793b9)                                    |
| RC-STB-2.5  | Stabilize   | Split `Session.tsx` (2,295)                                                  | M    | P0      | —                                                                                                                                            | done (d715b7e)                                    |
| RC-STB-2.7  | Stabilize   | Add the file-size gate                                                       | S    | P0      | 2.1–2.6                                                                                                                                      | done (4b87c24)                                    |
| RC-STB-3.1  | Stabilize   | Re-status the initiative files                                               | M    | P0      | —                                                                                                                                            | done (8298259)                                    |
| RC-STB-3.2  | Stabilize   | Fix the known-wrong reference docs                                           | S    | P0      | —                                                                                                                                            | done (4b87c24)                                    |
| RC-STB-3.3  | Stabilize   | Restructure FEATURE-GAPS.md into an inventory                                | M    | P0      | —                                                                                                                                            | done (8d14b5e)                                    |
| RC-STB-4.1  | Stabilize   | ADR-029 System Packages as the rules contract                                | M    | P0      | none                                                                                                                                         | done (abec9d6)                                    |
| RC-STB-4.2  | Stabilize   | ADR-030 Custom-widget runtime host and authoring model                       | M    | P0      | none                                                                                                                                         | done (9b8df2b)                                    |
| RC-STB-4.3  | Stabilize   | ADR-031 Scene layout history                                                 | M    | P0      | none                                                                                                                                         | done (1dea308)                                    |
| RC-STB-4.4  | Stabilize   | ADR-032 Internationalization architecture                                    | M    | P0      | none                                                                                                                                         | done (1f08c83)                                    |
| RC-STB-4.5  | Stabilize   | ADR-033 Combat on the map                                                    | M    | P0      | none                                                                                                                                         | done (ec237e0)                                    |
| RC-SYS-1.1  | Systems     | `SystemPackage` schema + state slice                                         | L    | P1      | STB-4.1                                                                                                                                      | done (171b915)                                    |
| RC-SYS-1.2  | Systems     | Built-in packages: D&D 5e reference and Generic/narrative                    | M    | P1      | 1.1                                                                                                                                          | done (24de815)                                    |
| RC-SYS-1.4  | Systems     | Actor-scoped read: `getActiveSystemForActor`, `resolveVocabulary`            | S    | P1      | 1.1                                                                                                                                          | done (7858de4)                                    |
| RC-SYS-2.1  | Systems     | Characters read attributes/skills/derived from the package                   | L    | P1      | 1.2, 1.4                                                                                                                                     | done (0a0287c)                                    |
| RC-SYS-2.2  | Systems     | Resources and rest recovery from the package                                 | M    | P1      | 2.1                                                                                                                                          | done (b318d8e)                                    |
| RC-SYS-2.3  | Systems     | Conditions from the package                                                  | M    | P1      | 1.2                                                                                                                                          | done (8fdcab5)                                    |
| RC-SYS-2.4  | Systems     | Dice model and turn model from the package                                   | M    | P2      | 1.2                                                                                                                                          |                                                    done (3d0499a)|
| RC-SYS-2.5  | Systems     | Creature schema, encounter math, compendium mapping from the package         | M    | P2      | 1.2                                                                                                                                          |                                                    done (fdc9471)|
| RC-SYS-2.6  | Systems     | Vocabulary everywhere                                                        | M    | P2      | 1.4, UX-1.2                                                                                                                                  |                                                    done (c78dda1)|
| RC-SYS-2.7  | Systems     | Widget bodies and templates read the package                                 | S    | P2      | WID-1.3                                                                                                                                      |                                                    done (fccfc0e)|
| RC-SYS-3.1  | Systems     | System Package Picker (the front door)                                       | M    | P2      | 1.3, STB-2.3                                                                                                                                 |                                                    done (e3d46de)|
| RC-SYS-3.2  | Systems     | Switch dry-run dialog v2                                                     | S    | P2      | 1.3, 3.1                                                                                                                                     |                                                    done (fccfc0e)|
| RC-SYS-3.3  | Systems     | System builder (fork & edit)                                                 | L    | P2      | 1.3, 3.1                                                                                                                                     |                                                    done (75da220)|
| RC-SYS-3.4  | Systems     | Package export/import and marketplace listing kind                           | M    | P2      | 1.3, CLD-4.1                                                                                                                                 |                                                   |
| RC-SYS-3.5  | Systems     | Pathfinder 2e sample package (data only, community-style)                    | M    | P2      | 1.2                                                                                                                                          |                                                    done (0842bb6)|
| RC-WID-1.1  | Widgets     | Unified widget render resolver                                               | M    | P1      | STB-2.6                                                                                                                                      | done (a4674d2)                                    |
| RC-WID-1.2  | Widgets     | Template renderers for all eight template kinds                              | L    | P1      | 1.1                                                                                                                                          | done (b102fa7)                                    |
| RC-WID-1.3  | Widgets     | Iframe sandbox host for `custom-html-js`                                     | L    | P1      | 1.1, STB-4.2                                                                                                                                 | done (3f43a40)                                    |
| RC-WID-1.4  | Widgets     | Worker sandbox (data-only widgets)                                           | M    | P2      | 1.3                                                                                                                                          |                                                    done (fe9f73b)|
| RC-WID-1.5  | Widgets     | Trust review command + UI                                                    | M    | P1      | STB-4.2                                                                                                                                      | done (c8cc3b2)                                    |
| RC-WID-1.6  | Widgets     | Real starter library                                                         | M    | P2      | 1.2, 1.3, 1.5                                                                                                                                |                                                    done (4feee83)|
| RC-WID-2.1  | Widgets     | Builder shell and definition editor                                          | L    | P1      | 1.2, STB-2.3                                                                                                                                 | done (e7e42c3)                                    |
| RC-WID-2.2  | Widgets     | Data step: bindings, data queries, computed fields                           | M    | P1      | 2.1                                                                                                                                          | done (3330d28)                                    |
| RC-WID-2.3  | Widgets     | Config-fields and commands steps                                             | M    | P2      | 2.1                                                                                                                                          |                                                    done (160c770)|
| RC-WID-2.4  | Widgets     | Style step                                                                   | S    | P2      | 2.1, DSN-1.1                                                                                                                                 |                                                   |
| RC-WID-2.5  | Widgets     | Advanced step: custom HTML/JS                                                | M    | P2      | 1.3, 2.1                                                                                                                                     |                                                    done (d9b146e)|
| RC-WID-2.6  | Widgets     | Edit-in-place from the canvas                                                | S    | P2      | 2.1, CAN-4.2                                                                                                                                 |                                                   |
| RC-WID-2.7  | Widgets     | Export/share and versioning UX                                               | S    | P2      | 2.1                                                                                                                                          |                                                    done (5b09cf3)|
| RC-WID-3.1  | Widgets     | MCP tool `widget.package.propose`                                            | M    | P2      | 1.2, AI-1.2                                                                                                                                  |                                                    done (776cab8)|
| RC-WID-3.2  | Widgets     | "Generate a widget" dialog on the canvas and in the builder                  | M    | P2      | 3.1, 2.1, AI-2.1                                                                                                                             |                                                   |
| RC-WID-3.3  | Widgets     | Iterate on a generated widget                                                | S    | P2      | 3.2                                                                                                                                          |                                                   |
| RC-WID-4.1  | Widgets     | Missing builtin bodies                                                       | M    | P2      | 1.1                                                                                                                                          |                                                    done (81cbfa3)|
| RC-WID-4.2  | Widgets     | Per-widget operate controls on the canvas                                    | M    | P2      | 1.1                                                                                                                                          |                                                    in progress|
| RC-WID-4.3  | Widgets     | Widget bindings inspector                                                    | M    | P2      | CAN-4.1                                                                                                                                      |                                                   |
| RC-CAN-1.1  | Canvas      | Core inverse builders for scene layout ops                                   | M    | P1      | STB-4.3                                                                                                                                      | done (e31254d)                                    |
| RC-CAN-1.2  | Canvas      | `scene.restore-widget` + tombstones                                          | M    | P1      | 1.1                                                                                                                                          | done (e639e58)                                    |
| RC-CAN-1.3  | Canvas      | App-side undo/redo stack for both canvases                                   | M    | P1      | 1.1, 1.2                                                                                                                                     | done (677cab1)                                    |
| RC-CAN-2.1  | Canvas      | Tile-type semantic tokens                                                    | S    | P2      | DSN-1.1                                                                                                                                      |                                                   |
| RC-CAN-2.2  | Canvas      | Tile header identity                                                         | M    | P2      | 2.1, WID-1.1                                                                                                                                 |                                                   |
| RC-CAN-2.3  | Canvas      | Note tile depth levels                                                       | M    | P2      | 2.2, KNW-1.1                                                                                                                                 |                                                   |
| RC-CAN-2.4  | Canvas      | Tile action menu                                                             | M    | P2      | 2.2, CAN-1.3                                                                                                                                 |                                                   |
| RC-CAN-2.5  | Canvas      | Resize presets and keyboard resize                                           | S    | P2      | 2.4                                                                                                                                          |                                                   |
| RC-CAN-3.1  | Canvas      | Fit / Comfortable / Detail zoom presets                                      | M    | P2      | —                                                                                                                                            |                                                    in progress|
| RC-CAN-3.2  | Canvas      | Scroll-natural pan                                                           | S    | P2      | 3.1                                                                                                                                          |                                                   |
| RC-CAN-3.3  | Canvas      | Column-overflow guard and "Fix layout"                                       | S    | P2      | —                                                                                                                                            |                                                   |
| RC-CAN-3.4  | Canvas      | Layout quality indicator                                                     | S    | P2      | 3.3                                                                                                                                          |                                                   |
| RC-CAN-3.5  | Canvas      | Keyboard model completion                                                    | M    | P2      | 1.3, 2.4                                                                                                                                     |                                                   |
| RC-CAN-3.6  | Canvas      | Multi-select, align/distribute, group, z-order                               | L    | P2      | 1.1, 3.5                                                                                                                                     |                                                   |
| RC-CAN-4.1  | Canvas      | Tile gallery sheet with live previews                                        | M    | P2      | 2.2, WID-1.1                                                                                                                                 |                                                   |
| RC-CAN-4.2  | Canvas      | Inspector v2 (noun panel)                                                    | M    | P2      | 2.4, WID-4.3                                                                                                                                 |                                                   |
| RC-CAN-4.3  | Canvas      | `>board` and `>scene` command-palette actions                                | S    | P2      | 4.1                                                                                                                                          |                                                   |
| RC-CAN-4.4  | Canvas      | Scene templates picker with thumbnails                                       | M    | P2      | 4.1                                                                                                                                          |                                                   |
| RC-CAN-4.5  | Canvas      | Map tile                                                                     | L    | P2      | MAP-2.3, WID-1.1                                                                                                                             |                                                   |
| RC-CAN-4.6  | Canvas      | Scene backgrounds, docks, and sections UI                                    | M    | P2      | 4.2                                                                                                                                          |                                                   |
| RC-CAN-5.1  | Canvas      | Compact stacked-panel board                                                  | L    | P2      | 2.2                                                                                                                                          |                                                   |
| RC-CAN-5.2  | Canvas      | Floating session action bar (phone, session live)                            | M    | P2      | 5.1, SES-1.1                                                                                                                                 |                                                   |
| RC-CAN-5.3  | Canvas      | Touch-first combat tile                                                      | M    | P2      | SES-3.2                                                                                                                                      |                                                   |
| RC-CAN-6.1  | Canvas      | Player-view preview overlay on the canvas                                    | M    | P2      | 2.2                                                                                                                                          |                                                   |
| RC-CAN-6.2  | Canvas      | Per-player scene assignments UI                                              | S    | P2      | —                                                                                                                                            |                                                   |
| RC-CAN-6.3  | Canvas      | Board empty states and first-tile onboarding                                 | S    | P3      | DSN-3.1, 4.1                                                                                                                                 |                                                   |
| RC-MAP-1.1  | Maps        | Session combat tokens                                                        | L    | P1      | STB-4.5                                                                                                                                      | done (65f38fa)                                    |
| RC-MAP-1.2  | Maps        | AoE templates and measurement as ephemeral session state                     | M    | P1      | 1.1                                                                                                                                          | done (312f4ac)                                    |
| RC-MAP-1.3  | Maps        | Movement range and path                                                      | M    | P1      | 1.1, SYS-1.1                                                                                                                                 | done (934eee0)                                    |
| RC-MAP-1.4  | Maps        | Party location and atlas breadcrumb reads                                    | S    | P1      | —                                                                                                                                            | done (7728fa9)                                    |
| RC-MAP-2.1  | Maps        | Token layer UI                                                               | L    | P2      | 1.1                                                                                                                                          |                                                    in progress|
| RC-MAP-2.2  | Maps        | Range/path overlay and AoE tool                                              | M    | P2      | 1.2, 1.3, 2.1                                                                                                                                |                                                   |
| RC-MAP-2.3  | Maps        | Shared `MapCanvas` combat overlay for Atlas, Session stage, and the map tile | M    | P2      | 2.1                                                                                                                                          |                                                   |
| RC-MAP-2.4  | Maps        | Live fog reveal to players with animation and sound cue                      | M    | P2      | 2.3, AUD-3.2                                                                                                                                 |                                                   |
| RC-MAP-2.5  | Maps        | Party marker and "Mark party here"                                           | S    | P2      | 1.4                                                                                                                                          |                                                   |
| RC-MAP-2.6  | Maps        | Combat map persistence and archive                                           | S    | P2      | 1.1                                                                                                                                          |                                                   |
| RC-MAP-3.1  | Maps        | Assets panel becomes a real stamp/prop library                               | M    | P2      | none                                                                                                                                         |                                                   |
| RC-MAP-3.2  | Maps        | Raster import wizard v2                                                      | M    | P2      | —                                                                                                                                            |                                                   |
| RC-MAP-3.3  | Maps        | Canvas-2d bake layer for dense static fills                                  | M    | P2      | —                                                                                                                                            |                                                   |
| RC-MAP-3.4  | Maps        | Room-graph view and stocking editor                                          | M    | P2      | —                                                                                                                                            |                                                   |
| RC-MAP-3.5  | Maps        | Live "immediate" generation knobs                                            | S    | P2      | —                                                                                                                                            |                                                   |
| RC-MAP-3.6  | Maps        | Lighting and line-of-sight visualization                                     | M    | P2      | —                                                                                                                                            |                                                   |
| RC-MAP-3.7  | Maps        | Travel routes and travel time                                                | M    | P2      | 1.4, SYS-1.1                                                                                                                                 |                                                   |
| RC-MAP-3.8  | Maps        | Map hierarchy breadcrumb and drill-down                                      | S    | P2      | 1.4                                                                                                                                          |                                                   |
| RC-MAP-3.9  | Maps        | Fog brush ergonomics and polygon lasso polish                                | S    | P2      | —                                                                                                                                            |                                                   |
| RC-MAP-3.10 | Maps        | POI note-creation flow and popover                                           | M    | P2      | KNW-1.3                                                                                                                                      |                                                   |
| RC-MAP-4.1  | Maps        | List view and screen-reader inventory                                        | M    | P2      | —                                                                                                                                            |                                                   |
| RC-MAP-4.2  | Maps        | POI keyboard navigation (nearest in cardinal direction)                      | S    | P2      | —                                                                                                                                            |                                                   |
| RC-MAP-4.3  | Maps        | Touch gesture model on the editor                                            | M    | P2      | —                                                                                                                                            |                                                   |
| RC-MAP-4.4  | Maps        | Map library gallery                                                          | M    | P3      | DSN-3.1                                                                                                                                      |                                                   |
| RC-MAP-4.5  | Maps        | Editor onboarding and shortcut discovery                                     | S    | P3      | UX-3.3                                                                                                                                       |                                                   |
| RC-SES-1.1  | Session     | Session-live shell posture                                                   | M    | P2      | STB-2.6 (AppShell split)                                                                                                                     |                                                   |
| RC-SES-1.2  | Session     | Session quick panel (right rail / sheet)                                     | M    | P2      | 1.1                                                                                                                                          |                                                   |
| RC-SES-1.3  | Session     | Start/End session flows                                                      | M    | P2      | 1.1                                                                                                                                          |                                                   |
| RC-SES-2.1  | Session     | Roll labels, expansion, and export                                           | S    | P2      | —                                                                                                                                            |                                                   |
| RC-SES-2.2  | Session     | Inline `[[roll:1d20+5]]` in notes and handouts                               | M    | P2      | KNW-1.1                                                                                                                                      |                                                   |
| RC-SES-2.3  | Session     | Rollable tables tab                                                          | M    | P2      | —                                                                                                                                            |                                                   |
| RC-SES-2.4  | Session     | Dice drama                                                                   | S    | P3      | DSN-1.3                                                                                                                                      |                                                   |
| RC-SES-3.1  | Session     | Condition durations and round ticks                                          | M    | P2      | SYS-2.3                                                                                                                                      |                                                   |
| RC-SES-3.2  | Session     | One-handed HP sheet and undo                                                 | M    | P2      | —                                                                                                                                            |                                                   |
| RC-SES-3.3  | Session     | Stat-block quick reference from a row                                        | M    | P2      | SYS-2.5                                                                                                                                      |                                                   |
| RC-SES-3.4  | Session     | Tracker keyboard model                                                       | S    | P2      | —                                                                                                                                            |                                                   |
| RC-SES-3.5  | Session     | Encounter builder v2                                                         | M    | P2      | SYS-2.5, MAP-1.1                                                                                                                             |                                                   |
| RC-SES-4.1  | Session     | End-of-session capture → session log note                                    | M    | P2      | 1.3                                                                                                                                          |                                                   |
| RC-SES-4.2  | Session     | Continuity check after capture                                               | S    | P2      | 4.1, AI-1.3                                                                                                                                  |                                                   |
| RC-SES-4.3  | Session     | Pre-session prep view v2                                                     | S    | P2      | —                                                                                                                                            |                                                   |
| RC-SES-4.4  | Session     | Timer and clocks                                                             | S    | P2      | —                                                                                                                                            |                                                   |
| RC-CHR-1.1  | Characters  | Class resources UI from the package                                          | M    | P2      | SYS-2.2                                                                                                                                      |                                                   |
| RC-CHR-1.2  | Characters  | Rest workflow                                                                | M    | P2      | 1.1                                                                                                                                          |                                                   |
| RC-CHR-1.3  | Characters  | Concentration and death saves                                                | M    | P2      | —                                                                                                                                            |                                                   |
| RC-CHR-1.4  | Characters  | XP and milestone advancement modes                                           | S    | P2      | SYS-1.1                                                                                                                                      |                                                   |
| RC-CHR-2.1  | Characters  | Guided level-up wizard v2                                                    | M    | P2      | 1.1                                                                                                                                          |                                                   |
| RC-CHR-2.2  | Characters  | Downtime tracker                                                             | S    | P2      | —                                                                                                                                            |                                                   |
| RC-CHR-2.3  | Characters  | Character history timeline                                                   | S    | P2      | —                                                                                                                                            |                                                   |
| RC-CHR-2.4  | Characters  | Printable sheet                                                              | S    | P3      | —                                                                                                                                            |                                                   |
| RC-CHR-3.1  | Characters  | Live party panel over remote play                                            | M    | P2      | SES-1.2                                                                                                                                      |                                                   |
| RC-CHR-3.2  | Characters  | Party stash v2                                                               | S    | P2      | —                                                                                                                                            |                                                   |
| RC-CHR-4.1  | Characters  | Player-private notes (DM-invisible)                                          | L    | P2      | STB-4 (needs an ADR amendment to ADR-004/019: a second Dexie database `dndtools-private-<characterId>` never replicated, never in MCP reads) |                                                   |
| RC-CHR-4.2  | Characters  | Highlight compilation                                                        | S    | P2      | SES-4.1                                                                                                                                      |                                                   |
| RC-CHR-4.3  | Characters  | Preview-mode edges (DEBT-2026-005)                                           | S    | P2      | —                                                                                                                                            |                                                   |
| RC-CHR-4.4  | Characters  | Trusted tier decision                                                        | S    | P2      | —                                                                                                                                            |                                                   |
| RC-CHR-5.1  | Characters  | Character sheet template fidelity                                            | M    | P3      | DSN-2.1                                                                                                                                      |                                                   |
| RC-CHR-5.2  | Characters  | Builder step polish                                                          | S    | P3      | —                                                                                                                                            |                                                   |
| RC-CHR-5.3  | Characters  | Roster library information scent                                             | S    | P3      | —                                                                                                                                            |                                                   |
| RC-KNW-1.1  | Knowledge   | Shared markdown renderer with callouts, tables, images, wikilinks            | M    | P2      | —                                                                                                                                            |                                                   |
| RC-KNW-1.2  | Knowledge   | Editor v2: split/preview, toolbar, wikilink autocomplete, slash menu         | L    | P2      | 1.1                                                                                                                                          |                                                   |
| RC-KNW-1.3  | Knowledge   | Templates and snippets UI                                                    | M    | P2      | 1.2                                                                                                                                          |                                                   |
| RC-KNW-1.4  | Knowledge   | Reading width and typography preference                                      | S    | P3      | —                                                                                                                                            |                                                   |
| RC-KNW-2.1  | Knowledge   | Filters and saved searches UI                                                | M    | P2      | —                                                                                                                                            |                                                   |
| RC-KNW-2.2  | Knowledge   | Note list information scent                                                  | S    | P3      | —                                                                                                                                            |                                                   |
| RC-KNW-2.3  | Knowledge   | Command palette v2                                                           | M    | P2      | —                                                                                                                                            |                                                   |
| RC-KNW-3.1  | Knowledge   | Calendar editor                                                              | M    | P2      | —                                                                                                                                            |                                                   |
| RC-KNW-3.2  | Knowledge   | Quest/faction/NPC cards to DS spec                                           | M    | P3      | DSN-2.1                                                                                                                                      |                                                   |
| RC-KNW-3.3  | Knowledge   | Relationship editor (faction↔NPC, NPC↔location)                              | S    | P2      | —                                                                                                                                            |                                                   |
| RC-KNW-4.1  | Knowledge   | Clusters and momentum                                                        | M    | P2      | —                                                                                                                                            |                                                   |
| RC-KNW-4.2  | Knowledge   | Link repair UI                                                               | S    | P2      | —                                                                                                                                            |                                                   |
| RC-KNW-4.3  | Knowledge   | Graph performance and interaction                                            | S    | P3      | —                                                                                                                                            |                                                   |
| RC-AUD-1.1  | Audio       | Web Audio engine                                                             | L    | P2      | —                                                                                                                                            |                                                   |
| RC-AUD-1.2  | Audio       | Asset metadata: duration, waveform thumbnail, tags                           | S    | P2      | —                                                                                                                                            |                                                   |
| RC-AUD-1.3  | Audio       | Starter pack                                                                 | M    | P2      | —                                                                                                                                            |                                                   |
| RC-AUD-2.1  | Audio       | Scene packages                                                               | M    | P2      | —                                                                                                                                            |                                                   |
| RC-AUD-2.2  | Audio       | POI-linked scene packages                                                    | S    | P2      | 2.1, MAP-2.5                                                                                                                                 |                                                   |
| RC-AUD-2.3  | Audio       | `.dndscene` export/import                                                    | S    | P2      | 2.1                                                                                                                                          |                                                   |
| RC-AUD-2.4  | Audio       | Second-screen display v2                                                     | S    | P3      | —                                                                                                                                            |                                                   |
| RC-AUD-3.1  | Audio       | Combat music automation                                                      | S    | P2      | 1.1                                                                                                                                          |                                                   |
| RC-AUD-3.2  | Audio       | SFX events                                                                   | M    | P2      | 1.1                                                                                                                                          |                                                   |
| RC-AUD-3.3  | Audio       | Web sources (opt-in)                                                         | S    | P2      | —                                                                                                                                            |                                                   |
| RC-AUD-3.4  | Audio       | Assistant atmosphere tools                                                   | S    | P2      | AI-1.2                                                                                                                                       |                                                   |
| RC-AI-1.1   | AI          | Transport abort + streaming polish                                           | S    | P1      | —                                                                                                                                            | skipped(loop: 2 failed runs)                      |
| RC-AI-1.3   | AI          | Read tools: continuity bundle, coverage gaps, stale notes, cluster momentum  | S    | P1      | —                                                                                                                                            | skipped(loop: 2 failed runs)                      |
| RC-AI-1.4   | AI          | Agentic PC leveling                                                          | M    | P2      | CHR-2.1                                                                                                                                      |                                                   |
| RC-AI-2.1   | AI          | Semantic diff preview for proposals                                          | M    | P2      | —                                                                                                                                            |                                                   |
| RC-AI-2.2   | AI          | Three-way conflict UI                                                        | M    | P2      | 2.1                                                                                                                                          |                                                   |
| RC-AI-2.3   | AI          | Audit browser + export                                                       | S    | P2      | —                                                                                                                                            |                                                   |
| RC-AI-2.4   | AI          | Batch review with grouping and filters                                       | S    | P2      | —                                                                                                                                            |                                                   |
| RC-AI-3.1   | AI          | Model router and status panel                                                | M    | P2      | —                                                                                                                                            |                                                   |
| RC-AI-3.2   | AI          | Local embeddings for semantic search                                         | L    | P2      | 3.1                                                                                                                                          |                                                   |
| RC-AI-3.3   | AI          | Ollama model management                                                      | S    | P2      | —                                                                                                                                            |                                                   |
| RC-AI-4.1   | AI          | Copilot client + indexer contract (behind the phase-2 gate)                  | M    | P2      | CLD-2.2                                                                                                                                      |                                                   |
| RC-CLD-1.1  | Cloud       | SES production access + verified invite sender                               | S    | P2      | (external)                                                                                                                                   |                                                   |
| RC-CLD-1.2  | Cloud       | Prod promotion run                                                           | S    | P4      | 1.1, ENG-7 (external)                                                                                                                        |                                                   |
| RC-CLD-1.3  | Cloud       | TURN production hardening                                                    | M    | P2      | —                                                                                                                                            |                                                   |
| RC-CLD-1.4  | Cloud       | Privacy-respecting product analytics (opt-in)                                | M    | P2      | —                                                                                                                                            |                                                   |
| RC-CLD-2.1  | Cloud       | Stripe billing (ADR-027 → Accepted)                                          | L    | P2      | (external)                                                                                                                                   |                                                   |
| RC-CLD-2.2  | Cloud       | Cloud-Enhanced phase 2 security review                                       | M    | P2      | —                                                                                                                                            |                                                   |
| RC-CLD-2.3  | Cloud       | FCM push                                                                     | M    | P2      | (external)                                                                                                                                   |                                                   |
| RC-CLD-2.4  | Cloud       | Cross-device merge sync                                                      | L    | P2      | none (ADR-010 exists)                                                                                                                        |                                                   |
| RC-CLD-2.5  | Cloud       | Keyless browser access (Cloud-Enhanced)                                      | M    | P2      | 2.2. Acceptance: gated e2e                                                                                                                   |                                                   |
| RC-CLD-3.1  | Cloud       | Host/join flow polish                                                        | M    | P2      | —                                                                                                                                            |                                                   |
| RC-CLD-3.2  | Cloud       | Player companion parity                                                      | M    | P2      | CHR-3.1, CAN-6.2                                                                                                                             |                                                   |
| RC-CLD-3.3  | Cloud       | Async play: between-session inbox                                            | S    | P2      | —                                                                                                                                            |                                                   |
| RC-CLD-4.1  | Cloud       | Marketplace listing kinds and module format                                  | M    | P2      | —                                                                                                                                            |                                                   |
| RC-CLD-4.2  | Cloud       | Discovery: search, filters, featured, ratings                                | M    | P2      | (external)                                                                                                                                   |                                                   |
| RC-CLD-4.3  | Cloud       | Creator tooling                                                              | S    | P2      | —                                                                                                                                            |                                                   |
| RC-CLD-4.4  | Cloud       | Wiki v2                                                                      | M    | P3      | —                                                                                                                                            |                                                   |
| RC-DSN-1.1  | Design      | Complete the `T` map and lint raw values                                     | M    | P3      | —                                                                                                                                            |                                                   |
| RC-DSN-1.2  | Design      | Five themes                                                                  | M    | P3      | —                                                                                                                                            |                                                   |
| RC-DSN-1.3  | Design      | Motion vocabulary                                                            | S    | P3      | —                                                                                                                                            |                                                   |
| RC-DSN-1.4  | Design      | Density audit                                                                | S    | P3      | —                                                                                                                                            |                                                   |
| RC-DSN-2.1  | Design      | Convert `src/ds/components/                                                  | L    | P3      | —                                                                                                                                            |                                                   |
| RC-DSN-2.2  | Design      | Missing primitives                                                           | M    | P3      | —                                                                                                                                            |                                                   |
| RC-DSN-2.3  | Design      | Component documentation site (in-repo)                                       | M    | P3      | —                                                                                                                                            |                                                   |
| RC-DSN-2.4  | Design      | Re-sync design source A                                                      | S    | P3      | —                                                                                                                                            |                                                   |
| RC-DSN-3.1  | Design      | Empty-state illustration set                                                 | M    | P3      | —                                                                                                                                            |                                                   |
| RC-DSN-3.2  | Design      | Icon vocabulary completion                                                   | S    | P3      | —                                                                                                                                            |                                                   |
| RC-DSN-3.3  | Design      | Brand asset kit                                                              | M    | P3      | —                                                                                                                                            |                                                   |
| RC-DSN-3.4  | Design      | Loading, skeleton, and progress states                                       | S    | P3      | —                                                                                                                                            |                                                   |
| RC-DSN-4.1  | Design      | Golden-route visual regression suite                                         | M    | P3      | —                                                                                                                                            |                                                   |
| RC-DSN-4.2  | Design      | Design conformance checklist in the PR template                              | S    | P3      | —                                                                                                                                            |                                                   |
| RC-UX-1.1   | UX          | Message-key catalogs and `t()` API                                           | M    | P1      | STB-4.4                                                                                                                                      | done (2a1c172)                                    |
| RC-UX-1.2   | UX          | Migrate every user-visible string                                            | L    | P1      | 1.1                                                                                                                                          |  done (9f742c6)|
| RC-UX-1.3   | UX          | RTL readiness                                                                | S    | P2      | —                                                                                                                                            |                                                   |
| RC-UX-1.4   | UX          | Community translation workflow                                               | S    | P2      | —                                                                                                                                            |                                                   |
| RC-UX-2.1   | UX          | Extend the axe route list to every durable workspace                         | S    | P2      | —                                                                                                                                            |                                                   |
| RC-UX-2.2   | UX          | Canvas and map screen-reader contracts                                       | M    | P2      | CAN-3.5, MAP-4.1                                                                                                                             |                                                   |
| RC-UX-2.3   | UX          | Focus and dialog audit                                                       | S    | P3      | —                                                                                                                                            |                                                   |
| RC-UX-2.4   | UX          | Text scaling and zoom                                                        | S    | P3      | —                                                                                                                                            |                                                   |
| RC-UX-3.1   | UX          | HelpTip placements                                                           | S    | P2      | DSN-2.2                                                                                                                                      |                                                   |
| RC-UX-3.2   | UX          | Feature spotlight system                                                     | M    | P2      | DSN-2.2                                                                                                                                      |                                                   |
| RC-UX-3.3   | UX          | Keyboard shortcut registry and `?` overlay                                   | M    | P2      | —                                                                                                                                            |                                                   |
| RC-UX-3.4   | UX          | Help menu, Getting started, What's new                                       | S    | P2      | —                                                                                                                                            |                                                   |
| RC-UX-3.5   | UX          | Maturity-signal disclosure                                                   | S    | P2      | —                                                                                                                                            |                                                   |
| RC-UX-3.6   | UX          | Onboarding v2                                                                | M    | P3      | 3.2, DSN-3.1                                                                                                                                 |                                                   |
| RC-UX-4.1   | UX          | Device-preferences slice and platform layer (DEBT-2026-001)                  | M    | P2      | —                                                                                                                                            |                                                   |
| RC-UX-4.2   | UX          | Mobile primary-action audit                                                  | S    | P3      | —                                                                                                                                            |                                                   |
| RC-UX-4.3   | UX          | Tablet (rail) layouts                                                        | M    | P3      | —                                                                                                                                            |                                                   |
| RC-UX-4.4   | UX          | Copy pass v2 in the Lamplight voice                                          | M    | P3      | 1.2                                                                                                                                          |                                                   |
| RC-PLT-1.1  | Platform    | Desktop code signing + notarization                                          | S    | P4      | (external)                                                                                                                                   |                                                   |
| RC-PLT-1.2  | Platform    | Auto-update (electron-updater, GitHub Releases provider)                     | M    | P2      | —                                                                                                                                            |                                                   |
| RC-PLT-1.3  | Platform    | Electron parity audit                                                        | S    | P3      | —                                                                                                                                            |                                                   |
| RC-PLT-2.1  | Platform    | PWA                                                                          | M    | P2      | —                                                                                                                                            |                                                   |
| RC-PLT-2.2  | Platform    | Android: share-target import, home-screen shortcuts, notification channels   | M    | P2      | —                                                                                                                                            |                                                   |
| RC-PLT-2.3  | Platform    | Play internal track                                                          | S    | P4      | (external)                                                                                                                                   |                                                   |
| RC-PLT-3.1  | Platform    | iOS decision and scaffold                                                    | M    | P2      | —                                                                                                                                            |                                                   |
| RC-ENG-1.1  | Engineering | Perf measurement pipeline                                                    | M    | P1      | —                                                                                                                                            | done (c237742)                                    |
| RC-ENG-1.2  | Engineering | Bundle budget enforcement + route-level analysis                             | S    | P1      | —                                                                                                                                            | done (ed4b5a4)                                    |
| RC-ENG-2.1  | Engineering | Tiered branch model + smoke gate                                             | S    | P1      | —                                                                                                                                            | done (ed4b5a4)                                    |
| RC-ENG-2.2  | Engineering | Test suite performance                                                       | M    | P2      | —                                                                                                                                            |                                                    in progress|
| RC-ENG-3.1  | Engineering | Promote budgets from provisional to measured                                 | S    | P4      | 1.1                                                                                                                                          |                                                   |
| RC-ENG-3.2  | Engineering | Runtime performance recovery                                                 | M    | P3      | 1.1                                                                                                                                          |                                                   |
| RC-ENG-4.1  | Engineering | `any` elimination in app seams                                               | M    | P2      | —                                                                                                                                            |                                                   |
| RC-ENG-4.2  | Engineering | Core coverage floors raised for new domains                                  | S    | P2      | —                                                                                                                                            |                                                   |
| RC-ENG-4.3  | Engineering | Dependency hygiene                                                           | S    | P0      | —                                                                                                                                            | done (2775646)                                    |
| RC-ENG-5.1  | Engineering | Security review v2 (whole app)                                               | M    | P4      | —                                                                                                                                            |                                                   |
| RC-ENG-5.2  | Engineering | Regression gates for new security invariants                                 | S    | P2      | —                                                                                                                                            |                                                   |
| RC-ENG-6.1  | Engineering | Observability in the app                                                     | S    | P2      | —                                                                                                                                            |                                                   |
| RC-ENG-7.1  | Engineering | RC checklist and beta program                                                | M    | P4      | —                                                                                                                                            |                                                   |
| RC-DOC-1.1  | Docs        | Initiative corpus re-pointed to React evidence                               | M    | P4      | all P2 merged                                                                                                                                |                                                   |
| RC-DOC-1.2  | Docs        | Architecture docs for the new subsystems                                     | M    | P2      | —                                                                                                                                            |                                                   |
| RC-DOC-1.3  | Docs        | User-facing docs                                                             | M    | P3      | —                                                                                                                                            |                                                   |
| RC-DOC-1.4  | Docs        | Release notes and marketing surface                                          | S    | P4      | —                                                                                                                                            |                                                   |
| RC-DOC-2.1  | Docs        | Roadmap upkeep                                                               | S    | rolling | —                                                                                                                                            |                                                   |
