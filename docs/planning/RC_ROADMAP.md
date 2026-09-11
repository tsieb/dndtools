# Lamplight — Release Candidate Roadmap (RC-1)

_Authored 2026-09-04 from a full read of the repo, the docs corpus, the ADRs, the initiative
backlog, the feature ledger, and the live code in `apps/gm-react` and `packages/core`. This is the
execution plan from the current state to a polished, feature-complete first release candidate._

_Revised 2026-09-11 against the dispatcher's task store, `origin/loop/rc` and `main`. §0.4 says how the
plan is executed now, §1.5 records where the baseline moved, §20.6 turns the second pass into stories
(lane POL), §21 carries the rules the dispatcher enforces, §24 lists the steps only the owner can take,
and every open story's `Owns:` was re-checked against the tree after the P0 decompositions moved files._

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
| §20     | The cross-cutting "second pass" checklists applied to every surface, and the POL stories that run them.     |
| §21     | Distribution rules for parallel agents (file ownership, branch model, conflict avoidance).                  |
| §22     | Risk register.                                                                                              |
| §23     | Complete story index (one row per story: id, lane, phase, deps, size, files).                               |
| §24     | Operator ledger: the steps only the owner can take, each with the exact command.                            |

### 0.2 Identifiers and sizing

- Stories are identified `RC-<LANE>-<epic>.<story>` (e.g. `RC-SYS-1.2`). Lanes: `STB` stabilize,
  `SYS` system packages, `WID` widgets, `CAN` canvas/scenes/board, `MAP` maps, `SES` session,
  `CHR` characters & player, `KNW` knowledge/campaign/graph, `AUD` audio/atmosphere, `AI`
  assistant, `CLD` cloud/collab/community, `DSN` design system/brand, `UX` UX/a11y/i18n/learnability,
  `PLT` platform shells, `ENG` engineering/quality/perf/security/release, `DOC` docs, `POL` the
  per-surface polish pass (§20.6).
- Size: **S** ≤ 1 agent-day · **M** 2–4 · **L** 5–10 · **XL** must be split before it is claimed.
- Phase: **P0** stabilize · **P1** foundations (critical path) · **P2** feature depth · **P3**
  polish passes · **P4** RC hardening. A story's phase is the earliest it may start; the dispatcher's
  phase gate admits P(n+1) only when every non-owner P(n) story is done (§21.3).
- Every story lists `Deps:` (story ids that must be merged first) and `Owns:` (the files the
  story may edit; touching anything else requires a `Deps:` on the story that owns it). `Owns:` is a
  **write fence** the dispatcher checks against the candidate diff (§21.2): list every path the work
  will touch, not only the headline file. Tests, snapshots, e2e specs, the message catalogs, the
  lockfile, the append-only barrels and the surface inventory are granted to every story automatically.

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

### 0.4 How the plan is executed

Since 2026-09-08 the stories in this file are run by the shared agent dispatcher
(`~/Programming/agent-dispatcher`, one `agent-dispatcher.service` user unit serving this repo and one
other). It ingests §4–§20 from `origin/loop/rc`, keeps its own task store as the status of record, runs
one worktree per story, gates every candidate with the manifest's gate list (quality gates, format,
typecheck, lint, core/app/cloud/tooling tests, build, feature audit, the full browser suite on both
profiles), sends it to an independent reviewer, integrates onto `loop/rc`, and opens the delivery PR to
`main`. §21 has the rules that follow from that. §23's status column is a rendering of the task store
produced by `tools/roadmap/sync-status.py`, not a hand-maintained ledger; `tools/roadmap/sync-tasks.py`
pushes edited `Owns:`/`Acceptance:`/`Deps:` lines back into the store.

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
| G14 | **Cloud product is pre-launch.** SES sandboxed (public registration cannot complete), prod promotion not run, Stripe ADR-027 Proposed, FCM absent, TURN single-instance beta, Cloud-Enhanced phase 2 security review open, community discovery/curation unbuilt, cross-device sync is backup-only. Infra changes + ADR-028 are uncommitted in the working tree.                                                                                                                                                                                                          | `docs/planning/CLOUD_TIER_ROADMAP.md`, `git status`                                                                                                                          | §14 CLD         |
| G15 | **Design fidelity debt.** DEBT-2026-004 (token map lacks spacing/radius; hand-rolled layer panels; raw rgba in widget bodies), untyped `.jsx` DS components behind a loose `index.d.ts`, ~128 `any` sites (DEBT-2026-002), no visual regression suite, no component docs/storybook, no empty-state illustrations, no dice drama, three themes vs the design package's five, design package readme still branded "DND Tools" with CDN fonts.                                                                                                                              | `DEBT.md`, `src/ds/index.d.ts`, `docs/design-package/readme.md`                                                                                                              | §15 DSN         |
| G16 | **i18n is a DOM bridge.** `src/i18n/index.tsx` (351 lines) translates by source text through a MutationObserver plus 186 `t()` calls; the ES catalog is partial; no locale-aware number/date formatting layer, no RTL, no lint for hardcoded strings.                                                                                                                                                                                                                                                                                                                    | `src/i18n/index.tsx`                                                                                                                                                         | §16 UX          |
| G17 | **Learnability surfaces unverified in React.** HelpTip, feature spotlight, `?` shortcut overlay, help menu, "What's new", maturity-signal disclosure triggers are I17 stories written for Svelte; the React app has onboarding + a static shortcut list in Settings.                                                                                                                                                                                                                                                                                                     | I17 vs `src/app/Onboarding.tsx`, `Settings.tsx`                                                                                                                              | §16 UX          |
| G18 | **Mega-files block parallel work.** `Settings.tsx` 4,989 lines, `Player.tsx` 2,677, `Extensions.tsx` 2,611, `CharBuilder.tsx` 2,470, `Session.tsx` 2,295, `PlayerView.tsx` 2,282, `Audio.tsx` 2,114, `Characters.tsx` 1,972, `MapBuilder.tsx` 1,691, `Community.tsx` 1,581. I21's "no file exceeds 500 lines" is violated roughly tenfold; any two agents touching Settings collide.                                                                                                                                                                                     | `wc -l apps/gm-react/src/screens/*.tsx`                                                                                                                                      | §4 STB, §18 ENG |
| G19 | **Perf budgets are all provisional with no measurement pipeline.** Eleven budgets in `perf/budget-registry.ts`; `PERFORMANCE.md` says "no automated capture/compare pipeline wired to scripts today".                                                                                                                                                                                                                                                                                                                                                                    | `docs/development/PERFORMANCE.md`                                                                                                                                            | §18 ENG         |
| G20 | **Docs describe a different app in places.** I13–I20 are "COMPLETED" with Svelte paths; `GLOSSARY.md` lists Capacitor/Android as _historical_ while Android ships; `PROTOTYPE.md` references the deleted `mockCampaign.ts`; the initiative index and design package still say "DND Tools"; FEATURE-GAPS is a reverse-chronological changelog rather than an inventory.                                                                                                                                                                                                   | the files named                                                                                                                                                              | §19 DOC         |
| G21 | **Platform reach.** No code-signing, no auto-update, no PWA/service worker, no iOS, Electron menu/shortcut parity unaudited, Android has no widgets/shortcuts/share-target.                                                                                                                                                                                                                                                                                                                                                                                              | `docs/development/RELEASING.md`, `electron/`, `android/`                                                                                                                     | §17 PLT         |

### 1.4 Working-tree state (resolved 2026-09-11)

- The 2026-09-04 items are closed: the infra/ADR-028 change landed (RC-STB-1.1), the branch set was
  pruned (RC-STB-1.2, again in RC-STB-1.4), the visual-review loop is retired.
- On 2026-09-11 the non-code corpus was consolidated (177 → 96 markdown files, commit `38439524`);
  41 `salvage/*` branches, `loop/rc.backup`, `auto/visual-review-loop` and ten finished dispatcher
  worktrees were archived under `refs/archive/*` and deleted; the seven open dependabot PRs were folded
  into RC-ENG-4.4. `git branch` lists `main`, `loop/rc`, and one `dispatch/dndtools/<hash>` per
  unfinished candidate.

### 1.5 Where the baseline moved (2026-09-11)

Every G-row above was written on 2026-09-04. This table is the honest delta: what the merged stories
closed, what is left, and which story carries it. The lane sections below keep their original
"Current state" paragraphs with a dated update line so the reasoning behind each story survives.

| #   | State on 2026-09-11                                                                                                                                                                                                                                      | Left open                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| G1  | Closed. `systems` slice, 5e + Generic built-ins, PF2e sample, actor-scoped reads, every domain re-plumbed (SYS-1..3 merged).                                                                                                                             | RC-SYS-3.6 validator + author guide (new).                                                                                   |
| G2  | Closed. Iframe and worker sandboxes, host API v1, starter library with a custom showcase (WID-1.x).                                                                                                                                                      | RC-WID-4.4 accessibility contract (new).                                                                                     |
| G3  | Closed except the style step. Builder shell, data/config/commands/advanced steps, export/versioning (WID-2.x).                                                                                                                                           | RC-WID-2.4 (in review), RC-WID-2.6, RC-WID-4.3.                                                                              |
| G4  | Closed. `widget.package.propose`, the Generate dialog, iterate-on-generated (WID-3.x).                                                                                                                                                                   | —                                                                                                                            |
| G5  | Closed. `widget.package.review` + the trust sheet (WID-1.5).                                                                                                                                                                                             | —                                                                                                                            |
| G6  | Closed. Inverse builders, `scene.restore-widget` + tombstones, undo/redo on both canvases (CAN-1).                                                                                                                                                       | —                                                                                                                            |
| G7  | Half closed. Zoom presets, scroll pan, overflow guard, quality indicator, tile tokens + header identity, map tile, per-player assignments, touch combat tile merged.                                                                                     | CAN-2.3–2.5, 3.5, 3.6, 4.1–4.4, 4.6, 5.1, 5.2, 6.1, 6.3 — the longest remaining chain.                                       |
| G8  | Closed. Tokens with vitals, ranges/paths, AoE, tracker sync, party marker, breadcrumb, travel time, lighting/LOS, fog reveal, list view, POI notes, bake layer, room graph, stamp library, raster import v2 (MAP-1..3, 4.1–4.3).                         | RC-MAP-4.4, 4.5 (P3).                                                                                                        |
| G9  | Closed. Session posture, quick panel, start/end flows, roll labels, inline rolls, tables, durations, HP sheet, quick reference, encounter v2, capture, continuity, prep v2, timers (SES-1..4).                                                           | RC-SES-2.4 dice drama (P3); RC-SES-5.1 player-rolled initiative (new).                                                       |
| G10 | Closed. Package resources, rests, concentration/death saves, XP/milestone, level-up v2, downtime, history, party panel, stash v2, private notes, highlights, preview edges, trusted-tier decision (CHR-1..4).                                            | RC-CHR-2.4 print; CHR-5.x polish (P3).                                                                                       |
| G11 | Closed. Shared renderer, editor v2, templates/snippets, filters + saved searches, palette v2, calendar editor, relationships, clusters/momentum, link repair (KNW-1..4).                                                                                 | KNW-1.4, 2.2, 3.2, 4.3 (P3); RC-KNW-5.1 folder round-trip, 5.2 revision history (new).                                       |
| G12 | Closed. Web Audio engine, metadata, starter pack, scene packages, POI links, `.dndscene`, combat music, SFX, web sources, assistant tools (AUD-1..3).                                                                                                    | RC-AUD-2.4 second screen v2 (P3).                                                                                            |
| G13 | Closed. Write and read tools, abort + streaming, PC leveling, semantic diff, three-way conflicts, audit export, batch review, model router, local embeddings, Ollama management, Copilot contract (AI-1..4).                                             | RC-AI-5.1 deterministic eval in CI (new).                                                                                    |
| G14 | Mostly closed. Prod promoted (`v0.3.7`, 2026-09-09), Stripe test mode live on dev with ADR-027 Accepted, TURN TLS + rotation runbook, analytics, merge sync, keyless access (gated), host/join, companion parity, inbox, listing kinds, creator tooling. | Owner steps in §24 (SES, Stripe prod, FCM, TURN prod cutover); RC-CLD-2.2 re-opened; RC-CLD-4.5, 4.4; RC-CLD-2.7, 2.8 (new). |
| G15 | Started. `T` map + raw-value lint and the missing primitives landed on `loop/rc` (DSN-1.1, 2.2).                                                                                                                                                         | DSN-1.2–1.4, 2.1, 2.3, 2.4, 3.x, 4.x — the polish toolchain; they open when the phase gate reaches P3.                       |
| G16 | Closed. Keyed catalogs (`en.ts` 6,032 lines, `es.ts` 6,105), `t()` everywhere, RTL, translation workflow (UX-1.1–1.4).                                                                                                                                   | RC-UX-1.5 pseudo-locale (new); RC-UX-4.4 copy pass (P3).                                                                     |
| G17 | Closed. HelpTips, spotlights, shortcut registry + `?`, help menu/What's new, maturity signals (UX-3.1–3.5).                                                                                                                                              | RC-UX-3.6 onboarding v2, RC-UX-3.7 demo vault (new).                                                                         |
| G18 | Closed. Every mega-file split; the 800-line gate is live (14 files sit between the 500 target and the gate today — the POL stories bring theirs under 500).                                                                                              | —                                                                                                                            |
| G19 | Half closed. The capture/compare pipeline exists (ENG-1.1) and CI grades every push, but the runner is 4 cores against a 16-core baseline and the drift column is never compared; the perf verdict flips on unchanged code.                              | RC-ENG-1.3 (unblocked with an amended bar), RC-ENG-1.4 policy (new), 3.1–3.3.                                                |
| G20 | Closed. STB-3 plus the 2026-09-11 consolidation; `pnpm feature-audit` asserts 48 limits with 0 stale.                                                                                                                                                    | RC-DOC-2.2 link checker (new), RC-DOC-1.1 re-scoped to the inventory audit.                                                  |
| G21 | Mostly closed. Auto-update, PWA, Android share-target/shortcuts/channels, iOS rejected for RC1 by ADR-038.                                                                                                                                               | Signing and Play track are owner steps (§24); RC-PLT-1.3 parity, RC-PLT-2.4 offline assurance (new).                         |

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
   ADR-024's editor IA, and the session/map/board interaction models are **implemented in React**, and
   the surface inventory (`docs/requirements/FEATURE-GAPS.md`) has been audited row by row against the
   code (RC-DOC-1.1) and the RC exit audit has run (RC-ENG-7.3).

### 2.2 Quality gates (all green on the RC commit)

| Gate          | Command / source                                                    | RC bar                                                                                                         |
| ------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Static + unit | `pnpm check`                                                        | green; core coverage floors unchanged or raised                                                                |
| Browser       | `pnpm e2e` both profiles                                            | green; every §5–§17 epic has ≥1 spec                                                                           |
| Accessibility | `pnpm a11y:gate`                                                    | zero critical/serious; register empty; every durable workspace in the route list                               |
| Whole-app     | `pnpm validate:full`                                                | 0 fail; the Prettier warn is the only accepted warn                                                            |
| Performance   | `pnpm perf:compare` against the CI baseline (RC-ENG-1.3/1.4/3.1)    | every budget **measured on CI hardware**, none `provisional`, none breached on five consecutive scheduled runs |
| Security      | `pnpm security:audit`, `security:secrets`, phase-2 review checklist | no high; checklist signed or Cloud-Enhanced stays gated                                                        |
| Visual        | visual-regression suite (RC-DSN-4.1)                                | zero unreviewed diffs on the golden route set, five themes × three tiers                                       |
| Release       | `release.yml`                                                       | six packages, SBOM, attestations, signed desktop where certs exist                                             |
| Docs          | `pnpm feature-audit` + RC-DOC-1.1 + RC-DOC-2.2                      | zero drift; every inventory row audited; the docs link checker green                                           |

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

**Status 2026-09-11.** M0 and M1 are complete; the first chain is done through CHR-4. The second
chain is now the critical path: CAN-2.3/2.4 → 2.5/3.5 → 3.6, CAN-4.1 → 4.2/4.3/4.4/WID-4.3 → 4.6/WID-2.6,
CAN-5.1 → 5.2, CAN-6.1 — thirteen stories in one lane, every one touching `SceneBoardCanvas.tsx` or
`WidgetFrame.tsx`, so they run largely in series. The polish toolchain (DSN-1.2–4.2) is next behind
them; the POL stories (§20.6) depend on both. P4 stories depend on `POL-1.*`.

### 3.2 Milestones

| Milestone            | Contents                                        | Exit signal                                                                                                                                                                                    |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0 — Clean slate** | §4 STB-1..4                                     | Tree clean, branches pruned, review loop paused/redirected, all ten mega-files decomposed, five ADRs Accepted, docs no longer claim Svelte work as done.                                       |
| **M1 — Foundations** | SYS-1/2, WID-1, CAN-1, MAP-1, ENG-1, UX-1, AI-1 | A Generic package renders a non-5e sheet; a sandboxed custom widget draws on a scene; scene undo works; tokens exist on a map; perf samples are captured in CI; `t()` is the only string path. |
| **M2 — Depth**       | all P2 epics                                    | Every G1–G17 finding closed or re-scoped to an external blocker.                                                                                                                               |
| **M3 — Polish**      | DSN-1..5, then one polish PR per surface        | Visual regression golden set frozen; §20 checklists attached to 16 surface PRs; a11y register still empty.                                                                                     |
| **M4 — RC-1**        | ENG-3/5/7, PLT-1/2, DOC-1/2, CLD-1              | §2 gates all green on one tagged commit; RC notes drafted; prod promoted; beta program opened.                                                                                                 |

Milestone status 2026-09-11: **M0 done · M1 done · M2 88% merged** (18 P2 stories open, 13 of them
in CAN, plus the four new P2 engineering stories) **· M3 not started · M4 not started.**

### 3.3 Parallel lanes and their collision map

Lanes may run concurrently when they own disjoint files. The table names the shared files that
force sequencing.

| Shared file                                                                     | Lanes that need it       | Rule                                                                                             |
| ------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| `packages/core/src/commands/dispatch.ts`, `schemas/commands.ts`, `index.ts`     | every core-touching lane | Append-only edits; each story adds its block in one commit; rebase before merge. Do not reorder. |
| `apps/gm-react/src/App.tsx`, `app/nav.ts`, `app/AppShell.tsx`                   | SES-1, UX-3, CAN-4       | One owner at a time; queue via `Deps:`.                                                          |
| `screens/settings/*`, `screens/session/*`                                       | many                     | Split in P0; each category file is its own owner — claim the file, not the directory.            |
| `src/i18n/messages/*.ts`, `*.test.ts*`, `tests/e2e/*.spec.ts`, `pnpm-lock.yaml` | every lane               | Companion paths (§21.2): granted to every story; concurrent edits resolve on the rebase retry.   |
| `src/app/widget-bodies.tsx`, `SceneBoardCanvas.tsx`, `board-helpers.ts`         | WID-1, CAN-\*            | WID-1 lands first; CAN stories rebase on it.                                                     |
| `packages/core/src/state/widget-package-state.ts`                               | SYS-1, WID-\*            | SYS-1 first (it moves `activeSystemPackageId` out); WID after.                                   |
| `src/styles/tokens/*.css`, `screen-kit.tsx`                                     | DSN-1                    | Single owner; everyone else consumes.                                                            |
| `src/i18n/*`                                                                    | UX-1                     | Single owner during P1; P3 passes only add keys.                                                 |

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
- **RC-STB-1.4 — Branch ledger and dispatcher worktree hygiene.** `S` · P0 · Deps: 1.2 · Owns: git
  refs, `docs/development/GIT_WORKFLOW.md`. Archive every stale tip under `refs/archive/*` before the
  branch name goes; remove the worktrees of finished dispatcher tasks; fold the open dependabot PRs into
  RC-ENG-4.4; record what was archived and why. Acceptance: `git branch` lists only `main`, `loop/rc`
  and unfinished `dispatch/dndtools/*` candidates; `git for-each-ref refs/archive` holds every deleted
  tip; the ledger section in GIT_WORKFLOW.md names each. **Done 2026-09-11.**

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
- **RC-SYS-3.6 — System package validator and author guide.** `S` · P3 · Deps: 3.4 · Owns:
  `scripts/systems-validate.ts` (new), `package.json` (`systems:validate`),
  `docs/architecture/SYSTEM_PACKAGES.md` (authoring section), `packages/core/src/systems/samples/pf2e.json`.
  A CLI that validates a package file against the zod schema, evaluates every formula at levels
  1/5/10/20, checks icon names against the vocabulary and condition keys for uniqueness, and prints a
  field-by-field report; the guide walks a community author from fork to `.dndmodule`. Acceptance: the
  CLI rejects a fixture with an unknown key and one with an invalid formula, naming the path; it passes
  on 5e, Generic and PF2e; `pnpm systems:validate` runs inside `pnpm check`.

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
- **RC-WID-2.4 — Style step.** `S` · P2 · Deps: 2.1, DSN-1.1 · Owns: `app/widgetBuilder/StyleStep.tsx`,
  `app/board-helpers.ts`, `app/widgets/WidgetRenderSlot.tsx`, `app/widgets/SandboxHost.tsx`,
  `screens/sceneEditor/Inspector.tsx`, `screens/sceneEditor/fields.tsx`. Declare `--widget-*` tokens
  with defaults picked from the semantic token list (never raw hex unless `custom-stylesheet`
  capability), isolation mode, capabilities. _Candidate `909f5815` is in review (2026-09-11)._ Acceptance: tokens appear in the
  Inspector's Style group and re-theme with `data-theme`.
- **RC-WID-2.5 — Advanced step: custom HTML/JS.** `M` · P2 · Deps: 1.3, 2.1 · Owns:
  `app/widgetBuilder/AdvancedStep.tsx`. A code editor (plain `<textarea>` with mono font, line
  numbers, and a "format" button — no heavy editor dependency), host API reference panel, requested
  host permissions with the security summary recomputed live, and the SEC-011 destination-class
  picker. Acceptance: the preview runs in the WID-1.3 sandbox; the Review step shows the trust
  recommendation before install.
- **RC-WID-2.6 — Edit-in-place from the canvas.** `S` · P2 · Deps: 2.1, CAN-4.2 · Owns:
  `screens/sceneEditor/Inspector.tsx` ("Edit widget definition" for user-authored packages),
  `screens/extensions/WidgetBuilder.tsx` (open at a step with a draft), `app/widgetBuilder/index.tsx`.
  Acceptance: round-trip edit → upgrade → placed instance migrated (e2e in `widget-builder.spec.ts`).
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
- **RC-WID-4.3 — Widget bindings inspector.** `M` · P2 · Deps: CAN-4.1 · Owns:
  `screens/sceneEditor/BindingInspector.tsx` (new), `screens/sceneEditor/Inspector.tsx` (Binding tab
  mount), `screens/sceneEditor/shared.ts`. Search DM-scoped entities, pick binding mode, show resolver
  state (`available/unbound/missing/hidden/conflicted/degraded`) with the fail-closed copy from the
  brief. Acceptance: binding a player-hidden NPC shows `hidden` to a player preview (e2e).
- **RC-WID-4.4 — Widget accessibility contract.** `M` · P3 · Deps: 4.2, 2.4 · Owns:
  `app/widgets/builtin`, `app/widgets/templates`, `app/widgets/WidgetRenderSlot.tsx`,
  `app/widgets/SandboxHost.tsx`, `apps/gm-react/tests/e2e/custom-widgets.spec.ts`,
  `docs/architecture/WIDGETS.md`. Every builtin body and template renderer is a labelled region whose
  operate controls are keyboard reachable, announces value changes through a live region, and never
  carries colour-only status; the sandbox host forwards the theme's forced-colors state and documents
  the `aria` contract a custom widget must honour. Acceptance: axe on `/board` and `/scene/:id` with
  every builtin type placed is clean on both profiles; a keyboard-only e2e operates every builtin that
  declares an operate command; WIDGETS.md documents the contract.

---

## 7. Workstream CAN — Customizable canvas spaces: scenes, the GM Screen board, tiles

**Outcome.** The scene canvas and the GM Screen are the mission-control surfaces the widget brief
and I20 describe: tiles are recognizable at a glance, creation is a two-click gallery with live
preview, layout edits are reversible, the board is fit-first and keyboard-complete on desktop and a
stacked, thumb-reachable panel list on phones, a map tile brings combat onto the board, and scenes
carry templates, backgrounds, docks, and sections that the core already models.

**Current state (G6, G7 — updated 2026-09-11).** `screens/Board.tsx` + `screens/board/*` (bounded home
scene, presets + safe point, zoom presets, scroll pan, overflow guard, layout-quality indicator),
`screens/sceneEditor/{index,Inspector,AddWidgetPanel,SceneMetaPanel,fields}.tsx` (free canvas, tiered
inspector, add panel, metadata), `app/SceneBoardCanvas.tsx` + `app/canvas/{WidgetFrame,ZoomCluster,
useLayoutHistory}.tsx` (dot grid, select/drag/resize, roving tabindex, undo/redo over core inverse
builders, restore from tombstones, tile-type tokens and header identity), the map tile
(`app/widgets/builtin/Map.tsx`), per-player scene assignments, the touch combat tile. Core scene state
has `SceneBackground`, `WidgetDock`, `SectionLayoutRegion`, `SceneTemplateMeta`, `PlayerViewAssignment`,
focus order, command-center presets/auto-save, `layout-commands.ts`/`focus-order.ts`. Still missing:
note depth levels, the action menu, resize presets, the full keyboard model, multi-select/align, the
gallery with previews, Inspector v2, the templates picker, backgrounds/docks UI, the stacked phone board
and its action bar, the player-view preview overlay, empty states. The `WidgetFrame` moved to
`app/canvas/WidgetFrame.tsx` and the inspector to `screens/sceneEditor/Inspector.tsx` — every story
below names the moved files.

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
  `app/widgets/builtin/NoteBody.tsx`, `app/widgets/builtin/NotesBody.tsx`, `app/widgets/builtin/index.tsx`,
  `packages/core/src/state/widget-package-state.ts` (the note widget's `configFields`:
  `depth: title|summary|full`), `app/canvas/WidgetFrame.tsx` (a depth badge in edit mode). Full depth uses the shared markdown renderer and virtualizes over 200
  lines (IntersectionObserver sentinels). Acceptance: e2e toggles depth; perf test renders a 2,000-
  line note tile under the `widget-update` budget.
- **RC-CAN-2.4 — Tile action menu.** `M` · P2 · Deps: 2.2, CAN-1.3 · Owns: `app/canvas/WidgetFrame.tsx`,
  `app/canvas/TileActionMenu.tsx` (new), `app/canvas/TileDialogs.tsx` (new), `app/SceneBoardCanvas.tsx`,
  `packages/core/src/commands/widget.ts`, `packages/core/src/lifecycle/widget-undo.ts`,
  `packages/core/src/lifecycle/command-lifecycle.ts`, `packages/core/src/queries/layout-commands.ts`,
  `docs/architecture/SCENE_HISTORY.md`. (`…` IconButton → DS `Menu` with `role="menu"`): Move (keyboard
  move mode), Resize, Duplicate (new core `scene.duplicate-widget`, `S` core story folded here), Bind…,
  Configure…, Visibility submenu, Open source (note/map/character deep link), Remove. Acceptance: menu
  keyboard pattern test; `canvas.spec.ts` duplicates a tile; the duplicate is undoable.
- **RC-CAN-2.5 — Resize presets and keyboard resize.** `S` · P2 · Deps: 2.4 · Owns:
  `app/SceneBoardCanvas.tsx`, `app/canvas/WidgetFrame.tsx`, `app/board-helpers.ts`. Handle click without drag cycles S/M/L presets from the definition's
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
  `app/SceneBoardCanvas.tsx`, `app/canvas/WidgetFrame.tsx`, `app/canvas/keyboard.ts` (new),
  `app/shortcuts/registry.ts`. Tab reading order from focus-order metadata (z/group/dock/pin), Enter
  enters tile content, Space = move mode, `a` = add gallery, Delete = undoable remove, spatial
  nearest-neighbour arrow navigation between tiles (the brief's "spatial" mode) alongside nudge.
  Acceptance: an axe + keyboard-only e2e that builds a three-tile board with no pointer.
- **RC-CAN-3.6 — Multi-select, align/distribute, group, z-order.** `L` · P2 · Deps: 1.1, 3.5 ·
  Owns: `app/SceneBoardCanvas.tsx`, `app/canvas/WidgetFrame.tsx`, `app/canvas/geometry.ts` (new: pure
  module: marquee "fully enclosed" selection, align left/center/right/top/middle/bottom, distribute,
  bring forward/back), `packages/core/src/commands/widget.ts`, `packages/core/src/state/scene-state.ts`,
  `packages/core/src/queries/layout-commands.ts` (core `scene.set-widget-order` + `scene.group-widgets`,
  additive; `S` core story folded), `screens/sceneEditor/Inspector.tsx` (the numeric `TransformPanel`
  x/y/w/h/rotation). Acceptance: pure-module unit tests;
  e2e aligns three tiles by keyboard.

### Epic CAN-4 — Creation flow, gallery, palette, map tile (P2)

- **RC-CAN-4.1 — Tile gallery sheet with live previews.** `M` · P2 · Deps: 2.2, WID-1.1 · Owns:
  `app/canvas/AddWidgetGallery.tsx` (new; replaces the add panels in Board and SceneEditor),
  `app/SceneBoardCanvas.tsx`, `app/canvas/WidgetFrame.tsx`, `screens/Board.tsx`,
  `screens/sceneEditor/index.tsx`, `screens/sceneEditor/AddWidgetPanel.tsx` (removed),
  `docs/architecture/WIDGETS.md`. DS
  `Sheet` (phone) / side panel (desktop); Card per library entry with accent, icon, name,
  description, a **rendered miniature** from the template with sample data, category filter, search,
  profile-unsupported entries dimmed with the reason, "Start from template" header when the scene is
  empty, "Generate with assistant" entry (WID-3.2), "Build your own" entry (WID-2.1). Selecting adds
  at the next free slot and focuses the tile. Acceptance: e2e both profiles.
- **RC-CAN-4.2 — Inspector v2 (noun panel).** `M` · P2 · Deps: 2.4, WID-4.3 · Owns:
  `screens/sceneEditor/Inspector.tsx`, `screens/sceneEditor/SceneMetaPanel.tsx`,
  `screens/sceneEditor/fields.tsx`, `screens/sceneEditor/shared.ts`, `screens/sceneEditor/index.tsx`. Tabs: Content / Display / Style
  (from `configFields` groups), Binding (WID-4.3), Transform, Visibility (with the "who sees this"
  preview line). Empty selection shows scene properties (background, docks, sections, template
  meta). Acceptance: `canvas.spec.ts` configure round-trip retained.
- **RC-CAN-4.3 — `>board` and `>scene` command-palette actions.** `S` · P2 · Deps: 4.1 · Owns:
  `app/CommandPalette.tsx`, `packages/core/src/queries/command-actions.ts` (contextual action
  provider), `packages/core/src/queries/quick-switcher-query.ts`, `app/shortcuts/registry.ts`. Add tile of type…, Apply template…, Toggle edit, Undo. Visible only on those routes.
  Acceptance: `command-palette.spec.ts`.
- **RC-CAN-4.4 — Scene templates picker with thumbnails.** `M` · P2 · Deps: 4.1 · Owns:
  `app/canvas/TemplatePicker.tsx` (new), `app/canvas/AddWidgetGallery.tsx` (header entry),
  `screens/sceneEditor/index.tsx`, `screens/Board.tsx`, `packages/core/src/commands/command-center.ts`,
  `packages/core/src/commands/scene-meta.ts`, `packages/core/src/state/command-center-state.ts` (core
  `command-center` presets reused for scenes: `scene.apply-template` — `S` core story: instantiate a
  preset's widgets into any scene).
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
  `screens/sceneEditor/SceneMetaPanel.tsx`, `screens/sceneEditor/Inspector.tsx`, `app/SceneBoardCanvas.tsx`,
  `app/canvas/WidgetFrame.tsx`, `packages/core/src/queries/layout-commands.ts`,
  `packages/core/src/commands/scene-meta.ts`. Background picker (paper/parchment/dark/grid),
  dock a widget to an edge (`scene.dock-widget` exists? — verify `layout-commands.ts`; add if
  missing as an `S` core story), section regions drawn as labelled bands. Acceptance: e2e.

### Epic CAN-5 — Mobile board and session posture (P2)

- **RC-CAN-5.1 — Compact stacked-panel board.** `L` · P2 · Deps: 2.2 · Owns:
  `app/canvas/StackedBoard.tsx` (new), `screens/Board.tsx`, `screens/board/useBoardLayouts.ts`,
  `screens/sceneEditor/index.tsx` (phone tier), `app/platform/preferences.ts`,
  `apps/gm-react/src/platform/preferences.ts`, `ds/components/core/Icon.jsx`,
  `docs/reference/ICON_VOCABULARY.md`. Tiles sorted by
  y then x as collapsible panels (48px headers), expanded state in `sessionStorage` keyed by scene,
  full-screen expand per tile (`maximize-2`) bounded above the bottom nav, no zoom/pan. Acceptance:
  `responsive.spec.ts` at 320×640 and 360×360; a11y gate on `/board` mobile.
- **RC-CAN-5.2 — Floating session action bar (phone, session live).** `M` · P2 · Deps: 5.1, SES-1.1
  · Owns: `app/canvas/SessionActionBar.tsx` (new), `screens/Board.tsx`, `app/shell/SessionRail.tsx`,
  `app/shell/session-posture.ts`. d20/d6 roll buttons, Next turn (when combat is
  active, combat accent), Handout. `role="toolbar"`. Acceptance: e2e.
- **RC-CAN-5.3 — Touch-first combat tile.** `M` · P2 · Deps: SES-3.2 · Owns:
  `app/widgets/builtin/InitiativeTracker.tsx` compact variant (56px rows, tappable HP → numeric
  keypad sheet, swipe-left quick actions with keyboard alternative). Acceptance: e2e on mobile.

### Epic CAN-6 — Player-view projection and previews (P2)

- **RC-CAN-6.1 — Player-view preview overlay on the canvas.** `M` · P2 · Deps: 2.2 · Owns:
  `screens/sceneEditor`, `app/ViewAsControl.tsx`, `app/SceneBoardCanvas.tsx`, `app/canvas/WidgetFrame.tsx`,
  `screens/Board.tsx`. Non-destructive "what player X sees" overlay
  that dims DM-only tiles and shows the visibility reason per tile; editing suspended; exits with
  Escape. Acceptance: e2e; `isolation-guard`-style assertion that the overlay uses the actor read.
- **RC-CAN-6.2 — Per-player scene assignments UI.** `S` · P2 · Owns: `screens/session/
ActiveMap.tsx`, `app/ProjectionControl.tsx`. Surface `PlayerViewAssignment`/`session.assign-
player-view` so different players can be projected different scenes. Acceptance: `player-view.spec`.
- **RC-CAN-6.3 — Board empty states and first-tile onboarding.** `S` · P3 · Deps: DSN-3.1, 4.1 ·
  Owns: `screens/Board.tsx`, `screens/sceneEditor/index.tsx`, `screens/board/BoardPlayerNotice.tsx`. EmptyState with illustration `session-board-empty`, primary
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
state, LOS query. Not in the UI on 2026-09-04: combatant tokens with vitals, ranges/paths, AoE,
condition markers, token↔tracker sync, party marker, hierarchy breadcrumb, travel-time, LOS/lighting
visualization, fog reveal animation, list view for AT users, POI note-creation flow, canvas-2d bake,
room-graph view. _Updated 2026-09-11: MAP-1 through MAP-3 and MAP-4.1–4.3 are merged; only the library
gallery (4.4) and editor onboarding (4.5) remain._

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
- **RC-MAP-4.4 — Map library gallery.** `M` · P3 · Deps: DSN-3.1 · Owns: `screens/atlas`,
  `app/map/thumbnail.ts` (new), `app/map/thumbnail.worker.ts` (new).
  Card grid with 16:9 thumbnails rendered from the vector model (cached data-URI via a worker),
  region label, POI/layer chips, party-here badge, keyboard grid navigation, Space previews in the
  right panel; filtered/empty states with illustration `map-library`. Acceptance: e2e; thumbnails
  generated under 100 ms each in a perf test.
- **RC-MAP-4.5 — Editor onboarding and shortcut discovery.** `S` · P3 · Deps: UX-3.3 · Owns:
  `app/map/MapEditor.tsx`, `app/map/MapEditorChrome.tsx`, `app/map/ToolRail.tsx`, `app/shortcuts/registry.ts`,
  `app/help/ShortcutsDialog.tsx`. First-open coach marks (once per vault) for rail → options → dock; every tool
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
HP, end-session capture, continuity integration. _Updated 2026-09-11: every SES-1..4 story is merged;
SES-2.4 (P3) and the new SES-5.1 remain._

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
- **RC-SES-2.4 — Dice drama.** `S` · P3 · Deps: DSN-1.3 · Owns: `ds/components/domain/DiceResult.jsx`,
  `styles/tokens/spacing.css` (motion tokens), `screens/session/DiceTray.tsx`, `app/session/QuickPanel.tsx`. Nat 20 gold shimmer (`--easing-spring`, static gold border under
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

### Epic SES-5 — Players at the table (P3)

- **RC-SES-5.1 — Player-rolled initiative and readiness from the companion.** `M` · P3 · Deps: 3.4,
  CLD-3.2 · Owns: `screens/play/Home.tsx`, `screens/play/Dice.tsx`, `screens/play/shared.tsx`,
  `apps/gm-react/src/net` (the command-request path and view-models),
  `packages/core/src/commands/combat.ts` (an initiative-from-player request), `screens/session/CombatTracker.tsx`
  (accept / adjust / start). Current state: initiative is entered by the DM in the tracker (`combat.ts`
  "start combat (roll initiative)"); `screens/play/*` has no initiative control outside the co-DM
  `Elevated` view. The DM opens a "roll for initiative" call; each player rolls from `/play`; the DM
  sees the rolls arrive on the tracker rows, accepts or adjusts, and starts; a per-player "ready" chip
  covers the same path outside combat. Acceptance: `collab.spec.ts` case — DM calls, player rolls,
  tracker orders; the request travels the existing command-request path with the DM as authority;
  a player cannot set another player's initiative (test).

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
_Updated 2026-09-11: CHR-1..4 are merged; CHR-2.4 and CHR-5.x (P3) remain._

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
- **RC-CHR-2.4 — Printable sheet.** `S` · P3 · Owns: `styles/print.css` (new), `styles/index.css`,
  `screens/player`, `app/character`.
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
- **RC-CHR-5.3 — Roster library information scent.** `S` · P3 · Owns: `screens/characters`.
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
_Updated 2026-09-11: KNW-1.1–1.3, 2.1, 2.3, 3.1, 3.3, 4.1, 4.2 are merged; the P3 polish stories and
the new KNW-5 epic remain._

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
- **RC-KNW-1.4 — Reading width and typography preference.** `S` · P3 · Owns:
  `screens/settings/Appearance.tsx`, `styles/tokens/typography.css`, `screens/knowledge/NoteViewer.tsx`,
  `apps/gm-react/src/platform/preferences.ts`. Comfortable/Wide/Full for prose only. Acceptance: e2e.

### Epic KNW-2 — Search, saved searches, discovery (P2)

- **RC-KNW-2.1 — Filters and saved searches UI.** `M` · P2 · Owns: `screens/knowledge/
Filters.tsx`, `screens/Graph.tsx` search, core `saved-search.ts` commands. Facets: type, tag,
  visibility, date, linked-to, on-map; save/pin/rename; palette `>search saved`. Acceptance: e2e.
- **RC-KNW-2.2 — Note list information scent.** `S` · P3 · Owns: `screens/knowledge`. Type
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
  `screens/Campaign.tsx`, `screens/campaign`, `ds/components/campaign`. `QuestCard` status/objectives, `NpcCard`
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
- **RC-KNW-4.3 — Graph performance and interaction.** `S` · P3 · Owns: `screens/Graph.tsx`,
  `screens/graph`. Level-of-detail
  labels, focus mode, keyboard node walk, `graph-indexing` budget measured. Acceptance: perf sample.

### Epic KNW-5 — Portability and history (P3)

- **RC-KNW-5.1 — Vault ↔ markdown folder round-trip.** `M` · P3 · Deps: 1.2 · Owns:
  `apps/gm-react/src/platform/fsSource.ts`, `apps/gm-react/src/platform/backup.ts`,
  `screens/settings/Vault.tsx`, `packages/core/src/sync/obsidian-adapter.ts`, `packages/core/src/export`.
  Current state: a markdown folder imports through `platform/fsSource.ts` over the core adapter; there
  is no "export as folder" and no proof that import(export(vault)) is lossless. Add export to a folder
  (a zip on the web build) with front-matter for visibility, tags and dates, wikilinks preserved, assets
  alongside, and a round-trip test over the demo vault. Acceptance: round-trip unit test byte-stable
  for note bodies; e2e exports and re-imports one note with an image; `[[link]]` and `![[embed]]`
  survive; DM-only notes export only when the DM chooses so (test).
- **RC-KNW-5.2 — Note revision history.** `M` · P3 · Deps: 1.2 · Owns:
  `packages/core/src/queries/content-history.ts` (new), `packages/core/src/sync/operation-log.ts`
  (read helpers), `screens/knowledge/NoteViewer.tsx` (History panel), `app/editor/NoteEditor.tsx`
  (restore). Current state: notes carry a `revision` counter and the durable op-log records every
  mutation, but nothing lists a note's past states. A query folds the op-log into per-revision
  snapshots (bounded to the last 50 or 30 days); a History panel shows time, author actor, a line delta
  and "Restore", which dispatches a normal `content.update-item` with `baseRevision`. Acceptance:
  query tests including replay determinism; e2e edits twice, restores the first, and the revision
  counter advances (never rewinds); a player actor never receives DM-only revisions (test).

---

## 12. Workstream AUD — Audio and atmosphere

**Outcome.** A real ambient engine (Web Audio: layered loops, crossfades, per-layer gain, SFX
channel), a bundled CC starter pack, scene packages that bundle card + audio + lighting hint and
auto-activate from POIs, automation on combat/scene/POI events, and assistant tools that suggest
atmosphere in prep.

**Current state (G12).** `<audio>`-element driver with ambience layers, presets, automation rules,
output routing, scene cards + display + second window. No Web Audio graph, SFX, combat trigger,
web sources, waveform metadata, starter pack, `.dndscene` export, MCP tools. _Updated 2026-09-11: every
AUD story is merged except AUD-2.4 (P3)._

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
  `app/SceneDisplayOverlay.tsx`, `styles/scene-display.css`, `apps/gm-react/electron/main.cjs`,
  `apps/gm-react/electron/preload.cjs` (dedicated `BrowserWindow` on a chosen display, kiosk), Ken Burns on hero
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
_Updated 2026-09-11: AI-1..4 are merged (AI-1.1 `e97e718b`, AI-1.3 in `tool-registry.ts`). The smoke
harness still needs a live Ollama, so no assistant path runs in CI — AI-5.1._

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

### Epic AI-5 — Evaluation (P3)

- **RC-AI-5.1 — Deterministic fake provider and assistant eval corpus in CI.** `M` · P3 · Deps: 3.1 ·
  Owns: `apps/gm-react/src/ai/fakeProvider.ts` (new), `apps/gm-react/src/ai/transport.ts`,
  `scripts/ai-agent-smoke.ts`, `tests/unit/ai-eval.test.ts` (new), `docs/development/TESTING.md`.
  Current state: `pnpm ai:smoke` needs a live Ollama, so the assistant never runs in CI. A scripted
  provider replays recorded tool-call transcripts for ten prompts (note append, encounter, quest,
  widget, level-up, atmosphere, continuity, and three that must be refused) and the eval asserts each
  run stages exactly the expected proposals and applies nothing without approval. Acceptance: the
  eval runs inside `pnpm test:app` in under 30 s; the live smoke still passes; a transcript drift
  prints a readable diff.

---

## 14. Workstream CLD — Cloud, collaboration, community

**Outcome.** The paid tiers are worth paying for and the free tier is complete: production is
promoted on the dedicated account, public registration works, billing is real on the web, push
reaches players, TURN is production-grade, cross-device sync merges rather than restores, the
community marketplace discovers and curates, and the wiki is a product.

**Current state (G14).** See `docs/planning/CLOUD_TIER_ROADMAP.md`; dev stage live on
`dev.lamplight.click`; prod account bootstrapped; SES sandbox case open; ADR-027 Proposed.

### Epic CLD-1 — Production launch (P2→P4; mostly operator actions)

- **RC-CLD-1.1 — SES production access + verified invite sender.** `S` · P2 · **Operator action.**
  Acceptance: a public user completes registration on `lamplight.click`.
  **Status 2026-09-09 — one step left, and it is a console action.** Both prod applies are DONE and
  verified live in account `649320110863` / `ca-central-1`: `dndtools-prod-foundation` and
  `dndtools-prod-identity` both last updated 2026-09-04, configuration set `dndtools-prod-email`
  exists with an enabled CloudWatch event destination over SEND/DELIVERY/BOUNCE/COMPLAINT/REJECT/
  RENDERING_FAILURE/DELIVERY_DELAY, `EmailBounceRateAlarm` and `EmailComplaintRateAlarm` are both
  `OK`, the `dndtools-prod-operational-alerts` topic has a CONFIRMED subscription, and account-level
  suppression covers BOUNCE + COMPLAINT. `ProductionAccessEnabled` is still **false** (200/day,
  1/sec), so every non-verified sign-up still strands `UNCONFIRMED`. Remaining: reply to case
  `178562576600649` in the Support console — the Support API needs a paid plan, so this cannot be
  scripted. Draft at `docs/runbooks/ses-production-access.md`.
- **RC-CLD-1.2 — Prod promotion run.** `S` · P4 · Deps: ENG-7.1 · **Operator action** with CI. Run
  `promote-production.yml` from the RC tag; probes green; `cloud-drift` green in both accounts.
  **Done 2026-09-09 on `v0.3.7`** — the first Promote Production run ever to complete its deploy
  job: drift gate, all six stacks in order (identity → TURN → app API → signaling → sync API → web
  hosting), identity callbacks and API CORS refreshed against the deployed origin, prod web app
  published, CloudFront invalidated, post-deploy probes green. Note the dependency on 1.1 was
  dropped: promotion does not need SES out of the sandbox, it only means public sign-up stays
  blocked on the promoted build. Repeat per RC tag.
- **RC-CLD-1.3 — TURN production hardening.** `M` · P2 · Owns: `infra/turn/*`. `turns:` with ACM/
  Let's Encrypt on a DNS name, secret rotation runbook + test, second host or documented failover.
  Acceptance: `validate:live` TURN check over TLS. _Merged (dev); the prod cutover is RC-CLD-1.5._
- **RC-CLD-1.4 — Privacy-respecting product analytics (opt-in).** `M` · P2 · Owns: core
  `diagnostics/*` (event taxonomy, no content), `cloud/telemetry.ts`, Settings consent, infra
  ingestion (scale-to-zero). Acceptance: zero events without consent (test); dashboard in the stage
  overview.
- **RC-CLD-1.5 — Prod cost and alarm hygiene.** `S` · P4 · Deps: 1.3 · **Operator action.** Owns:
  `docs/runbooks/cloud-cost.md` (new). The orphan prod KMS key (`ca9dbc73…`) is still billable; TURN
  over TLS (ADR-039) is deployed to dev but not cut over in prod; the SEARCH dashboard per stage is the
  only billed dashboard. Steps, with the prod profile named in `infra/README.md`:
  `aws kms schedule-key-deletion --key-id <ca9dbc73…> --pending-window-in-days 7`; apply the TURN TLS
  parameters to prod per ADR-039 and run `pnpm validate:live`; confirm the Budgets alert has a
  confirmed subscriber. Acceptance: the runbook records the three actions with dates; the monthly bill
  stays under the ADR-033 ceiling.

### Epic CLD-2 — Paid capabilities (P2, external-gated)

- **RC-CLD-2.1 — Stripe billing (ADR-027 → Accepted).** `L` · P2 · External: Stripe account.
  Owns: `infra/app-api` webhook Lambda, `packages/cloud-fns/src/billing/*`, `screens/Upgrade.tsx`
  (Checkout redirect + portal), `cloud/entitlements.ts` (`simulated: false`). Acceptance: contract
  tests with Stripe fixtures; e2e with a stub.
  **Done 2026-09-10 (`95aa5f3e` on `main`).** ADR-027 Accepted; the dev stage runs real Stripe test
  mode and `pnpm billing:verify` passes 24/24; privacy and terms pages exist under `/legal/*` with
  bracketed placeholders. What remains is the production cutover (RC-CLD-2.6, owner) and the
  placeholder guard (RC-CLD-2.8). Runbook: `docs/runbooks/stripe-billing.md`.
- **RC-CLD-2.2 — Cloud-Enhanced phase 2 security review.** `M` · P2 · Owns:
  `docs/security/vault-privacy-modes-threat-model.md` (checklist items),
  `packages/core/src/security/cloud-security-decision.ts`, `packages/core/src/security`,
  `infra/sync-api/template.yaml` (KMS key per stage), plaintext path gated by server-side mode
  registration. **Re-opened 2026-09-11.** The dispatcher had cancelled this story after two failed runs
  while RC-CLD-2.5 and RC-AI-4.1 shipped fail-closed behind it; the record still ships `approved: false`.
  Work the checklist item by item with evidence written into the threat-model doc; flip the record only
  in the change that closes the last item; the independent review is the sign-off. Acceptance: every
  checklist item carries evidence (file:line or test); the record flips to `approved: true` in that
  change and the gated e2e (RC-CLD-2.5) passes un-gated.
- **RC-CLD-2.3 — FCM push credentials.** `S` · P4 · Deps: 2.7 · **Operator action.** Owns:
  `apps/gm-react/android/app/google-services.json`, stage parameters. Create the Firebase project,
  download `google-services.json`, store the server key in the stage secret RC-CLD-2.7 names, redeploy
  the app API. Acceptance: a device receives a scheduled reminder.
- **RC-CLD-2.4 — Cross-device merge sync.** `L` · P2 · Deps: none (ADR-010 exists) · Owns:
  `cloud/syncEngine.ts`, core `sync/conflict-lifecycle.ts`, Settings › Sync. Ciphertext op-log
  push/pull with the existing three-way conflict UI; explicit "Sync now" + background on launch.
  Acceptance: `sync.spec.ts` two-device merge; SYNC-017 stays open.
- **RC-CLD-2.5 — Keyless browser access (Cloud-Enhanced).** `M` · P2 · Deps: 2.2. Acceptance: gated e2e.
- **RC-CLD-2.6 — Stripe production cutover.** `S` · P4 · Deps: 2.8, ENG-7.1 · **Operator action.**
  Owns: `docs/runbooks/stripe-billing.md`, stage parameters. Decide tax handling (Stripe Tax on or
  off), fill the legal identity object from RC-CLD-2.8, `pnpm billing:bootstrap --stage prod` with the
  live key, `pnpm billing:verify --stage prod`, flip `simulated: false` in the prod parameters.
  Acceptance: verify passes 24/24 against prod; one real purchase completed and refunded.
- **RC-CLD-2.7 — Push notifications behind a capability with a fake transport.** `M` · P3 · Deps:
  3.2 · Owns: `apps/gm-react/src/cloud/push.ts` (new), `apps/gm-react/src/platform/capabilities.ts`,
  `screens/settings/Notifications.tsx` (new), `packages/cloud-fns/src/push` (new),
  `infra/app-api/template.yaml` (a reminder scheduler behind a transport interface),
  `apps/gm-react/android/app/src/main/AndroidManifest.xml` (channel declarations). Everything short
  of the Firebase project: a `PushTransport` interface with a fake for tests and e2e, opt-in per
  device, scheduled-session reminders composed from the calendar, and the settings surface with the
  honest "not delivered on this build" copy until RC-CLD-2.3 supplies credentials. Acceptance:
  contract tests for the scheduler; e2e opts in and sees a queued reminder in the fake; nothing is
  sent without consent (test).
- **RC-CLD-2.8 — Legal placeholders lint and prod-promotion guard.** `S` · P3 · Owns:
  `scripts/check-legal-placeholders.mjs` (new), `package.json`,
  `.github/workflows/promote-production.yml`, `apps/gm-react/src/screens/legal/legalContent.ts`
  (placeholders gathered into one `LEGAL_IDENTITY` object with a per-stage override),
  `docs/runbooks/stripe-billing.md`. Acceptance: the check fails while any `[LEGAL …]` bracket remains
  in a prod build; the promotion workflow runs it before the deploy job; dev builds show the
  placeholders unchanged.

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
- **RC-CLD-4.2 — Discovery (superseded).** `M` · P2 · Owns: none. Imported on 2026-09-08 as an owner
  step because its text said "External: curation policy"; the dispatcher cannot clear that flag, so the
  story is re-filed as RC-CLD-4.5 with the policy decided in-story. Acceptance: none — skipped.
- **RC-CLD-4.5 — Discovery: search, filters, featured, ratings.** `M` · P2 · Deps: 4.1, 4.3 · Owns:
  `infra/app-api/template.yaml` (`GET /listings?q&kind&system&license`, `ratings` and `featured`
  tables), `packages/cloud-fns/src/app-api` (search, filter, featured and rating handlers),
  `screens/community/Discover.tsx`, `screens/community/shared.tsx`, `screens/extensions/Plugins.tsx`.
  Current state: `Discover.tsx` renders the RC-CLD-4.1 listing kinds and installs a module; there is no
  server-side search, filter, featured set or rating. The curation policy is decided here, not
  elsewhere: a review requires an install record; ratings are 1–5 with a 280-character note; the
  featured set is a maintainer-curated table edited through a maintainer-only endpoint; a moderation
  queue endpoint lists flagged reviews for the maintainer. Acceptance: contract tests for every
  endpoint including the maintainer-only guard; e2e searches by kind and system, rates an installed
  module and sees the featured row; the Extensions "Community marketplace — Unavailable" panel is
  removed on stages with the app API.
- **RC-CLD-4.3 — Creator tooling.** `S` · P2 · Owns: Community › Publish: validation checklist
  (broken links, missing assets, license), semver + changelog, yank. Acceptance: e2e.
- **RC-CLD-4.4 — Wiki v2.** `M` · P3 · Owns: `screens/WikiReader.tsx`, `screens/community/Wiki.tsx`,
  `packages/cloud-fns/src/app-api`, `infra/app-api/template.yaml`, `infra/web-hosting`. Theme choice,
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

**Contracts.** `docs/design/README.md` (tokens; sources A → B, A → R, never invert), `ICON_VOCABULARY`.
_Updated 2026-09-11: DSN-1.1 and DSN-2.2 are on `loop/rc`; the rest of this lane is the polish
toolchain every POL story (§20.6) consumes, so it is first in line when the phase gate reaches P3._

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
  section), `styles/index.css`, `docs/design/README.md`, `apps/gm-react/src/screens/prepaint-motion.test.ts`. Named transitions (fade-in, rise, sheet-slide,
  shimmer, pulse) as reusable keyframes; `--easing-spring` reserved for dice/celebration; all collapse
  under `[data-motion='reduced']`. Acceptance: `prepaint-motion.test.ts` extended.
- **RC-DSN-1.4 — Density audit.** `S` · P3 · Owns: `styles/tokens/spacing.css` (density sets),
  `app/screen-kit.tsx`, `apps/gm-react/tests/e2e/responsive.spec.ts`.
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
- **RC-DSN-2.3 — Component documentation site (in-repo).** `M` · P3 · Owns:
  `apps/gm-react/src/screens/DsGallery.tsx` (new; DEV-only route `#/__ds`, stripped from prod by the
  `__rt`-style guard), `apps/gm-react/src/App.tsx` (the guarded route), `scripts/check-prod-bundle.mjs`,
  `docs/design/COMPONENTS.md` (new) generated from the gallery's registry. Every component with every
  variant/state, theme × density switchers. Acceptance: `check-prod-bundle.mjs` asserts absence.
- **RC-DSN-2.4 — Re-sync design source A.** `S` · P3 · Owns: `docs/design-package/**` via the
  DesignSync flow (use the `ux-ui-reviewer` agent; DesignSync is not inherited by general agents).
  Push Lamplight branding, five themes, the new primitives, tile tokens, and the widget-builder /
  system-picker template updates upstream; re-vendor; note the bundle version in `docs/design/README.md`.
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
- **RC-DSN-3.3 — Brand asset kit.** `M` · P3 · Owns: `apps/gm-react/build-resources` (icon.icns/.ico/.png
  sets, DMG background, NSIS sidebar), `apps/gm-react/android/app/src/main/res` (adaptive icon, splash,
  themed icon), `apps/gm-react/public` (favicon set, `manifest.webmanifest` icons, OG share image),
  `apps/gm-react/electron-builder.yml`, `apps/gm-react/index.html` meta. Derived from `assets/logo.svg`; never redesign the mark. Acceptance: release
  packages show the icon on all platforms; Android adaptive icon passes the launcher preview.
- **RC-DSN-3.4 — Loading, skeleton, and progress states.** `S` · P3 · Owns: `ds/components/system`,
  `app/screen-kit.tsx` (the loading region), `apps/gm-react/src/app/screen-kit-loading-region.test.tsx`;
  per-screen adoption belongs to the POL stories. Skeletons for every list/canvas on first load; determinate progress for
  import/backup/sync/generation with ETA copy. Acceptance: `screen-kit-loading-region` tests.

### Epic DSN-4 — Visual regression and design QA (P3-early)

- **RC-DSN-4.1 — Golden-route visual regression suite.** `M` · P3 · Owns: `apps/gm-react/tests/visual`
  (Playwright `toHaveScreenshot`), `apps/gm-react/playwright.config.ts` (a `visual` project with fixed
  fonts/animations/time), `.github/workflows/ci.yml` (path-filtered), `docs/development/TESTING.md`. Routes: the 8
  axe routes + `/board`, `/scene/:id`, `/atlas` editor open, `/play`, `/display`, `/wiki`, the
  DS gallery; × 3 themes (5 after DSN-1.2) × desktop/rail/phone. Baselines committed under LFS or a
  size cap. Acceptance: CI diffs block; a documented update command.
- **RC-DSN-4.2 — Design conformance checklist in the PR template.** `S` · P3 · Owns:
  `.github/pull_request_template.md` (new), `docs/development/DEVELOPMENT.md` §5. The §20.2 list as
  checkboxes; the dispatcher's review profile points reviewers at it. Acceptance: the template exists and
  the definition-of-done section links it.

---

## 16. Workstream UX — UX quality, accessibility, i18n, learnability

**Outcome.** One clear way to do everything, discoverable without docs; copy in the Lamplight
voice in every locale; WCAG 2.2 AA everywhere including the canvases and the map; phones and
tablets are first-class; help is where you need it; a new DM reaches real utility in 30 minutes.

**Current state (G16, G17).** Strong a11y gates and responsive specs; a MutationObserver i18n
bridge; onboarding overlay; static shortcut list; no HelpTip/spotlight/`?` overlay/What's new;
DEBT-2026-001 platform-preferences layer open. _Updated 2026-09-11: UX-1.1–1.4, 2.1, 3.1–3.5, 4.1 are
merged; the P3 stories and the new UX-1.5/3.7 remain._

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
- **RC-UX-1.5 — Pseudo-locale and third-locale scaffold.** `S` · P3 · Deps: 1.4 · Owns:
  `apps/gm-react/src/i18n`, `scripts/i18n-catalog.ts`, `apps/gm-react/tests/e2e/responsive.spec.ts`,
  `scripts/check-prod-bundle.mjs`. A generated `qps-ploc` catalog (accented, 40% longer, bracketed)
  selectable in DEV builds, a `responsive.spec` case that runs the eight routes under it and fails on
  clipping or overflow, and an empty `fr.ts` scaffold that proves a new locale needs no code change.
  Acceptance: the spec passes on both profiles; the pseudo catalog is absent from prod bundles.

### Epic UX-2 — Accessibility completion (P2→P3)

- **RC-UX-2.1 — Extend the axe route list to every durable workspace.** `S` · P2 · Owns:
  `tests/e2e/a11y-axe-gate.spec.ts`: add `/board`, `/scene/:id`, `/graph`, `/audio`, `/extensions`,
  `/community`, `/upgrade`, `/player`, `/play`, `/display`, `/join`, `/wiki`, and the open states of
  the map editor, widget builder, system builder, char builder. Acceptance: register still empty.
- **RC-UX-2.2 — Canvas and map screen-reader contracts.** `M` · P2 · Deps: CAN-3.5, MAP-4.1 · Owns:
  `app/SceneBoardCanvas.tsx`, `app/canvas`, `app/map`, `apps/gm-react/tests/e2e/a11y-axe-gate.spec.ts`,
  `docs/development/ACCESSIBILITY.md`. `role="application"` labels with counts, live regions for every
  operation, list views as the full non-visual path. Acceptance: Playwright accessibility-tree snapshot
  tests for the board, the scene editor and the map editor (both profiles) assert roles, names and
  counts; the manual NVDA/VoiceOver/TalkBack checklist in `ACCESSIBILITY.md` §4 is rewritten as a
  script the owner can run in an hour, and its results are recorded when run (not blocking).
- **RC-UX-2.3 — Focus and dialog audit.** `S` · P3 · Owns: `ds/components/overlay`, `eslint.config.js`,
  `scripts/eslint-rules`; per-screen fixes belong to the POL stories.
  Every overlay: trap, restore, Escape, Android Back, `aria-labelledby`; every menu: the menu
  pattern; no positive tabindex anywhere (lint). Acceptance: lint + e2e.
- **RC-UX-2.4 — Text scaling and zoom.** `S` · P3 · Owns: `apps/gm-react/src/styles`,
  `apps/gm-react/tests/e2e/responsive.spec.ts`. 200% zoom and OS large-text on
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
- **RC-UX-3.7 — The demo vault as a showcase.** `M` · P3 · Deps: 3.6 · Owns:
  `apps/gm-react/src/runtime/demo-seed.ts`, `apps/gm-react/tests/e2e/fixtures`. Current state: the demo
  seed exists for tests and the prototype port; it does not exercise every lane. Every surface gets
  real content: a system-package switch example, three widgets including one custom, a scene with a
  map tile and a running encounter with tokens, a scene package with audio, quests and factions with
  typed relationships, a calendar with dated notes, saved searches, a level-2 character with resources,
  and one staged assistant proposal to review. Acceptance: the seed still commits as a single batch
  (boot cost unchanged; `scene-first-render` inside budget); the onboarding "campaign starter" card
  uses it; every e2e that relied on the old seed still passes.

### Epic UX-4 — Platform preferences layer and mobile ergonomics (P2)

- **RC-UX-4.1 — Device-preferences slice and platform layer (DEBT-2026-001).** `M` · P2 · Owns:
  `platform/preferences.ts` (typed, one place for localStorage/matchMedia/navigator reads),
  refactor the allow-listed sites, shrink `platform-access-exceptions.json`. Acceptance: exceptions
  file ≤ 5 entries; DEBT resolved.
- **RC-UX-4.2 — Mobile primary-action audit.** `S` · P3 · Owns: `app/shell/TopBar.tsx`,
  `app/shell/MoreSheet.tsx`, `app/nav.ts`, `apps/gm-react/tests/e2e/responsive.spec.ts`,
  `docs/architecture/NAVIGATION.md`; per-screen changes belong to the POL stories. One primary top-bar
  action per compact screen, overflow sheets, keyboard-safe confirmations (UX-002 contract).
  Acceptance: `responsive.spec` extended per screen.
- **RC-UX-4.3 — Tablet (rail) layouts.** `M` · P3 · Owns: `screens/characters`, `screens/knowledge`,
  `screens/campaign`, `screens/Campaign.tsx`, `screens/atlas`, `app/useViewport.ts`, `app/screen-kit.tsx`,
  `apps/gm-react/tests/e2e/responsive.spec.ts`. Two-pane list/detail on rail for
  Characters, Knowledge, Campaign, Atlas; right detail panel contract. Acceptance: `responsive.spec`
  at 1024×768 and 820×1180.
- **RC-UX-4.4 — Copy pass v2 in the Lamplight voice.** `M` · P3 · Deps: 1.2 · Owns:
  `apps/gm-react/src/i18n/messages/en.ts`, `apps/gm-react/src/i18n/messages/es.ts`.
  Re-read every string against the content fundamentals; rejection messages carry the next action;
  no engine jargon; per-package vocabulary placeholders. Use the `natural-writer` agent for long-
  form help text only. Acceptance: reviewer sign-off; ES updated.

---

## 17. Workstream PLT — Platform shells and reach

**Outcome.** Signed, auto-updating desktop builds; a PWA that installs from `lamplight.click`;
Android on Play (internal track) with widgets/share-target; iOS scoped and either built or
explicitly deferred with a recorded decision; every shell honours the same capability contract.

**Current state (G21).** Unsigned desktop alpha; alpha-key Android; no service worker; no
auto-update; Electron menu hidden. _Updated 2026-09-11: auto-update (1.2), PWA (2.1), Android share
target/shortcuts/channels (2.2) and the iOS decision (3.1, rejected for RC1 by ADR-038) are merged._

- **RC-PLT-1.1 — Desktop code signing + notarization.** `S` · P4 · External: certificates. Owns:
  `release.yml` production channel, `electron-builder.yml`, `RELEASING.md`. Acceptance: signed
  packages verified in the release job.
- **RC-PLT-1.2 — Auto-update (electron-updater, GitHub Releases provider).** `M` · P2 · Owns:
  `electron/main.cjs`, `preload.cjs` (explicit channel), Settings › About (check/apply, release
  notes), signature verification. Acceptance: desktop smoke with a staged feed.
- **RC-PLT-1.3 — Electron parity audit.** `S` · P3 · Owns: `apps/gm-react/electron`,
  `app/shortcuts/registry.ts`, `docs/architecture/PLATFORMS.md`. Application menu with
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
- **RC-PLT-2.4 — Offline-first assurance.** `S` · P3 · Deps: 2.1 · Owns:
  `apps/gm-react/tests/e2e/pwa-offline.spec.ts`, `apps/gm-react/src/platform/serviceWorker.ts`,
  `docs/architecture/PLATFORMS.md`. Extend the offline spec from "the shell reloads" to one task per
  durable surface (a note, a character, a map, a scene and an audio preset created offline, then a
  reload, then present), plus an honest network indicator on every cloud-only action. Acceptance: the
  spec passes on both profiles; every cloud-only control shows the offline state.
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
- **RC-ENG-1.3 — Perf measurement that survives a shared runner.** `M` · P2 · Deps: 1.1 · Owns:
  `.github/workflows/perf.yml`, `scripts/perf/{capture,compare}.ts`, `tests/perf` (`baseline.ci.json` and
  the reports). The pipeline grades CI runs against a baseline recorded on a 16-core Ryzen desktop, so every run
  prints `11 without a baseline` and drift is never compared — only the absolute target is. On
  2026-09-09 two runs of the SAME `main` commit twenty minutes apart returned `scene-first-render`
  **1125.3ms PASS** (run 34383000996) and **1621.2ms BREACH** (run 34384893583) against a 1500ms
  target: a 44% swing on unchanged code at `n=3`. A budget that flips verdict without a code change
  teaches everyone to ignore the gate. Work: record and commit a CI-hardware baseline
  (`pnpm perf:baseline` on the runner, or a scheduled job that refreshes it), raise the sample count
  and reject outliers (median of ≥ 7, or repeat-until-the-median-stabilizes), and either pin the job
  to a larger runner or grade CI against the CI baseline rather than the desktop one. Acceptance:
  five consecutive runs on one unchanged commit agree on every budget's verdict, and the drift
  column is populated on CI instead of `not compared (other hardware)`.
  **Acceptance amended 2026-09-11.** Hosted-CI evidence for a candidate SHA cannot exist before
  integration (`perf.yml` runs on `main` pushes, pull requests and the schedule), so the pre-merge bar
  is: the unit tests, a workstation stability report produced by the new interleaved median-of-7
  procedure on the candidate SHA, and a `workflow_dispatch` input on `perf.yml` that captures on any
  ref. The five-run agreement is verified after integration by RC-ENG-1.4's scheduled runs. Candidate
  `c5102e4d` (independent review: no defects) is the starting point; rebase it, do not restart.
- **RC-ENG-1.4 — CI performance policy: advisory on pull requests, enforcing on a recorded CI
  baseline.** `S` · P2 · Deps: 1.3 · Owns: `.github/workflows/perf.yml`, `scripts/perf/compare.ts`,
  `tests/perf/baseline.ci.json`, `docs/development/PERFORMANCE.md`. The decision, recorded here:
  until a baseline exists for the runner class, `perf.yml` on pull requests and `loop/rc` pushes
  reports (job summary + artifact) and does not fail; a scheduled run on `main` (nightly;
  `workflow_dispatch` for the first capture) records `baseline.ci.json` with the RC-ENG-1.3
  procedure and lands it through the delivery PR; once present, drift over tolerance fails only the
  scheduled run, and a pull request fails only on an absolute-target breach confirmed by two
  interleaved repeats. Acceptance: the workflow encodes both modes; PERFORMANCE.md says which
  verdict is binding; five scheduled runs on one commit agree.
- **RC-ENG-2.1 — Tiered branch model + smoke gate.** `S` · P1 · Owns: `GIT_WORKFLOW.md`, `ci.yml`
  (initiative branches get smoke; `main` gets full), `test:smoke` expanded to the critical unit
  subset under 60 s. Acceptance: two green runs each tier.
- **RC-ENG-2.2 — Test suite performance.** `M` · P2 · Owns: vitest configs (sharding, isolate
  strategy), Playwright shards (already 3?), fixture reuse. Target: core suite < 90 s, e2e < 12 min
  per profile. Acceptance: CI timing table in `TESTING.md`.
- **RC-ENG-2.3 — A merge gate the autonomous loop cannot pass blind.** `M` · P2 · Owns:
  `tools/loop/rcloop.py` (`gates.e2e_named_specs`), `.github/workflows/ci.yml`, `GIT_WORKFLOW.md`.
  Each loop story runs only the specs it names, so anything a story breaks in ANOTHER story's spec
  integrates green and is found later on the merged tree. Both promotions hit this; the 09-09 batch
  shipped four real regressions into `loop/rc` — a selected POI's popover wrapper spanned the whole
  canvas with `pointerEvents:'auto'` (nothing on the map was draggable), quick map re-asserted
  `setMobileDock(true)` on every render with a selection so the sheet sprang back and its scrim ate
  the next canvas press, the import wizard offered SVG but `createImageBitmap` cannot decode one so
  the calibration step's Next could never enable, and a board-scale-compensated 88px chip landed in
  a compact tile whose whole body is ~43px. Work: run the full suite on `loop/rc` on a cadence (or
  before every promotion) rather than only at the promotion gate, and widen a story's named set to
  the specs that touch the same route/surface. Acceptance: an injected cross-spec regression is
  caught on `loop/rc` without a human running the suite by hand. **Done 2026-09-10 by the dispatcher
  migration:** every candidate's Browser acceptance gate runs the full `pnpm e2e` on both profiles,
  and CI runs the full tier on every `loop/rc` push (`ci.yml:151`); the retired `tools/loop` parts of
  commit `1111f0fb` are archived under `refs/archive/loop-rc-backup`.
- **RC-ENG-2.4 — One composite action for browser/e2e setup.** `S` · P2 · Owns:
  `.github/actions/setup-e2e/action.yml`, the six workflows that install Playwright (`ci.yml` ×2,
  `perf.yml`, `release.yml`, `promote-production.yml`, `validate.yml`). The install line is copied
  six times, so on 2026-09-09 a single upstream apt fault took out every Playwright job at once —
  three CI e2e shards, a11y, the release gates and the promotion preflight — and the fix had to be
  applied six times, wrongly the first time. `playwright install --with-deps` runs `apt-get update`,
  which fails the whole command if ANY configured source is inconsistent; the current mitigation
  strips the Chrome source by content (ubuntu-24.04 writes deb822 `.sources`, so matching by
  filename silently matches nothing). Acceptance: one action, six callers, and a deliberate broken
  source proves the guard.
- **RC-ENG-2.5 — Make the Android build provable before CI.** `S` · P2 · Owns:
  `scripts/check-android.mjs` (new), `package.json` (`check:android`), `docs/development/
DEVELOPMENT.md`. This box has no usable JDK 21 (`/usr/lib/jvm/java-21-openjdk` is an empty
  directory), so the Android job is the first thing that ever compiles the app — twice in one week
  that meant a red tag. `android/app/src/main/res/values/colors.xml` carried `--color-bg` inside an
  XML comment (`--` is illegal in XML), broken since the 07-31 rebrand `729be436`, so NO Android
  build had succeeded for six weeks; and a `catch (IOException | SecurityException |
  RuntimeException)` multi-catch is a compile error because javac rejects alternatives related by
  subclassing. Work: a cheap static preflight in `pnpm check` (parse every `android/**/*.xml`,
  assert `build.gradle`'s `^\d+\.\d+\.\d+$` version contract against the root `package.json`),
  plus a documented JDK 21 install so a real `assembleDebug` is possible locally. Acceptance: both
  historical failures are caught by `pnpm check:android` on the commit that introduced them.
- **RC-ENG-2.6 — Mobile-chromium navigation flake root cause.** `S` · P2 · Owns:
  `apps/gm-react/tests/e2e/_helpers.ts`, `apps/gm-react/playwright.config.ts`,
  `apps/gm-react/tests/e2e/combat-audio-automation.spec.ts`, `apps/gm-react/tests/e2e/systems.spec.ts`,
  `docs/development/TESTING.md`. `page.evaluate: Execution context was destroyed` recurs on
  mobile-chromium in those two specs under load; the gate now retries twice, which hides it rather
  than fixing it. Reproduce on an idle machine with 4× CPU throttle, find the navigation that races the
  evaluate (a `goto` during a hash-route transition, or a reload the app itself triggers), and fix the
  app or the helper — not the retry count. Acceptance: 20 consecutive mobile runs of both specs at
  `retries: 0` pass; the cause is written up in TESTING.md.
- **RC-ENG-3.1 — Promote budgets from provisional to measured.** `S` · P4 · Deps: 1.1 · Owns:
  `budget-registry.ts`. Acceptance: no `provisional` entries; `PERFORMANCE.md` rewritten.
- **RC-ENG-3.2 — Runtime performance recovery.** `M` · P3 · Deps: 1.1, 1.3 · Owns:
  `apps/gm-react/src/runtime/SceneRuntime.ts`, `apps/gm-react/src/screens/Board.tsx`,
  `apps/gm-react/src/app/SceneBoardCanvas.tsx`, `apps/gm-react/src/app/widgets`,
  `packages/core/src/queries`, `packages/core/src/platform/service-boundary.ts`, `scripts/perf`,
  `tests/perf` — the hot paths that breach (expected: scene first render with many tiles, map with
  world output, graph with 2k notes, search index). **Starting points
  (2026-09-11):** two archived `ci-recovery` candidates (`refs/archive/dispatch/de0f38135565e959dcd4`
  = `b3a20d80`, `refs/archive/dispatch/4a335b1e9cc7fa665f25` = `3e53662e`) batch `SceneRuntime`
  listener notifications and measured 1342 ms against 1565 ms for `scene-first-render` under 2×
  throttle; neither integrated because the noisy `widget-update` drift check rejected them. Re-land the
  batching under RC-ENG-1.3's measurement. Acceptance: all budgets green.
  **Known signal (2026-09-09).** `scene-first-render` is the only budget at the line: 1068.3ms on the
  desktop baseline, 1125–1621ms on CI, target 1500ms. Treat 1.3 as the prerequisite — until the
  measurement is stable there is no way to tell a real regression from runner noise, and the honest
  fix is a ~20% render win on 50 widgets / 10 active bindings, never a loosened budget.
  `widget-update` also drifted 16.8ms → 27ms (+60.7%) across the 09-09 batch; it is still well inside
  its 100ms target, but it moved in the same area and is worth a look in the same pass.
- **RC-ENG-3.3 — Large-vault performance fixture.** `M` · P3 · Deps: 1.3 · Owns:
  `apps/gm-react/src/runtime/demo-seed.ts` (a `large` profile), `scripts/perf/capture.ts`,
  `tests/perf`, `packages/core/src/testing`, `packages/core/src/perf/budget-registry.ts`. A
  deterministic 5,000-note / 200-map / 60-tile / 40-character vault generator; capture runs the eleven
  budgets against it as a second row; `search`, `graph-indexing`, `vault-open` and
  `scene-first-render` get large-vault targets in the registry. Acceptance: the fixture builds in
  under 10 s; both rows recorded on the CI baseline.
- **RC-ENG-4.1 — `any` elimination in app seams.** `M` · P2 · Owns: `runtime/*`, `net/*`,
  `screens/settings/*`, `Upgrade.tsx`. Acceptance: ≤ 20 warnings (DEBT-2026-002 resolved).
- **RC-ENG-4.2 — Core coverage floors raised for new domains.** `S` · P2 · Owns: `vitest`
  coverage config, `ci.yml`. Systems, widgets runtime, combat tokens at ≥ 90% branch.
- **RC-ENG-4.3 — Dependency hygiene.** `S` · P0 · Owns: dependabot PRs, `docs/development/DEVELOPMENT.md`
  §7 (the dependency policy), `supply-chain.yml`. TypeScript 6 / Vite 8 upgrades validated. Acceptance:
  audit clean.
- **RC-ENG-4.4 — Dependency wave (the 2026-09 dependabot set).** `M` · P2 · Owns: `package.json`,
  `pnpm-lock.yaml`, `apps/gm-react/package.json`, `packages/core/package.json`,
  `packages/cloud-fns/package.json`, `.github/workflows`, `apps/gm-react/vite.config.ts`,
  `apps/gm-react/android/gradle/wrapper/gradle-wrapper.properties`, `docs/development/DEVELOPMENT.md`.
  Apply, in separate commits with the full gate between them: vite 7.3.6 → 8.2.2 together with
  `@vitejs/plugin-react` 4.7 → 6.1; electron 43.1 → 44.1; react-dom + `@types/react-dom`; `@types/node`
  22 → 26 (typecheck fallout); the GitHub Actions group; the gradle wrapper 8.14.3 → 9.7.1 (Android job
  green). A bump that breaks a gate is reverted with the reason in the journal, never forced.
  Acceptance: every gate green on the merged set; `pnpm audit` clean; PRs #56, #57 and #59–#63 closed
  as superseded (`gh pr close <n> --comment` naming the integrating commit).
- **RC-ENG-5.1 — Security review v2 (whole app).** `M` · P4 · Owns: `docs/security/
app-security-review-<date>.md`, fixes. Scope: sandbox host (WID-1.3), host API, package review,
  system packages as data, private player store, PWA cache, auto-update signature, Stripe webhook,
  Cloud-Enhanced path. Run `/security-review` on each of those PRs first. Deps: `POL-1.*`, CLD-2.2 ·
  Acceptance: no open high; `docs/security/README.md` updated.
- **RC-ENG-5.3 — API edge hardening.** `M` · P3 · Owns: `infra/app-api/template.yaml`,
  `infra/foundation/template.yaml` (a WAF web ACL with a rate-based rule),
  `packages/cloud-fns/src/app-api` (per-user quotas on write endpoints), `docs/security/README.md`.
  Current state: `sync-api` and `signaling` carry stage throttles (burst 20 / rate 10) with throttle
  alarms; `app-api` has none, and no web ACL fronts any stage. Acceptance: throttles and alarms on the
  app API match the other stacks; a per-IP rate rule fronts the app API and the web hosting
  distribution; a contract test proves a 429 on the 21st listing write in a minute; an
  `infra-ops-reviewer` pass is recorded in the journal.
- **RC-ENG-5.2 — Regression gates for new security invariants.** `S` · P2 · Owns:
  `security/regression-gates.ts`. Add: custom widget cannot reach `window.parent` state; private
  store never in a view-model; system package cannot carry functions; sandbox CSP exact.
- **RC-ENG-6.1 — Observability in the app.** `S` · P2 · Owns: `diagnostics/*`, Settings › About ›
  Diagnostics (perf marks, error taxonomy counts, storage usage, last sync), export bundle with
  privacy redaction. Acceptance: tests for redaction.
- **RC-ENG-6.2 — Data integrity: storage pressure, corrupt-document recovery, migration rollback.**
  `M` · P3 · Deps: 6.1 · Owns: `apps/gm-react/src/platform/storage`,
  `apps/gm-react/src/diagnostics/storageUsage.ts`, `packages/core/src/migration`,
  `screens/settings/Vault.tsx`, `docs/architecture/DATA_MODEL.md`. Current state:
  `diagnostics/storageUsage.ts` reads `navigator.storage.estimate`, but nothing warns the DM before
  the quota is hit, a document that fails to parse on open is fatal, and migrations have no rollback
  proof. Add a storage-pressure banner at 80% with "free space" guidance and asset-store pruning;
  open-time quarantine of an unparseable document (the rest of the vault loads and the document is
  exported for recovery); and a migration dry-run + rollback test that restores the pre-migration
  snapshot when a migrator throws. Acceptance: tests for all three; e2e with a corrupted fixture opens
  the vault and lists the quarantined item.
- **RC-ENG-7.1 — RC checklist and beta program.** `M` · P4 · Owns: `docs/development/
RC_CHECKLIST.md` (the §2 gates as a runnable list with commands), `release.yml` `rc` channel,
  beta feedback route (GitHub Discussions template + in-app "Send feedback" via the help menu).
  Deps: `POL-1.*` · Acceptance: the checklist run once end-to-end on the RC tag with results attached to
  the release.
- **RC-ENG-7.2 — RC-1 release rehearsal.** `S` · P4 · Deps: 7.1, 7.3, DOC-1.4 · **Operator action**
  (the tag push). Owns: `docs/development/RELEASING.md`, `CHANGELOG.md`. Run the RC checklist on the
  candidate commit; `git tag v0.4.0 && git push origin v0.4.0` (plain semver — Android rejects `-rc`);
  watch `release.yml` produce the six packages with SBOM and attestations; run
  `promote-production.yml` from the tag; probes green. Acceptance: the draft release carries the
  checklist output; prod serves the tag.
- **RC-ENG-7.3 — RC-1 exit audit.** `M` · P4 · Deps: `POL-1.*`, ENG-5.1, DOC-1.1 · Owns:
  `docs/requirements/FEATURE-GAPS.md`, `docs/development/RC_CHECKLIST.md`. The `requirements-auditor`
  and `ux-ui-reviewer` passes over the whole app on one commit: every §2 gate, every inventory row,
  every §20 waiver re-read. Findings become stories; this audit is the gate for RC-ENG-7.2.
  Acceptance: zero unverifiable claims; every open limit is one of the §2.1 external four.

---

## 19. Workstream DOC — Documentation realignment

- **RC-DOC-1.1 — Requirements corpus audit.** `M` · P4 · Deps: `POL-1.*` · Owns:
  `docs/requirements/FEATURE-GAPS.md`, `scripts/validate/feature-audit.ts`. (The initiative corpus was
  deleted in the 2026-09-11 consolidation; the surface inventory is the requirements corpus now.)
  Every row's "what it does" and "honest limits" re-verified against the code with a file:line or a
  spec per claim by the `requirements-auditor` agent; limits closed by merged stories deleted; the
  audit script asserts every remaining limit's anchor. Acceptance: zero unverifiable claims;
  `pnpm feature-audit` green.
- **RC-DOC-1.2 — Architecture docs for the new subsystems.** `M` · P2 (rolling, per subsystem
  PR) · Owns: `docs/architecture/{SYSTEM_PACKAGES,WIDGET_RUNTIME,SCENE_HISTORY,COMBAT_ON_MAP}.md`,
  `DATA_MODEL.md` (new slices), `WIDGET_FEATURE_BRIEF.md` updated to React paths. Acceptance:
  every behavior claim maps to a file (docs quality rule 1).
- **RC-DOC-1.3 — User-facing docs.** `M` · P3 · Owns: `docs/user` (new: Getting started, Running
  a session, Maps, Widgets & builders, Systems, Remote play, Privacy modes, Android/desktop
  install), `apps/gm-react/src/app/help/HelpMenu.tsx` (links), `docs/README.md`. Write in the
  Lamplight voice (the `natural-writer` agent where available). Acceptance: every page reachable from
  the Help menu; the docs link checker (RC-DOC-2.2) passes; reviewed.
- **RC-DOC-1.4 — Release notes and marketing surface.** `S` · P4 · Owns: `CHANGELOG.md` RC entry,
  `README.md` (Lamplight, screenshots from the visual suite), `lamplight.click` landing page
  (`infra/web-hosting` static). Acceptance: natural-writer pass; screenshots current.
- **RC-DOC-2.1 — Roadmap upkeep.** `S` · rolling · Owns: `docs/planning/RC_ROADMAP.md`, `tools/roadmap`.
  The status column of §23 is rendered from the dispatcher store by `tools/roadmap/sync-status.py`;
  `tools/roadmap/sync-tasks.py` pushes a story's ownership, acceptance and dependency lines from this
  file into the store for every unfinished task. Run both before each promotion; a story re-scoped to an owner
  step is annotated, never deleted. Acceptance: both scripts exist and GIT_WORKFLOW.md documents them.
  **Done 2026-09-11** (the scripts); the rolling duty stays with whoever promotes.
- **RC-DOC-2.2 — Docs link and coupling checker in the gates.** `S` · P2 · Owns:
  `scripts/validate/docs-links.ts` (new), `scripts/quality-gates.ts`, `docs/README.md`,
  `docs/development/TESTING.md`. Every relative `](…md)` link resolves; every `docs/**` file is
  reachable from `docs/README.md`; the strings tooling depends on stay present (`test:critical`,
  `test:cloud`, `test:app`, `test:tooling` in TESTING.md; `i18n-catalog.ts export` and `import` in
  LOCALIZATION.md; every ADR's Status line equals its index cell). Acceptance: `pnpm gates` fails on
  a broken-link fixture and passes on the tree.

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
- [ ] Matches the prototype view for this section (`docs/design/README.md` §4) and the design-package template where one exists; deviations listed with rationale.
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

### 20.6 The polish stories (lane POL)

The second pass was a rule with no stories, so nothing ran it. Each surface below is one story that a
worker can claim; the DSN toolchain (five themes, motion, illustrations, skeletons, the visual suite)
is a dependency of every one, and each also depends on the last feature stories that touch its files.
Sizes are `M` unless the surface is large. Every POL story owns its surface directory outright; feature
stories that still target the same files land first by the `Deps:` line.

- **RC-POL-1.1 — Polish: Command Center.** `M` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, UX-3.7 · Owns: `screens/CommandCenter.tsx`, `screens/SceneCardsPanel.tsx`, `screens/SceneQueuePanel.tsx`, `screens/ScenesCreator.tsx`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.2 — Polish: GM Screen board.** `L` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, CAN-2.5, CAN-3.6, CAN-4.6, CAN-5.2, CAN-6.3 · Owns: `screens/Board.tsx`, `screens/board`, `screens/BoardLayoutsPanel.tsx`, `app/SceneBoardCanvas.tsx`, `app/canvas`, `app/board-helpers.ts`, `app/SceneBoardModel.ts`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.3 — Polish: Scene editor.** `M` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, CAN-4.2, CAN-4.4, CAN-4.6, CAN-6.1, WID-2.6, WID-4.3 · Owns: `screens/sceneEditor`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.4 — Polish: Session.** `L` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, SES-2.4, SES-5.1 · Owns: `screens/session`, `app/session`, `app/combat`, `app/EncounterBuilder.tsx`, `app/EncounterDraft.ts`, `app/EncounterDraftRoster.tsx`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.5 — Polish: Characters roster.** `M` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, CHR-5.3 · Owns: `screens/characters`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.6 — Polish: Character builder.** `M` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, CHR-5.2 · Owns: `app/charBuilder`, `app/charImport`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.7 — Polish: Player sheet (DM side).** `M` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, CHR-2.4, CHR-5.1 · Owns: `screens/player`, `app/character`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.8 — Polish: Player companion (`/play`).** `M` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, SES-5.1, PLT-2.4 · Owns: `screens/play`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.9 — Polish: Atlas and map editor.** `L` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, MAP-4.4, MAP-4.5, UX-2.2 · Owns: `screens/atlas`, `app/map`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.10 — Polish: Story (Campaign).** `M` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, KNW-3.2 · Owns: `screens/Campaign.tsx`, `screens/campaign`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.11 — Polish: Notes (Knowledge).** `M` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, KNW-1.4, KNW-2.2, KNW-5.1, KNW-5.2 · Owns: `screens/knowledge`, `app/editor`, `app/markdown`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.12 — Polish: Graph and search.** `M` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, KNW-4.3 · Owns: `screens/Graph.tsx`, `screens/graph`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.13 — Polish: Audio.** `M` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, AUD-2.4 · Owns: `screens/audio`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.14 — Polish: Extensions (plugins, widget builder, systems, types, compendium).** `L` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, WID-2.4, WID-4.4, SYS-3.6 · Owns: `screens/extensions`, `app/widgetBuilder`, `app/systemBuilder`, `app/compendium`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.15 — Polish: Community.** `M` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, CLD-4.5, CLD-4.4 · Owns: `screens/community`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.16 — Polish: Plans, cloud and legal.** `M` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, CLD-2.8 · Owns: `screens/Upgrade.tsx`, `screens/upgrade`, `screens/legal`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.17 — Polish: Settings (every category).** `L` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, KNW-1.4, UX-1.5, CLD-2.7 · Owns: `screens/settings`, `app/ConnectedSources.tsx`, `app/connectedSourcesVocab.ts`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.18 — Polish: Onboarding.** `M` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, UX-3.6, UX-3.7 · Owns: `app/Onboarding.tsx`, `app/onboarding`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.19 — Polish: Join and invite redeem.** `S` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1 · Owns: `screens/Join.tsx`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.20 — Polish: Scene display and second screen.** `S` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, AUD-2.4 · Owns: `screens/SceneDisplay.tsx`, `app/SceneDisplayOverlay.tsx`, `styles/scene-display.css`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.21 — Polish: Wiki reader.** `S` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, CLD-4.4 · Owns: `screens/WikiReader.tsx`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.22 — Polish: Command palette, shortcuts and help.** `M` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, CAN-4.3 · Owns: `app/CommandPalette.tsx`, `app/shortcuts`, `app/help`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.
- **RC-POL-1.23 — Polish: App shell (sidebar, rail, tabs, top bar, footer).** `M` · P3 · Deps: DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, UX-4.2, UX-4.3, CAN-5.2 · Owns: `app/AppShell.tsx`, `app/shell`, `app/nav.ts`, `app/useViewport.ts`. One
  change that walks §20.2–§20.5 for this surface: every item checked in the run journal or waived with a
  reason a reviewer would accept; visual snapshots (RC-DSN-4.1) updated for every theme and tier; empty,
  loading and error states illustrated where the key exists; copy re-read in the voice with ES updated;
  the FEATURE-GAPS row edited; every file in the surface under 500 lines. Acceptance: the journal embeds
  the checklist; axe clean for the route and its overlays on both profiles; the surface's e2e specs
  green; `pnpm gates` reports no file-size warning for the owned files.

---

## 21. Distribution rules for parallel agents

The rules below are what the dispatcher enforces, plus what it cannot see. Read them before editing a
story; most stalls of the last week were roadmap data, not code.

### 21.1 Claiming and branches

1. **The dispatcher claims by story id** from `origin/loop/rc`. A story added or edited on `main`
   reaches it only after `main` is pushed to `loop/rc` (fast-forward when the loop is quiet, merge
   otherwise) and `dispatch.py migrate dndtools --apply` runs. Migration creates new ids and never
   rewrites an existing task; run `tools/roadmap/sync-tasks.py --apply` after editing an existing
   story's `Owns:`, `Acceptance:` or `Deps:`.
2. **One worktree per story** (`dispatch/dndtools/<hash>`, `.state/worktrees/dndtools/<hash>` in the
   dispatcher). Candidates rebase onto `loop/rc` before gating; a rebase conflict parks the task with a
   `git rebase:` blocker and a retry re-enters the same worktree, so the operator brief in the task's
   description must say which upstream commit conflicts and what must survive.
3. **`loop/rc` → `main` is a delivery PR** opened by the dispatcher once a promotion window opens and
   the required `CI` workflow is green; `main` deploys the dev stage. Nobody pushes `main` directly for
   feature work; docs and plan edits are the exception and merge back to `loop/rc` at once.

### 21.2 Ownership is a write fence

1. **`Owns:` is checked against the candidate diff.** Any changed path outside the story's resolved
   `Owns:` blocks the candidate with `candidate changes paths outside its claim`. So `Owns:` must list
   every path the work touches — the moved `WidgetFrame`, the inspector that now lives under
   `screens/sceneEditor/`, the core command file, the doc that records the contract.
2. **Companion paths are granted, not claimed** (dispatcher manifest `companion_paths`): the message
   catalogs, `*.test.ts(x)`, `__snapshots__`, `tests/e2e/*.spec.ts`, `package.json` and the lockfile,
   the append-only barrels (`packages/core/src/index.ts`, `commands/dispatch.ts`, `commands/types.ts`,
   `schemas/commands.ts`, `app/nav.ts`, `App.tsx`), `docs/architecture/*.md`, `docs/reference/*.md`,
   `FEATURE-GAPS.md`, `DEBT.md`, `CHANGELOG.md`, the raw-style allow-list, and `.dispatcher/*`. Two
   stories may edit them at once; the loser resolves the rebase on retry.
3. **Paths are resolved against the tree.** A token that matches nothing is dropped; a story that names
   nothing resolvable takes a whole-repository claim (`*`) and serializes the fleet. Name a new file
   under a directory that exists, or the directory itself if the story creates it.
4. **Never widen scope.** A story that discovers a needed core change files it as a new `S` story
   (append to the lane, then §23), lands it first, then rebases. Never edit `tools/loop` (retired) or
   another story's worktree.
5. **Ownership overlap serializes.** Two ready stories whose `Owns:` intersect never run together;
   lane concurrency is capped by the manifest (`max_per_lane`). Keep `Owns:` tight where two stories
   share a directory: claim `screens/settings/Appearance.tsx`, not `screens/settings`.

### 21.3 Phases, gates, review

1. **Phase gate.** With `phase_gated` on, P(n+1) admits only when every P(n) story that is not an owner
   step is succeeded or cancelled; a later-phase prerequisite of a frontier story is exempt. Owner steps
   (§24) are `proposed` in the store and never hold the gate. If the gate leaves workers idle for days
   while one lane's chain runs in series, the operator's lever is `phase_gated: false` with
   phase-derived priorities (`sync-tasks.py` sets P2 60 · P3 50 · P4 40) — the plan is written so that
   order still holds through `Deps:`.
2. **Gates before review.** Every candidate runs the manifest gate list; `pnpm gates` (file size,
   Prettier baseline) runs first and fails on inherited violations too, so keep `loop/rc` green.
   Attach nothing by hand: the run journal (`state/<ID>.journal.md`) is the evidence.
3. **Review is independent and structured.** A rejection sets `stage: implement` and parks the task
   (`blocked`); nothing re-queues it — an operator `task.retry` does (check `stage` first). A review
   that produced no verdict retries with a fresh session. A reviewer may not withhold approval for
   evidence a candidate cannot produce pre-merge (hosted CI on the candidate SHA, see RC-ENG-1.3).
4. **Retry semantics.** `task.retry` resets the attempt budget; a retry of an approved-but-conflicted
   candidate goes back to implementation. Every review rejection is an operator check-in.

### 21.4 Evidence and reviews

1. **Evidence over narrative.** The journal cites file:line and test names for each acceptance
   criterion. "Works locally" is not evidence.
2. **Docs in the same change.** Contract changes update the named doc; new subsystems get their
   architecture page in the first change that ships behaviour.
3. **Design review.** Any change touching `src/ds`, tokens, or a §20.1 surface asks the `ux-ui-reviewer`
   agent pass and links the visual snapshots.
4. **Security review.** Any change touching sandbox, host API, package review, private store, sync,
   billing, or cloud paths runs `/security-review` and links the report.
5. **Infra.** Any change under `infra/` runs the `infra-ops-reviewer` agent and the deploy-order
   checklist from the `infra-deploy` skill; prod applies are owner steps (§24).
6. **When blocked**, widen `Owns:` here and in the store, write the operator brief into the task
   description, and retry — do not narrow the story.

---

## 22. Risk register

| Risk                                                                             | Likelihood | Impact | Mitigation                                                                                                                                              |
| -------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SYS-2 re-plumbing changes 5e behaviour subtly                                    | Medium     | High   | SYS-1.2 literal-equality tests before any swap; byte-identical hydration; e2e suite on both profiles per story.                                         |
| Schema bumps break cloud-backup restore                                          | Medium     | High   | Prefer additive fields with stable hydrators; when a bump is unavoidable, ship the migration + restore compatibility test and note it in release notes. |
| Sandbox host opens a new attack surface                                          | Medium     | High   | ADR-030 first; opaque origin; exact CSP; regression gates (ENG-5.2); security review before enabling non-starter packages.                              |
| Mega-file decomposition collides with the review loop or in-flight branches      | High       | Medium | STB-1.3 pauses the loop; STB-2 lands before any P1 lane starts; salvage branches inspected in STB-1.2.                                                  |
| AI builder produces low-quality or unsafe widgets                                | Medium     | Medium | Proposals always land in the manual builder's Review step; trust review mandatory; provenance badge; smoke corpus.                                      |
| Combat-on-map performance on large maps                                          | Medium     | Medium | Movement BFS bounded to the viewport grid; bake layer (MAP-3.3); perf pipeline (ENG-1.1) measures `map-pan-zoom-*`.                                     |
| External blockers (Stripe, certs, Firebase, curation, phase-2 review) slip       | High       | Medium | Those stories are isolated behind fail-closed gates; RC-1 ships with honest "not in this edition" only for these four.                                  |
| i18n migration churns every screen at once                                       | High       | Medium | UX-1.2 is one PR per decomposed directory, sequenced after that directory's STB-2 split; lint allow-list shrinks per PR.                                |
| Visual regression suite is brittle                                               | Medium     | Low    | Fixed fonts/time/animations; stable golden routes; documented update flow; diffs reviewed, not auto-accepted.                                           |
| Docs drift again after RC                                                        | Medium     | Medium | FEATURE-GAPS becomes an inventory with an audit that asserts in-UI limits; DOC-2.1 upkeep rule.                                                         |
| The perf gate flips verdicts on unchanged code and teaches everyone to ignore it | High       | Medium | RC-ENG-1.3 median-of-7 interleaved measurement; RC-ENG-1.4 advisory-on-PR / enforcing-on-schedule policy; no budget loosened to make red go away.       |
| Write-fence blocks park a task per reviewer round and stall the fleet            | High       | Medium | Companion paths granted in the manifest; every open story's `Owns:` re-checked 2026-09-11; `sync-tasks.py` keeps the store equal to this file.          |
| The CAN chain runs in series and idles three of four workers                     | High       | Low    | Lane cap raised to 2; DSN toolchain queued next; `phase_gated: false` with phase priorities is the documented lever (§21.3).                            |
| Owner steps (SES, Stripe prod, FCM, signing, Play) slip past the RC date         | High       | Medium | §24 ledger with exact commands; the app ships honest "not in this edition" copy for each; none holds the phase gate.                                    |

---

## 23. Story index

_296 stories. By size: L=26 · M=161 · S=109. By phase: P0=20 · P1=28 · P2=160 · P3=74 · P4=13 · rolling=1. Status (from the dispatcher store): rendered by `tools/roadmap/sync-status.py`; the store, not this column, is the record._

| Id          | Lane        | Story                                                                                                                                                                                                                                                                                                      | Size | Phase   | Deps                                                                                                                                                       | Status               |
| ----------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| RC-STB-1.1  | Stabilize   | Land the pending infra/ADR-028 change                                                                                                                                                                                                                                                                      | S    | P0      | none                                                                                                                                                       | done (a929075)       |
| RC-STB-1.2  | Stabilize   | Prune and record branches                                                                                                                                                                                                                                                                                  | S    | P0      | 1.1                                                                                                                                                        | done (c006749)       |
| RC-STB-1.3  | Stabilize   | Pause or re-target the visual-review loop                                                                                                                                                                                                                                                                  | S    | P0      | none                                                                                                                                                       | done                 |
| RC-STB-1.4  | Stabilize   | Branch ledger and dispatcher worktree hygiene                                                                                                                                                                                                                                                              | S    | P0      | 1.2                                                                                                                                                        | done (38439524)      |
| RC-STB-2.1  | Stabilize   | Split `Settings.tsx` (4,989 lines) into `screens/settings/`                                                                                                                                                                                                                                                | L    | P0      | —                                                                                                                                                          | done (74442ff)       |
| RC-STB-2.2  | Stabilize   | Split `Player.tsx` (2,677) and `PlayerView.tsx` (2,282)                                                                                                                                                                                                                                                    | M    | P0      | —                                                                                                                                                          | done (16715d2)       |
| RC-STB-2.3  | Stabilize   | Split `Extensions.tsx` (2,611)                                                                                                                                                                                                                                                                             | M    | P0      | —                                                                                                                                                          | done (79fba78)       |
| RC-STB-2.4  | Stabilize   | Split `CharBuilder.tsx` (2,470)                                                                                                                                                                                                                                                                            | M    | P0      | —                                                                                                                                                          | done (93793b9)       |
| RC-STB-2.5  | Stabilize   | Split `Session.tsx` (2,295)                                                                                                                                                                                                                                                                                | M    | P0      | —                                                                                                                                                          | done (d715b7e)       |
| RC-STB-2.6  | Stabilize   | Split `Audio.tsx` (2,114), `Characters.tsx` (1,972), `Community.tsx` (1,581), `Knowledge.tsx` (1,201), `Atlas.tsx` (1,167), `SceneEditor.tsx` (1,165), `AppShell.tsx` (1,165), `Onboarding.tsx` (1,290), `MapBuilder.tsx` (1,691 → keep `MapCanvas` + `ImportMapDialog` in `app/map/`, delete the wrapper) | L    | P0      | —                                                                                                                                                          | done                 |
| RC-STB-2.7  | Stabilize   | Add the file-size gate                                                                                                                                                                                                                                                                                     | S    | P0      | 2.1–2.6                                                                                                                                                    | done (4b87c24)       |
| RC-STB-3.1  | Stabilize   | Re-status the initiative files                                                                                                                                                                                                                                                                             | M    | P0      | —                                                                                                                                                          | done (8298259)       |
| RC-STB-3.2  | Stabilize   | Fix the known-wrong reference docs                                                                                                                                                                                                                                                                         | S    | P0      | —                                                                                                                                                          | done (4b87c24)       |
| RC-STB-3.3  | Stabilize   | Restructure FEATURE-GAPS.md into an inventory                                                                                                                                                                                                                                                              | M    | P0      | —                                                                                                                                                          | done (8d14b5e)       |
| RC-STB-4.1  | Stabilize   | ADR-029 System Packages as the rules contract                                                                                                                                                                                                                                                              | M    | P0      | none                                                                                                                                                       | done (abec9d6)       |
| RC-STB-4.2  | Stabilize   | ADR-030 Custom-widget runtime host and authoring model                                                                                                                                                                                                                                                     | M    | P0      | none                                                                                                                                                       | done (9b8df2b)       |
| RC-STB-4.3  | Stabilize   | ADR-031 Scene layout history                                                                                                                                                                                                                                                                               | M    | P0      | none                                                                                                                                                       | done (1dea308)       |
| RC-STB-4.4  | Stabilize   | ADR-032 Internationalization architecture                                                                                                                                                                                                                                                                  | M    | P0      | none                                                                                                                                                       | done (1f08c83)       |
| RC-STB-4.5  | Stabilize   | ADR-033 Combat on the map                                                                                                                                                                                                                                                                                  | M    | P0      | none                                                                                                                                                       | done (ec237e0)       |
| RC-SYS-1.1  | Systems     | `SystemPackage` schema + state slice                                                                                                                                                                                                                                                                       | L    | P1      | STB-4.1                                                                                                                                                    | done (171b915)       |
| RC-SYS-1.2  | Systems     | Built-in packages: D&D 5e reference and Generic/narrative                                                                                                                                                                                                                                                  | M    | P1      | 1.1                                                                                                                                                        | done (24de815)       |
| RC-SYS-1.3  | Systems     | Commands: `system.select`, `system.define`, `system.update`, `system.delete`, `system.fork`                                                                                                                                                                                                                | M    | P1      | 1.1                                                                                                                                                        | done                 |
| RC-SYS-1.4  | Systems     | Actor-scoped read: `getActiveSystemForActor`, `resolveVocabulary`                                                                                                                                                                                                                                          | S    | P1      | 1.1                                                                                                                                                        | done (7858de4)       |
| RC-SYS-2.1  | Systems     | Characters read attributes/skills/derived from the package                                                                                                                                                                                                                                                 | L    | P1      | 1.2, 1.4                                                                                                                                                   | done (0a0287c)       |
| RC-SYS-2.2  | Systems     | Resources and rest recovery from the package                                                                                                                                                                                                                                                               | M    | P1      | 2.1                                                                                                                                                        | done (b318d8e)       |
| RC-SYS-2.3  | Systems     | Conditions from the package                                                                                                                                                                                                                                                                                | M    | P1      | 1.2                                                                                                                                                        | done (8fdcab5)       |
| RC-SYS-2.4  | Systems     | Dice model and turn model from the package                                                                                                                                                                                                                                                                 | M    | P2      | 1.2                                                                                                                                                        | done (3d0499a)       |
| RC-SYS-2.5  | Systems     | Creature schema, encounter math, compendium mapping from the package                                                                                                                                                                                                                                       | M    | P2      | 1.2                                                                                                                                                        | done (fdc9471)       |
| RC-SYS-2.6  | Systems     | Vocabulary everywhere                                                                                                                                                                                                                                                                                      | M    | P2      | 1.4, UX-1.2                                                                                                                                                | done (c78dda1)       |
| RC-SYS-2.7  | Systems     | Widget bodies and templates read the package                                                                                                                                                                                                                                                               | S    | P2      | WID-1.3                                                                                                                                                    | done (fccfc0e)       |
| RC-SYS-3.1  | Systems     | System Package Picker (the front door)                                                                                                                                                                                                                                                                     | M    | P2      | 1.3, STB-2.3                                                                                                                                               | done (e3d46de)       |
| RC-SYS-3.2  | Systems     | Switch dry-run dialog v2                                                                                                                                                                                                                                                                                   | S    | P2      | 1.3, 3.1                                                                                                                                                   | done (fccfc0e)       |
| RC-SYS-3.3  | Systems     | System builder (fork & edit)                                                                                                                                                                                                                                                                               | L    | P2      | 1.3, 3.1                                                                                                                                                   | done (75da220)       |
| RC-SYS-3.4  | Systems     | Package export/import and marketplace listing kind                                                                                                                                                                                                                                                         | M    | P2      | 1.3, CLD-4.1                                                                                                                                               | done                 |
| RC-SYS-3.5  | Systems     | Pathfinder 2e sample package (data only, community-style)                                                                                                                                                                                                                                                  | M    | P2      | 1.2                                                                                                                                                        | done (0842bb6)       |
| RC-SYS-3.6  | Systems     | System package validator and author guide                                                                                                                                                                                                                                                                  | S    | P3      | 3.4                                                                                                                                                        |                      |
| RC-WID-1.1  | Widgets     | Unified widget render resolver                                                                                                                                                                                                                                                                             | M    | P1      | STB-2.6                                                                                                                                                    | done (a4674d2)       |
| RC-WID-1.2  | Widgets     | Template renderers for all eight template kinds                                                                                                                                                                                                                                                            | L    | P1      | 1.1                                                                                                                                                        | done (b102fa7)       |
| RC-WID-1.3  | Widgets     | Iframe sandbox host for `custom-html-js`                                                                                                                                                                                                                                                                   | L    | P1      | 1.1, STB-4.2                                                                                                                                               | done (3f43a40)       |
| RC-WID-1.4  | Widgets     | Worker sandbox (data-only widgets)                                                                                                                                                                                                                                                                         | M    | P2      | 1.3                                                                                                                                                        | done (fe9f73b)       |
| RC-WID-1.5  | Widgets     | Trust review command + UI                                                                                                                                                                                                                                                                                  | M    | P1      | STB-4.2                                                                                                                                                    | done (c8cc3b2)       |
| RC-WID-1.6  | Widgets     | Real starter library                                                                                                                                                                                                                                                                                       | M    | P2      | 1.2, 1.3, 1.5                                                                                                                                              | done (4feee83)       |
| RC-WID-2.1  | Widgets     | Builder shell and definition editor                                                                                                                                                                                                                                                                        | L    | P1      | 1.2, STB-2.3                                                                                                                                               | done (e7e42c3)       |
| RC-WID-2.2  | Widgets     | Data step: bindings, data queries, computed fields                                                                                                                                                                                                                                                         | M    | P1      | 2.1                                                                                                                                                        | done (3330d28)       |
| RC-WID-2.3  | Widgets     | Config-fields and commands steps                                                                                                                                                                                                                                                                           | M    | P2      | 2.1                                                                                                                                                        | done (160c770)       |
| RC-WID-2.4  | Widgets     | Style step                                                                                                                                                                                                                                                                                                 | S    | P2      | 2.1, DSN-1.1                                                                                                                                               | retrying             |
| RC-WID-2.5  | Widgets     | Advanced step: custom HTML/JS                                                                                                                                                                                                                                                                              | M    | P2      | 1.3, 2.1                                                                                                                                                   | done (d9b146e)       |
| RC-WID-2.6  | Widgets     | Edit-in-place from the canvas                                                                                                                                                                                                                                                                              | S    | P2      | 2.1, CAN-4.2                                                                                                                                               |                      |
| RC-WID-2.7  | Widgets     | Export/share and versioning UX                                                                                                                                                                                                                                                                             | S    | P2      | 2.1                                                                                                                                                        | done (5b09cf3)       |
| RC-WID-3.1  | Widgets     | MCP tool `widget.package.propose`                                                                                                                                                                                                                                                                          | M    | P2      | 1.2, AI-1.2                                                                                                                                                | done (776cab8)       |
| RC-WID-3.2  | Widgets     | "Generate a widget" dialog on the canvas and in the builder                                                                                                                                                                                                                                                | M    | P2      | 3.1, 2.1, AI-2.1                                                                                                                                           | done (a069697)       |
| RC-WID-3.3  | Widgets     | Iterate on a generated widget                                                                                                                                                                                                                                                                              | S    | P2      | 3.2                                                                                                                                                        | done (0895d01)       |
| RC-WID-4.1  | Widgets     | Missing builtin bodies                                                                                                                                                                                                                                                                                     | M    | P2      | 1.1                                                                                                                                                        | done (81cbfa3)       |
| RC-WID-4.2  | Widgets     | Per-widget operate controls on the canvas                                                                                                                                                                                                                                                                  | M    | P2      | 1.1                                                                                                                                                        | done (a29d588)       |
| RC-WID-4.3  | Widgets     | Widget bindings inspector                                                                                                                                                                                                                                                                                  | M    | P2      | CAN-4.1                                                                                                                                                    |                      |
| RC-WID-4.4  | Widgets     | Widget accessibility contract                                                                                                                                                                                                                                                                              | M    | P3      | 4.2, 2.4                                                                                                                                                   |                      |
| RC-CAN-1.1  | Canvas      | Core inverse builders for scene layout ops                                                                                                                                                                                                                                                                 | M    | P1      | STB-4.3                                                                                                                                                    | done (e31254d)       |
| RC-CAN-1.2  | Canvas      | `scene.restore-widget` + tombstones                                                                                                                                                                                                                                                                        | M    | P1      | 1.1                                                                                                                                                        | done (e639e58)       |
| RC-CAN-1.3  | Canvas      | App-side undo/redo stack for both canvases                                                                                                                                                                                                                                                                 | M    | P1      | 1.1, 1.2                                                                                                                                                   | done (677cab1)       |
| RC-CAN-2.1  | Canvas      | Tile-type semantic tokens                                                                                                                                                                                                                                                                                  | S    | P2      | DSN-1.1                                                                                                                                                    | done (0512375)       |
| RC-CAN-2.2  | Canvas      | Tile header identity                                                                                                                                                                                                                                                                                       | M    | P2      | 2.1, WID-1.1                                                                                                                                               | done (0c1b0fd)       |
| RC-CAN-2.3  | Canvas      | Note tile depth levels                                                                                                                                                                                                                                                                                     | M    | P2      | 2.2, KNW-1.1                                                                                                                                               | retrying             |
| RC-CAN-2.4  | Canvas      | Tile action menu                                                                                                                                                                                                                                                                                           | M    | P2      | 2.2, CAN-1.3                                                                                                                                               | retrying             |
| RC-CAN-2.5  | Canvas      | Resize presets and keyboard resize                                                                                                                                                                                                                                                                         | S    | P2      | 2.4                                                                                                                                                        |                      |
| RC-CAN-3.1  | Canvas      | Fit / Comfortable / Detail zoom presets                                                                                                                                                                                                                                                                    | M    | P2      | —                                                                                                                                                          | done (0529a81)       |
| RC-CAN-3.2  | Canvas      | Scroll-natural pan                                                                                                                                                                                                                                                                                         | S    | P2      | 3.1                                                                                                                                                        | done (ad2f860)       |
| RC-CAN-3.3  | Canvas      | Column-overflow guard and "Fix layout"                                                                                                                                                                                                                                                                     | S    | P2      | —                                                                                                                                                          | done (ad1523a)       |
| RC-CAN-3.4  | Canvas      | Layout quality indicator                                                                                                                                                                                                                                                                                   | S    | P2      | 3.3                                                                                                                                                        | done (3703711)       |
| RC-CAN-3.5  | Canvas      | Keyboard model completion                                                                                                                                                                                                                                                                                  | M    | P2      | 1.3, 2.4                                                                                                                                                   |                      |
| RC-CAN-3.6  | Canvas      | Multi-select, align/distribute, group, z-order                                                                                                                                                                                                                                                             | L    | P2      | 1.1, 3.5                                                                                                                                                   |                      |
| RC-CAN-4.1  | Canvas      | Tile gallery sheet with live previews                                                                                                                                                                                                                                                                      | M    | P2      | 2.2, WID-1.1                                                                                                                                               | retrying             |
| RC-CAN-4.2  | Canvas      | Inspector v2 (noun panel)                                                                                                                                                                                                                                                                                  | M    | P2      | 2.4, WID-4.3                                                                                                                                               |                      |
| RC-CAN-4.3  | Canvas      | `>board` and `>scene` command-palette actions                                                                                                                                                                                                                                                              | S    | P2      | 4.1                                                                                                                                                        |                      |
| RC-CAN-4.4  | Canvas      | Scene templates picker with thumbnails                                                                                                                                                                                                                                                                     | M    | P2      | 4.1                                                                                                                                                        |                      |
| RC-CAN-4.5  | Canvas      | Map tile                                                                                                                                                                                                                                                                                                   | L    | P2      | MAP-2.3, WID-1.1                                                                                                                                           | done                 |
| RC-CAN-4.6  | Canvas      | Scene backgrounds, docks, and sections UI                                                                                                                                                                                                                                                                  | M    | P2      | 4.2                                                                                                                                                        |                      |
| RC-CAN-5.1  | Canvas      | Compact stacked-panel board                                                                                                                                                                                                                                                                                | L    | P2      | 2.2                                                                                                                                                        | retrying             |
| RC-CAN-5.2  | Canvas      | Floating session action bar (phone, session live)                                                                                                                                                                                                                                                          | M    | P2      | 5.1, SES-1.1                                                                                                                                               |                      |
| RC-CAN-5.3  | Canvas      | Touch-first combat tile                                                                                                                                                                                                                                                                                    | M    | P2      | SES-3.2                                                                                                                                                    | done (8bc1836)       |
| RC-CAN-6.1  | Canvas      | Player-view preview overlay on the canvas                                                                                                                                                                                                                                                                  | M    | P2      | 2.2                                                                                                                                                        | retrying             |
| RC-CAN-6.2  | Canvas      | Per-player scene assignments UI                                                                                                                                                                                                                                                                            | S    | P2      | —                                                                                                                                                          | done (ad1523a)       |
| RC-CAN-6.3  | Canvas      | Board empty states and first-tile onboarding                                                                                                                                                                                                                                                               | S    | P3      | DSN-3.1, 4.1                                                                                                                                               |                      |
| RC-MAP-1.1  | Maps        | Session combat tokens                                                                                                                                                                                                                                                                                      | L    | P1      | STB-4.5                                                                                                                                                    | done (65f38fa)       |
| RC-MAP-1.2  | Maps        | AoE templates and measurement as ephemeral session state                                                                                                                                                                                                                                                   | M    | P1      | 1.1                                                                                                                                                        | done (312f4ac)       |
| RC-MAP-1.3  | Maps        | Movement range and path                                                                                                                                                                                                                                                                                    | M    | P1      | 1.1, SYS-1.1                                                                                                                                               | done (934eee0)       |
| RC-MAP-1.4  | Maps        | Party location and atlas breadcrumb reads                                                                                                                                                                                                                                                                  | S    | P1      | —                                                                                                                                                          | done (7728fa9)       |
| RC-MAP-2.1  | Maps        | Token layer UI                                                                                                                                                                                                                                                                                             | L    | P2      | 1.1                                                                                                                                                        | done (6df360e)       |
| RC-MAP-2.2  | Maps        | Range/path overlay and AoE tool                                                                                                                                                                                                                                                                            | M    | P2      | 1.2, 1.3, 2.1                                                                                                                                              | done (23eb95b)       |
| RC-MAP-2.3  | Maps        | Shared `MapCanvas` combat overlay for Atlas, Session stage, and the map tile                                                                                                                                                                                                                               | M    | P2      | 2.1                                                                                                                                                        | done (e9c393f)       |
| RC-MAP-2.4  | Maps        | Live fog reveal to players with animation and sound cue                                                                                                                                                                                                                                                    | M    | P2      | 2.3, AUD-3.2                                                                                                                                               | done                 |
| RC-MAP-2.5  | Maps        | Party marker and "Mark party here"                                                                                                                                                                                                                                                                         | S    | P2      | 1.4                                                                                                                                                        | done (d35327a)       |
| RC-MAP-2.6  | Maps        | Combat map persistence and archive                                                                                                                                                                                                                                                                         | S    | P2      | 1.1                                                                                                                                                        | done (d35327a)       |
| RC-MAP-3.1  | Maps        | Assets panel becomes a real stamp/prop library                                                                                                                                                                                                                                                             | M    | P2      | none                                                                                                                                                       | done (2ade44f)       |
| RC-MAP-3.2  | Maps        | Raster import wizard v2                                                                                                                                                                                                                                                                                    | M    | P2      | —                                                                                                                                                          | done                 |
| RC-MAP-3.3  | Maps        | Canvas-2d bake layer for dense static fills                                                                                                                                                                                                                                                                | M    | P2      | —                                                                                                                                                          | done (d4dfab6)       |
| RC-MAP-3.4  | Maps        | Room-graph view and stocking editor                                                                                                                                                                                                                                                                        | M    | P2      | —                                                                                                                                                          | done (9dfc9e3)       |
| RC-MAP-3.5  | Maps        | Live "immediate" generation knobs                                                                                                                                                                                                                                                                          | S    | P2      | —                                                                                                                                                          | done                 |
| RC-MAP-3.6  | Maps        | Lighting and line-of-sight visualization                                                                                                                                                                                                                                                                   | M    | P2      | —                                                                                                                                                          | done (36a7736)       |
| RC-MAP-3.7  | Maps        | Travel routes and travel time                                                                                                                                                                                                                                                                              | M    | P2      | 1.4, SYS-1.1                                                                                                                                               | done (7ef3c1b)       |
| RC-MAP-3.8  | Maps        | Map hierarchy breadcrumb and drill-down                                                                                                                                                                                                                                                                    | S    | P2      | 1.4                                                                                                                                                        | done                 |
| RC-MAP-3.9  | Maps        | Fog brush ergonomics and polygon lasso polish                                                                                                                                                                                                                                                              | S    | P2      | —                                                                                                                                                          | done (b700e3f)       |
| RC-MAP-3.10 | Maps        | POI note-creation flow and popover                                                                                                                                                                                                                                                                         | M    | P2      | KNW-1.3                                                                                                                                                    | done (ddfffb4)       |
| RC-MAP-4.1  | Maps        | List view and screen-reader inventory                                                                                                                                                                                                                                                                      | M    | P2      | —                                                                                                                                                          | done (dc7335e)       |
| RC-MAP-4.2  | Maps        | POI keyboard navigation (nearest in cardinal direction)                                                                                                                                                                                                                                                    | S    | P2      | —                                                                                                                                                          | done (b700e3f)       |
| RC-MAP-4.3  | Maps        | Touch gesture model on the editor                                                                                                                                                                                                                                                                          | M    | P2      | —                                                                                                                                                          | done (35bc24e)       |
| RC-MAP-4.4  | Maps        | Map library gallery                                                                                                                                                                                                                                                                                        | M    | P3      | DSN-3.1                                                                                                                                                    |                      |
| RC-MAP-4.5  | Maps        | Editor onboarding and shortcut discovery                                                                                                                                                                                                                                                                   | S    | P3      | UX-3.3                                                                                                                                                     |                      |
| RC-SES-1.1  | Session     | Session-live shell posture                                                                                                                                                                                                                                                                                 | M    | P2      | STB-2.6 (AppShell split)                                                                                                                                   | done (08c8389)       |
| RC-SES-1.2  | Session     | Session quick panel (right rail / sheet)                                                                                                                                                                                                                                                                   | M    | P2      | 1.1                                                                                                                                                        | done (c9d6f0b)       |
| RC-SES-1.3  | Session     | Start/End session flows                                                                                                                                                                                                                                                                                    | M    | P2      | 1.1                                                                                                                                                        | done (314b961)       |
| RC-SES-2.1  | Session     | Roll labels, expansion, and export                                                                                                                                                                                                                                                                         | S    | P2      | —                                                                                                                                                          | done (7f17491)       |
| RC-SES-2.2  | Session     | Inline `[[roll:1d20+5]]` in notes and handouts                                                                                                                                                                                                                                                             | M    | P2      | KNW-1.1                                                                                                                                                    | done (7a8c3ba)       |
| RC-SES-2.3  | Session     | Rollable tables tab                                                                                                                                                                                                                                                                                        | M    | P2      | —                                                                                                                                                          | done (ea90b88)       |
| RC-SES-2.4  | Session     | Dice drama                                                                                                                                                                                                                                                                                                 | S    | P3      | DSN-1.3                                                                                                                                                    |                      |
| RC-SES-3.1  | Session     | Condition durations and round ticks                                                                                                                                                                                                                                                                        | M    | P2      | SYS-2.3                                                                                                                                                    | done (ef83329)       |
| RC-SES-3.2  | Session     | One-handed HP sheet and undo                                                                                                                                                                                                                                                                               | M    | P2      | —                                                                                                                                                          | done (e77e097)       |
| RC-SES-3.3  | Session     | Stat-block quick reference from a row                                                                                                                                                                                                                                                                      | M    | P2      | SYS-2.5                                                                                                                                                    | done (c0ba581)       |
| RC-SES-3.4  | Session     | Tracker keyboard model                                                                                                                                                                                                                                                                                     | S    | P2      | —                                                                                                                                                          | done (7f17491)       |
| RC-SES-3.5  | Session     | Encounter builder v2                                                                                                                                                                                                                                                                                       | M    | P2      | SYS-2.5, MAP-1.1                                                                                                                                           | done (1712b4f)       |
| RC-SES-4.1  | Session     | End-of-session capture → session log note                                                                                                                                                                                                                                                                  | M    | P2      | 1.3                                                                                                                                                        | done (e3e2698)       |
| RC-SES-4.2  | Session     | Continuity check after capture                                                                                                                                                                                                                                                                             | S    | P2      | 4.1, AI-1.3                                                                                                                                                | done (10bbca2)       |
| RC-SES-4.3  | Session     | Pre-session prep view v2                                                                                                                                                                                                                                                                                   | S    | P2      | —                                                                                                                                                          | done (10bbca2)       |
| RC-SES-4.4  | Session     | Timer and clocks                                                                                                                                                                                                                                                                                           | S    | P2      | —                                                                                                                                                          | done (614c733)       |
| RC-SES-5.1  | Session     | Player-rolled initiative and readiness from the companion                                                                                                                                                                                                                                                  | M    | P3      | 3.4, CLD-3.2                                                                                                                                               |                      |
| RC-CHR-1.1  | Characters  | Class resources UI from the package                                                                                                                                                                                                                                                                        | M    | P2      | SYS-2.2                                                                                                                                                    | done (2d4eb7b)       |
| RC-CHR-1.2  | Characters  | Rest workflow                                                                                                                                                                                                                                                                                              | M    | P2      | 1.1                                                                                                                                                        | done (e086099)       |
| RC-CHR-1.3  | Characters  | Concentration and death saves                                                                                                                                                                                                                                                                              | M    | P2      | —                                                                                                                                                          | done (473cb9b)       |
| RC-CHR-1.4  | Characters  | XP and milestone advancement modes                                                                                                                                                                                                                                                                         | S    | P2      | SYS-1.1                                                                                                                                                    | done (5b42ebb)       |
| RC-CHR-2.1  | Characters  | Guided level-up wizard v2                                                                                                                                                                                                                                                                                  | M    | P2      | 1.1                                                                                                                                                        | done (be1e070)       |
| RC-CHR-2.2  | Characters  | Downtime tracker                                                                                                                                                                                                                                                                                           | S    | P2      | —                                                                                                                                                          | done (5b42ebb)       |
| RC-CHR-2.3  | Characters  | Character history timeline                                                                                                                                                                                                                                                                                 | S    | P2      | —                                                                                                                                                          | done (2cb40be)       |
| RC-CHR-2.4  | Characters  | Printable sheet                                                                                                                                                                                                                                                                                            | S    | P3      | —                                                                                                                                                          |                      |
| RC-CHR-3.1  | Characters  | Live party panel over remote play                                                                                                                                                                                                                                                                          | M    | P2      | SES-1.2                                                                                                                                                    | done (7aea5d0)       |
| RC-CHR-3.2  | Characters  | Party stash v2                                                                                                                                                                                                                                                                                             | S    | P2      | —                                                                                                                                                          | done (2cb40be)       |
| RC-CHR-4.1  | Characters  | Player-private notes (DM-invisible)                                                                                                                                                                                                                                                                        | L    | P2      | STB-4 (needs an ADR amendment to ADR-004/019: a second Dexie database `dndtools-private-<characterId>` never replicated, never in MCP reads)               | done (66e3292)       |
| RC-CHR-4.2  | Characters  | Highlight compilation                                                                                                                                                                                                                                                                                      | S    | P2      | SES-4.1                                                                                                                                                    | done (5a29b96)       |
| RC-CHR-4.3  | Characters  | Preview-mode edges (DEBT-2026-005)                                                                                                                                                                                                                                                                         | S    | P2      | —                                                                                                                                                          | done (5a29b96)       |
| RC-CHR-4.4  | Characters  | Trusted tier decision                                                                                                                                                                                                                                                                                      | S    | P2      | —                                                                                                                                                          | done (70be11b)       |
| RC-CHR-5.1  | Characters  | Character sheet template fidelity                                                                                                                                                                                                                                                                          | M    | P3      | DSN-2.1                                                                                                                                                    |                      |
| RC-CHR-5.2  | Characters  | Builder step polish                                                                                                                                                                                                                                                                                        | S    | P3      | —                                                                                                                                                          |                      |
| RC-CHR-5.3  | Characters  | Roster library information scent                                                                                                                                                                                                                                                                           | S    | P3      | —                                                                                                                                                          |                      |
| RC-KNW-1.1  | Knowledge   | Shared markdown renderer with callouts, tables, images, wikilinks                                                                                                                                                                                                                                          | M    | P2      | —                                                                                                                                                          | done (53bbaa1)       |
| RC-KNW-1.2  | Knowledge   | Editor v2: split/preview, toolbar, wikilink autocomplete, slash menu                                                                                                                                                                                                                                       | L    | P2      | 1.1                                                                                                                                                        | done (24ffff4)       |
| RC-KNW-1.3  | Knowledge   | Templates and snippets UI                                                                                                                                                                                                                                                                                  | M    | P2      | 1.2                                                                                                                                                        | done (f546ae2)       |
| RC-KNW-1.4  | Knowledge   | Reading width and typography preference                                                                                                                                                                                                                                                                    | S    | P3      | —                                                                                                                                                          |                      |
| RC-KNW-2.1  | Knowledge   | Filters and saved searches UI                                                                                                                                                                                                                                                                              | M    | P2      | —                                                                                                                                                          | done (a61091b)       |
| RC-KNW-2.2  | Knowledge   | Note list information scent                                                                                                                                                                                                                                                                                | S    | P3      | —                                                                                                                                                          |                      |
| RC-KNW-2.3  | Knowledge   | Command palette v2                                                                                                                                                                                                                                                                                         | M    | P2      | —                                                                                                                                                          | done (adb795c)       |
| RC-KNW-3.1  | Knowledge   | Calendar editor                                                                                                                                                                                                                                                                                            | M    | P2      | —                                                                                                                                                          | done (2af16a9)       |
| RC-KNW-3.2  | Knowledge   | Quest/faction/NPC cards to DS spec                                                                                                                                                                                                                                                                         | M    | P3      | DSN-2.1                                                                                                                                                    |                      |
| RC-KNW-3.3  | Knowledge   | Relationship editor (faction↔NPC, NPC↔location)                                                                                                                                                                                                                                                            | S    | P2      | —                                                                                                                                                          | done (cd6e319)       |
| RC-KNW-4.1  | Knowledge   | Clusters and momentum                                                                                                                                                                                                                                                                                      | M    | P2      | —                                                                                                                                                          | done (e866584)       |
| RC-KNW-4.2  | Knowledge   | Link repair UI                                                                                                                                                                                                                                                                                             | S    | P2      | —                                                                                                                                                          | done (cd6e319)       |
| RC-KNW-4.3  | Knowledge   | Graph performance and interaction                                                                                                                                                                                                                                                                          | S    | P3      | —                                                                                                                                                          |                      |
| RC-KNW-5.1  | Knowledge   | Vault ↔ markdown folder round-trip                                                                                                                                                                                                                                                                         | M    | P3      | 1.2                                                                                                                                                        |                      |
| RC-KNW-5.2  | Knowledge   | Note revision history                                                                                                                                                                                                                                                                                      | M    | P3      | 1.2                                                                                                                                                        |                      |
| RC-AUD-1.1  | Audio       | Web Audio engine                                                                                                                                                                                                                                                                                           | L    | P2      | —                                                                                                                                                          | done (71d803b)       |
| RC-AUD-1.2  | Audio       | Asset metadata: duration, waveform thumbnail, tags                                                                                                                                                                                                                                                         | S    | P2      | —                                                                                                                                                          | done (d144265)       |
| RC-AUD-1.3  | Audio       | Starter pack                                                                                                                                                                                                                                                                                               | M    | P2      | —                                                                                                                                                          | done (ef6c7e0)       |
| RC-AUD-2.1  | Audio       | Scene packages                                                                                                                                                                                                                                                                                             | M    | P2      | —                                                                                                                                                          | done (48ae2dd)       |
| RC-AUD-2.2  | Audio       | POI-linked scene packages                                                                                                                                                                                                                                                                                  | S    | P2      | 2.1, MAP-2.5                                                                                                                                               | done (d144265)       |
| RC-AUD-2.3  | Audio       | `.dndscene` export/import                                                                                                                                                                                                                                                                                  | S    | P2      | 2.1                                                                                                                                                        | done (1584377)       |
| RC-AUD-2.4  | Audio       | Second-screen display v2                                                                                                                                                                                                                                                                                   | S    | P3      | —                                                                                                                                                          |                      |
| RC-AUD-3.1  | Audio       | Combat music automation                                                                                                                                                                                                                                                                                    | S    | P2      | 1.1                                                                                                                                                        | done (1584377)       |
| RC-AUD-3.2  | Audio       | SFX events                                                                                                                                                                                                                                                                                                 | M    | P2      | 1.1                                                                                                                                                        | done (4b979a4)       |
| RC-AUD-3.3  | Audio       | Web sources (opt-in)                                                                                                                                                                                                                                                                                       | S    | P2      | —                                                                                                                                                          | done (da8d66e)       |
| RC-AUD-3.4  | Audio       | Assistant atmosphere tools                                                                                                                                                                                                                                                                                 | S    | P2      | AI-1.2                                                                                                                                                     | done (da8d66e)       |
| RC-AI-1.1   | AI          | Transport abort + streaming polish                                                                                                                                                                                                                                                                         | S    | P1      | —                                                                                                                                                          | done (e97e718)       |
| RC-AI-1.2   | AI          | Write tools: `encounter.create`, `quest.create`, `faction.create`, `map.poi.create`, `scene.card.update`, `note.append`                                                                                                                                                                                    | M    | P1      | —                                                                                                                                                          | done                 |
| RC-AI-1.3   | AI          | Read tools: continuity bundle, coverage gaps, stale notes, cluster momentum                                                                                                                                                                                                                                | S    | P1      | —                                                                                                                                                          | done                 |
| RC-AI-1.4   | AI          | Agentic PC leveling                                                                                                                                                                                                                                                                                        | M    | P2      | CHR-2.1                                                                                                                                                    | done (243f032)       |
| RC-AI-2.1   | AI          | Semantic diff preview for proposals                                                                                                                                                                                                                                                                        | M    | P2      | —                                                                                                                                                          | done (7fe1f5a)       |
| RC-AI-2.2   | AI          | Three-way conflict UI                                                                                                                                                                                                                                                                                      | M    | P2      | 2.1                                                                                                                                                        | done (263be5b)       |
| RC-AI-2.3   | AI          | Audit browser + export                                                                                                                                                                                                                                                                                     | S    | P2      | —                                                                                                                                                          | done (00dff48)       |
| RC-AI-2.4   | AI          | Batch review with grouping and filters                                                                                                                                                                                                                                                                     | S    | P2      | —                                                                                                                                                          | done (00dff48)       |
| RC-AI-3.1   | AI          | Model router and status panel                                                                                                                                                                                                                                                                              | M    | P2      | —                                                                                                                                                          | done (3374558)       |
| RC-AI-3.2   | AI          | Local embeddings for semantic search                                                                                                                                                                                                                                                                       | L    | P2      | 3.1                                                                                                                                                        | done (22a44a3)       |
| RC-AI-3.3   | AI          | Ollama model management                                                                                                                                                                                                                                                                                    | S    | P2      | —                                                                                                                                                          | done (781ede3)       |
| RC-AI-4.1   | AI          | Copilot client + indexer contract (behind the phase-2 gate)                                                                                                                                                                                                                                                | M    | P2      | CLD-2.2                                                                                                                                                    | done                 |
| RC-AI-5.1   | AI          | Deterministic fake provider and assistant eval corpus in CI                                                                                                                                                                                                                                                | M    | P3      | 3.1                                                                                                                                                        |                      |
| RC-CLD-1.1  | Cloud       | SES production access + verified invite sender                                                                                                                                                                                                                                                             | S    | P2      | (external)                                                                                                                                                 | operator             |
| RC-CLD-1.2  | Cloud       | Prod promotion run                                                                                                                                                                                                                                                                                         | S    | P4      | ENG-7.1                                                                                                                                                    | done (v0.3.7)        |
| RC-CLD-1.3  | Cloud       | TURN production hardening                                                                                                                                                                                                                                                                                  | M    | P2      | —                                                                                                                                                          | done                 |
| RC-CLD-1.4  | Cloud       | Privacy-respecting product analytics (opt-in)                                                                                                                                                                                                                                                              | M    | P2      | —                                                                                                                                                          | done (7bd6872)       |
| RC-CLD-1.5  | Cloud       | Prod cost and alarm hygiene                                                                                                                                                                                                                                                                                | S    | P4      | 1.3                                                                                                                                                        | operator             |
| RC-CLD-2.1  | Cloud       | Stripe billing (ADR-027 → Accepted)                                                                                                                                                                                                                                                                        | L    | P2      | (external)                                                                                                                                                 | done (95aa5f3)       |
| RC-CLD-2.2  | Cloud       | Cloud-Enhanced phase 2 security review                                                                                                                                                                                                                                                                     | M    | P2      | —                                                                                                                                                          |                      |
| RC-CLD-2.3  | Cloud       | FCM push credentials                                                                                                                                                                                                                                                                                       | S    | P4      | 2.7                                                                                                                                                        | operator             |
| RC-CLD-2.4  | Cloud       | Cross-device merge sync                                                                                                                                                                                                                                                                                    | L    | P2      | none (ADR-010 exists)                                                                                                                                      | done (4594d85)       |
| RC-CLD-2.5  | Cloud       | Keyless browser access (Cloud-Enhanced)                                                                                                                                                                                                                                                                    | M    | P2      | 2.2.                                                                                                                                                       | done                 |
| RC-CLD-2.6  | Cloud       | Stripe production cutover                                                                                                                                                                                                                                                                                  | S    | P4      | 2.8, ENG-7.1                                                                                                                                               | operator             |
| RC-CLD-2.7  | Cloud       | Push notifications behind a capability with a fake transport                                                                                                                                                                                                                                               | M    | P3      | 3.2                                                                                                                                                        |                      |
| RC-CLD-2.8  | Cloud       | Legal placeholders lint and prod-promotion guard                                                                                                                                                                                                                                                           | S    | P3      | —                                                                                                                                                          |                      |
| RC-CLD-3.1  | Cloud       | Host/join flow polish                                                                                                                                                                                                                                                                                      | M    | P2      | —                                                                                                                                                          | done (96cbf89)       |
| RC-CLD-3.2  | Cloud       | Player companion parity                                                                                                                                                                                                                                                                                    | M    | P2      | CHR-3.1, CAN-6.2                                                                                                                                           | done (ac4c496)       |
| RC-CLD-3.3  | Cloud       | Async play: between-session inbox                                                                                                                                                                                                                                                                          | S    | P2      | —                                                                                                                                                          | done (ffbf639)       |
| RC-CLD-4.1  | Cloud       | Marketplace listing kinds and module format                                                                                                                                                                                                                                                                | M    | P2      | —                                                                                                                                                          | done                 |
| RC-CLD-4.2  | Cloud       | Discovery (superseded)                                                                                                                                                                                                                                                                                     | M    | P2      | —                                                                                                                                                          | skipped(→4.5)        |
| RC-CLD-4.3  | Cloud       | Creator tooling                                                                                                                                                                                                                                                                                            | S    | P2      | —                                                                                                                                                          | done (ffbf639)       |
| RC-CLD-4.4  | Cloud       | Wiki v2                                                                                                                                                                                                                                                                                                    | M    | P3      | —                                                                                                                                                          |                      |
| RC-CLD-4.5  | Cloud       | Discovery: search, filters, featured, ratings                                                                                                                                                                                                                                                              | M    | P2      | 4.1, 4.3                                                                                                                                                   | proposed             |
| RC-DSN-1.1  | Design      | Complete the `T` map and lint raw values                                                                                                                                                                                                                                                                   | M    | P3      | —                                                                                                                                                          | done (d4f2e5a)       |
| RC-DSN-1.2  | Design      | Five themes                                                                                                                                                                                                                                                                                                | M    | P3      | —                                                                                                                                                          |                      |
| RC-DSN-1.3  | Design      | Motion vocabulary                                                                                                                                                                                                                                                                                          | S    | P3      | —                                                                                                                                                          |                      |
| RC-DSN-1.4  | Design      | Density audit                                                                                                                                                                                                                                                                                              | S    | P3      | —                                                                                                                                                          |                      |
| RC-DSN-2.1  | Design      | Convert `src/ds/components/                                                                                                                                                                                                                                                                                | L    | P3      | —                                                                                                                                                          |                      |
| RC-DSN-2.2  | Design      | Missing primitives                                                                                                                                                                                                                                                                                         | M    | P3      | —                                                                                                                                                          | done (2112968)       |
| RC-DSN-2.3  | Design      | Component documentation site (in-repo)                                                                                                                                                                                                                                                                     | M    | P3      | —                                                                                                                                                          |                      |
| RC-DSN-2.4  | Design      | Re-sync design source A                                                                                                                                                                                                                                                                                    | S    | P3      | —                                                                                                                                                          |                      |
| RC-DSN-3.1  | Design      | Empty-state illustration set                                                                                                                                                                                                                                                                               | M    | P3      | —                                                                                                                                                          |                      |
| RC-DSN-3.2  | Design      | Icon vocabulary completion                                                                                                                                                                                                                                                                                 | S    | P3      | —                                                                                                                                                          |                      |
| RC-DSN-3.3  | Design      | Brand asset kit                                                                                                                                                                                                                                                                                            | M    | P3      | —                                                                                                                                                          |                      |
| RC-DSN-3.4  | Design      | Loading, skeleton, and progress states                                                                                                                                                                                                                                                                     | S    | P3      | —                                                                                                                                                          |                      |
| RC-DSN-4.1  | Design      | Golden-route visual regression suite                                                                                                                                                                                                                                                                       | M    | P3      | —                                                                                                                                                          |                      |
| RC-DSN-4.2  | Design      | Design conformance checklist in the PR template                                                                                                                                                                                                                                                            | S    | P3      | —                                                                                                                                                          |                      |
| RC-UX-1.1   | UX          | Message-key catalogs and `t()` API                                                                                                                                                                                                                                                                         | M    | P1      | STB-4.4                                                                                                                                                    | done (2a1c172)       |
| RC-UX-1.2   | UX          | Migrate every user-visible string                                                                                                                                                                                                                                                                          | L    | P1      | 1.1                                                                                                                                                        | done (9f742c6)       |
| RC-UX-1.3   | UX          | RTL readiness                                                                                                                                                                                                                                                                                              | S    | P2      | —                                                                                                                                                          | done (5dc0b18)       |
| RC-UX-1.4   | UX          | Community translation workflow                                                                                                                                                                                                                                                                             | S    | P2      | —                                                                                                                                                          | done (5dc0b18)       |
| RC-UX-1.5   | UX          | Pseudo-locale and third-locale scaffold                                                                                                                                                                                                                                                                    | S    | P3      | 1.4                                                                                                                                                        |                      |
| RC-UX-2.1   | UX          | Extend the axe route list to every durable workspace                                                                                                                                                                                                                                                       | S    | P2      | —                                                                                                                                                          | done (379654e)       |
| RC-UX-2.2   | UX          | Canvas and map screen-reader contracts                                                                                                                                                                                                                                                                     | M    | P2      | CAN-3.5, MAP-4.1                                                                                                                                           |                      |
| RC-UX-2.3   | UX          | Focus and dialog audit                                                                                                                                                                                                                                                                                     | S    | P3      | —                                                                                                                                                          |                      |
| RC-UX-2.4   | UX          | Text scaling and zoom                                                                                                                                                                                                                                                                                      | S    | P3      | —                                                                                                                                                          |                      |
| RC-UX-3.1   | UX          | HelpTip placements                                                                                                                                                                                                                                                                                         | S    | P2      | DSN-2.2                                                                                                                                                    | done (1b3dece)       |
| RC-UX-3.2   | UX          | Feature spotlight system                                                                                                                                                                                                                                                                                   | M    | P2      | DSN-2.2                                                                                                                                                    | done (805d864)       |
| RC-UX-3.3   | UX          | Keyboard shortcut registry and `?` overlay                                                                                                                                                                                                                                                                 | M    | P2      | —                                                                                                                                                          | done (7f7f98e)       |
| RC-UX-3.4   | UX          | Help menu, Getting started, What's new                                                                                                                                                                                                                                                                     | S    | P2      | —                                                                                                                                                          | done (379654e)       |
| RC-UX-3.5   | UX          | Maturity-signal disclosure                                                                                                                                                                                                                                                                                 | S    | P2      | —                                                                                                                                                          | done (880f7ba)       |
| RC-UX-3.6   | UX          | Onboarding v2                                                                                                                                                                                                                                                                                              | M    | P3      | 3.2, DSN-3.1                                                                                                                                               |                      |
| RC-UX-3.7   | UX          | The demo vault as a showcase                                                                                                                                                                                                                                                                               | M    | P3      | 3.6                                                                                                                                                        |                      |
| RC-UX-4.1   | UX          | Device-preferences slice and platform layer (DEBT-2026-001)                                                                                                                                                                                                                                                | M    | P2      | —                                                                                                                                                          | done (c8056a7)       |
| RC-UX-4.2   | UX          | Mobile primary-action audit                                                                                                                                                                                                                                                                                | S    | P3      | —                                                                                                                                                          |                      |
| RC-UX-4.3   | UX          | Tablet (rail) layouts                                                                                                                                                                                                                                                                                      | M    | P3      | —                                                                                                                                                          |                      |
| RC-UX-4.4   | UX          | Copy pass v2 in the Lamplight voice                                                                                                                                                                                                                                                                        | M    | P3      | 1.2                                                                                                                                                        |                      |
| RC-PLT-1.1  | Platform    | Desktop code signing + notarization                                                                                                                                                                                                                                                                        | S    | P4      | (external)                                                                                                                                                 | operator             |
| RC-PLT-1.2  | Platform    | Auto-update (electron-updater, GitHub Releases provider)                                                                                                                                                                                                                                                   | M    | P2      | —                                                                                                                                                          | done (ec1dd91)       |
| RC-PLT-1.3  | Platform    | Electron parity audit                                                                                                                                                                                                                                                                                      | S    | P3      | —                                                                                                                                                          |                      |
| RC-PLT-2.1  | Platform    | PWA                                                                                                                                                                                                                                                                                                        | M    | P2      | —                                                                                                                                                          | done                 |
| RC-PLT-2.2  | Platform    | Android: share-target import, home-screen shortcuts, notification channels                                                                                                                                                                                                                                 | M    | P2      | —                                                                                                                                                          | done (ba35b10)       |
| RC-PLT-2.3  | Platform    | Play internal track                                                                                                                                                                                                                                                                                        | S    | P4      | (external)                                                                                                                                                 | operator             |
| RC-PLT-2.4  | Platform    | Offline-first assurance                                                                                                                                                                                                                                                                                    | S    | P3      | 2.1                                                                                                                                                        |                      |
| RC-PLT-3.1  | Platform    | iOS decision and scaffold                                                                                                                                                                                                                                                                                  | M    | P2      | —                                                                                                                                                          | done (fa3590e)       |
| RC-ENG-1.1  | Engineering | Perf measurement pipeline                                                                                                                                                                                                                                                                                  | M    | P1      | —                                                                                                                                                          | done (c237742)       |
| RC-ENG-1.2  | Engineering | Bundle budget enforcement + route-level analysis                                                                                                                                                                                                                                                           | S    | P1      | —                                                                                                                                                          | done (ed4b5a4)       |
| RC-ENG-1.3  | Engineering | Perf measurement that survives a shared runner                                                                                                                                                                                                                                                             | M    | P2      | 1.1                                                                                                                                                        | retrying             |
| RC-ENG-1.4  | Engineering | CI performance policy: advisory on pull requests, enforcing on a recorded CI baseline                                                                                                                                                                                                                      | S    | P2      | 1.3                                                                                                                                                        |                      |
| RC-ENG-2.1  | Engineering | Tiered branch model + smoke gate                                                                                                                                                                                                                                                                           | S    | P1      | —                                                                                                                                                          | done (ed4b5a4)       |
| RC-ENG-2.2  | Engineering | Test suite performance                                                                                                                                                                                                                                                                                     | M    | P2      | —                                                                                                                                                          | done (0a59cfc)       |
| RC-ENG-2.3  | Engineering | A merge gate the autonomous loop cannot pass blind                                                                                                                                                                                                                                                         | M    | P2      | —                                                                                                                                                          | done (dispatcher)    |
| RC-ENG-2.4  | Engineering | One composite action for browser/e2e setup                                                                                                                                                                                                                                                                 | S    | P2      | —                                                                                                                                                          | done (8553a33)       |
| RC-ENG-2.5  | Engineering | Make the Android build provable before CI                                                                                                                                                                                                                                                                  | S    | P2      | —                                                                                                                                                          | done (fe02347)       |
| RC-ENG-2.6  | Engineering | Mobile-chromium navigation flake root cause                                                                                                                                                                                                                                                                | S    | P2      | —                                                                                                                                                          |                      |
| RC-ENG-3.1  | Engineering | Promote budgets from provisional to measured                                                                                                                                                                                                                                                               | S    | P4      | 1.1                                                                                                                                                        |                      |
| RC-ENG-3.2  | Engineering | Runtime performance recovery                                                                                                                                                                                                                                                                               | M    | P3      | 1.1, 1.3                                                                                                                                                   |                      |
| RC-ENG-3.3  | Engineering | Large-vault performance fixture                                                                                                                                                                                                                                                                            | M    | P3      | 1.3                                                                                                                                                        |                      |
| RC-ENG-4.1  | Engineering | `any` elimination in app seams                                                                                                                                                                                                                                                                             | M    | P2      | —                                                                                                                                                          | done (7b9ae09)       |
| RC-ENG-4.2  | Engineering | Core coverage floors raised for new domains                                                                                                                                                                                                                                                                | S    | P2      | —                                                                                                                                                          | done (8644e74)       |
| RC-ENG-4.3  | Engineering | Dependency hygiene                                                                                                                                                                                                                                                                                         | S    | P0      | —                                                                                                                                                          | done (2775646)       |
| RC-ENG-4.4  | Engineering | Dependency wave (the 2026-09 dependabot set)                                                                                                                                                                                                                                                               | M    | P2      | —                                                                                                                                                          |                      |
| RC-ENG-5.1  | Engineering | Security review v2 (whole app)                                                                                                                                                                                                                                                                             | M    | P4      | `POL-1.*`, CLD-2.2.                                                                                                                                        |                      |
| RC-ENG-5.2  | Engineering | Regression gates for new security invariants                                                                                                                                                                                                                                                               | S    | P2      | —                                                                                                                                                          | done (8644e74)       |
| RC-ENG-5.3  | Engineering | API edge hardening                                                                                                                                                                                                                                                                                         | M    | P3      | —                                                                                                                                                          |                      |
| RC-ENG-6.1  | Engineering | Observability in the app                                                                                                                                                                                                                                                                                   | S    | P2      | —                                                                                                                                                          | done (eb4bcb0)       |
| RC-ENG-6.2  | Engineering | Data integrity: storage pressure, corrupt-document recovery, migration rollback                                                                                                                                                                                                                            | M    | P3      | 6.1                                                                                                                                                        |                      |
| RC-ENG-7.1  | Engineering | RC checklist and beta program                                                                                                                                                                                                                                                                              | M    | P4      | `POL-1.*`.                                                                                                                                                 |                      |
| RC-ENG-7.2  | Engineering | RC-1 release rehearsal                                                                                                                                                                                                                                                                                     | S    | P4      | 7.1, 7.3, DOC-1.4                                                                                                                                          | operator             |
| RC-ENG-7.3  | Engineering | RC-1 exit audit                                                                                                                                                                                                                                                                                            | M    | P4      | `POL-1.*`, ENG-5.1, DOC-1.1                                                                                                                                |                      |
| RC-DOC-1.1  | Docs        | Requirements corpus audit                                                                                                                                                                                                                                                                                  | M    | P4      | `POL-1.*`                                                                                                                                                  |                      |
| RC-DOC-1.2  | Docs        | Architecture docs for the new subsystems                                                                                                                                                                                                                                                                   | M    | P2      | —                                                                                                                                                          | done (cf4a26f)       |
| RC-DOC-1.3  | Docs        | User-facing docs                                                                                                                                                                                                                                                                                           | M    | P3      | —                                                                                                                                                          |                      |
| RC-DOC-1.4  | Docs        | Release notes and marketing surface                                                                                                                                                                                                                                                                        | S    | P4      | —                                                                                                                                                          |                      |
| RC-DOC-2.1  | Docs        | Roadmap upkeep                                                                                                                                                                                                                                                                                             | S    | rolling | ` from this file into the store for every unfinished task. Run both before each promotion; a story re-scoped to an owner step is annotated, never deleted. | done (tools/roadmap) |
| RC-DOC-2.2  | Docs        | Docs link and coupling checker in the gates                                                                                                                                                                                                                                                                | S    | P2      | —                                                                                                                                                          |                      |
| RC-POL-1.1  | Polish      | Polish: Command Center                                                                                                                                                                                                                                                                                     | M    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, UX-3.7                                                                                                        |                      |
| RC-POL-1.2  | Polish      | Polish: GM Screen board                                                                                                                                                                                                                                                                                    | L    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, CAN-2.5, CAN-3.6, CAN-4.6, CAN-5.2, CAN-6.3                                                                   |                      |
| RC-POL-1.3  | Polish      | Polish: Scene editor                                                                                                                                                                                                                                                                                       | M    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, CAN-4.2, CAN-4.4, CAN-4.6, CAN-6.1, WID-2.6, WID-4.3                                                          |                      |
| RC-POL-1.4  | Polish      | Polish: Session                                                                                                                                                                                                                                                                                            | L    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, SES-2.4, SES-5.1                                                                                              |                      |
| RC-POL-1.5  | Polish      | Polish: Characters roster                                                                                                                                                                                                                                                                                  | M    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, CHR-5.3                                                                                                       |                      |
| RC-POL-1.6  | Polish      | Polish: Character builder                                                                                                                                                                                                                                                                                  | M    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, CHR-5.2                                                                                                       |                      |
| RC-POL-1.7  | Polish      | Polish: Player sheet (DM side)                                                                                                                                                                                                                                                                             | M    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, CHR-2.4, CHR-5.1                                                                                              |                      |
| RC-POL-1.8  | Polish      | Polish: Player companion (`/play`)                                                                                                                                                                                                                                                                         | M    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, SES-5.1, PLT-2.4                                                                                              |                      |
| RC-POL-1.9  | Polish      | Polish: Atlas and map editor                                                                                                                                                                                                                                                                               | L    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, MAP-4.4, MAP-4.5, UX-2.2                                                                                      |                      |
| RC-POL-1.10 | Polish      | Polish: Story (Campaign)                                                                                                                                                                                                                                                                                   | M    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, KNW-3.2                                                                                                       |                      |
| RC-POL-1.11 | Polish      | Polish: Notes (Knowledge)                                                                                                                                                                                                                                                                                  | M    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, KNW-1.4, KNW-2.2, KNW-5.1, KNW-5.2                                                                            |                      |
| RC-POL-1.12 | Polish      | Polish: Graph and search                                                                                                                                                                                                                                                                                   | M    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, KNW-4.3                                                                                                       |                      |
| RC-POL-1.13 | Polish      | Polish: Audio                                                                                                                                                                                                                                                                                              | M    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, AUD-2.4                                                                                                       |                      |
| RC-POL-1.14 | Polish      | Polish: Extensions (plugins, widget builder, systems, types, compendium)                                                                                                                                                                                                                                   | L    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, WID-2.4, WID-4.4, SYS-3.6                                                                                     |                      |
| RC-POL-1.15 | Polish      | Polish: Community                                                                                                                                                                                                                                                                                          | M    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, CLD-4.2, CLD-4.4                                                                                              |                      |
| RC-POL-1.16 | Polish      | Polish: Plans, cloud and legal                                                                                                                                                                                                                                                                             | M    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, CLD-2.8                                                                                                       |                      |
| RC-POL-1.17 | Polish      | Polish: Settings (every category)                                                                                                                                                                                                                                                                          | L    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, KNW-1.4, UX-1.5, CLD-2.7                                                                                      |                      |
| RC-POL-1.18 | Polish      | Polish: Onboarding                                                                                                                                                                                                                                                                                         | M    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, UX-3.6, UX-3.7                                                                                                |                      |
| RC-POL-1.19 | Polish      | Polish: Join and invite redeem                                                                                                                                                                                                                                                                             | S    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1                                                                                                                |                      |
| RC-POL-1.20 | Polish      | Polish: Scene display and second screen                                                                                                                                                                                                                                                                    | S    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, AUD-2.4                                                                                                       |                      |
| RC-POL-1.21 | Polish      | Polish: Wiki reader                                                                                                                                                                                                                                                                                        | S    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, CLD-4.4                                                                                                       |                      |
| RC-POL-1.22 | Polish      | Polish: Command palette, shortcuts and help                                                                                                                                                                                                                                                                | M    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, CAN-4.3                                                                                                       |                      |
| RC-POL-1.23 | Polish      | Polish: App shell (sidebar, rail, tabs, top bar, footer)                                                                                                                                                                                                                                                   | M    | P3      | DSN-1.2, DSN-1.3, DSN-3.1, DSN-3.4, DSN-4.1, UX-4.2, UX-4.3, CAN-5.2                                                                                       |                      |

---

## 24. Operator ledger — steps only the owner can take

Each row is a story the dispatcher holds as `proposed` (it never blocks the phase gate). The app ships
honest "not in this edition" copy for every one. Commands assume the profiles in `infra/README.md`.

| Story      | What only the owner can do                                                                                                                                                     | Exact step                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RC-CLD-1.1 | Get SES out of the sandbox so public sign-up mail sends.                                                                                                                       | Reply to Support case `178562576600649` with the draft in `docs/runbooks/ses-production-access.md`; when `ProductionAccessEnabled` flips, run `pnpm validate:live`.    |
| RC-CLD-1.5 | Prod cost hygiene: orphan KMS key, TURN TLS cutover, budget subscriber.                                                                                                        | See the story; three commands, recorded in `docs/runbooks/cloud-cost.md`.                                                                                              |
| RC-CLD-2.3 | Firebase project and `google-services.json` for push.                                                                                                                          | After RC-CLD-2.7 lands: create the project, place the file, store the server key in the named stage secret, redeploy the app API.                                      |
| RC-CLD-2.6 | Stripe production: tax decision, legal identity, live keys.                                                                                                                    | `pnpm billing:bootstrap --stage prod` · `pnpm billing:verify --stage prod` · flip `simulated: false`.                                                                  |
| RC-PLT-1.1 | Code-signing certificates (Windows Authenticode, Apple Developer ID) and notarization credentials.                                                                             | Buy/enrol, add the secrets `release.yml` names, re-run the release job on the RC tag.                                                                                  |
| RC-PLT-2.3 | Google Play console: internal track, listing assets.                                                                                                                           | Upload the AAB from `release.yml`; complete the listing with the RC-DSN-3.3 kit.                                                                                       |
| RC-ENG-7.2 | The RC tag and the production promotion.                                                                                                                                       | `git tag v0.4.0 && git push origin v0.4.0`; run `promote-production.yml` from the tag.                                                                                 |
| (plan)     | Two dispatcher settings the classifier would not let a session change: `phase_gated: false` and `max_per_lane: 2` in `~/Programming/agent-dispatcher/manifests/dndtools.json`. | Edit the two values (no restart needed; the engine reloads the manifest per run). Without them the P3 stories wait for the CAN chain and one CAN story runs at a time. |
