# @dndtools/gm-react — Feature Gap Audit

**Audited:** 2026-06-20 · **Branch:** `worktree-react-prototype` · **Auditor:** automated, evidence-based.

> **Scope of this document.** A thorough, severity-rated inventory of every gap between what the
> React prototype *appears* to be (a polished, populated GM command center) and what it *actually
> does* (a mostly-static visual shell with three genuinely-wired surfaces). It complements
> [PROTOTYPE.md](./PROTOTYPE.md) (visual contract) and [README.md](./README.md) (wiring contract),
> both of which describe the design intent; this document describes the **runtime reality** measured
> from the code and the running app.

---

## 0★. 2026-06-24 UPDATE — deep code-review + fix pass (latest)

A 5-agent read-only deep review (runtime/wiring · canvas+live-play · content+platform · shell/cross-cutting · UX/a11y) was run against the whole app; the lead then applied every fix serially. All findings were verified against the real `@dndtools/core` command/query schemas.

**P1 (broken-feature) fixed:**
- **Demo PCs never seeded** — the demo seeded 3 PCs via `character.quick-create`, but its `kind` enum excludes `'pc'`, so every PC was silently rejected and the party/`/play` surfaces seeded with ZERO player characters. Now seeded through the **real guided draft flow** (`create-draft` → 3× `update-draft-step` identity/abilities[valid 27-pt buy]/class → `finalize-draft`, dispatched as the owning player, then DM `set-combat`). Result: 3 real `kind:'pc'` characters with classes/backgrounds/HP/AC (verified in a fresh DB).
- **Dice panel inverted** — showed the OLDEST roll as "last result" (`rolls[0]`); now reads the tail and shows the per-die breakdown.
- **Board "Restore safe point" was structurally dead** — `snapshot-auto-save` was never dispatched, so restore always rejected. Now a safe point is captured on entering edit mode + before applying a preset, and the button only renders once one exists (round-trip gated in `verify-ui`).
- **No error boundary / swallowed load failure** — a rejected lazy chunk or any render throw blanked the app; a thrown Dexie load stuck it on "Loading…" forever. Added an `ErrorBoundary` with reload, a load-error retry screen, and a global `unhandledrejection`→toast (PLAT-018 re-throw net).
- **Reduced motion not honored** — 6 hardcoded transition durations bypassed the duration tokens; now tokenized, plus a global `[data-motion='reduced']` rule that also stops looping animations.

**P2 fixed (selection):** disabled illegal session-workflow transitions (Session Seg + ProjectionControl, via `allowedTransitionsFrom`); blank advancement "Save choices" disabled; Session now-playing shows the track title not a uuid; Player level/class read from core not mock; Settings→Plugins redirects to the live Extensions registry (was parallel mock); Settings/Upgrade silent no-op buttons now give honest feedback; theme `color-scheme` syncs on live switch; a11y — Seg `radiogroup`, `aria-current` nav, skip-link + `<main>` target, `Panel` titles → `<h2>`, ViewAsControl Escape/focus, Session combatant + Campaign cards + Extensions row keyboard-operable, Graph search label + player-view guard; dead `Button` import and `SECTIONS` export removed.

**Deferred (documented, not regressions):** canvas keyboard nav (large, tracked in §0b inspector work); `--color-text-tertiary` on raised surfaces measures 3.79:1 (a token-color decision better made with the designer across all 3 themes); full IconButton/Seg density-token wiring (36→44px is a global layout cascade — doc comment + Settings copy corrected to be honest instead); mobile/responsive shell + the <1200px density floor (product decisions, faithful to the prototype).

**Gates (all green):** `typecheck` ✓ · `build` ✓ · 16/16 routes 0-console-error · `verify-roundtrip` 11/11 · `verify-canvas` 13/13 · **`verify-ui` 6/6** — now incl. **Seed · 3 PCs via draft flow** (`hp=[24,31,42]`) and **Board · safe-point round-trip**.

---

## 0. 2026-06-23 UPDATE — wiring remediation pass (SUPERSEDES the §1 verdict below)

A coordinated multi-agent pass closed the bulk of the C1 "two data realities" gap. The verdict below
(written 2026-06-20: "3 of 15 wired, ~20% functional") is **historical** — kept for the record. The
current state:

**Now functionally wired to the Processing Core (read + dispatch, verified):**
`/` CommandCenter, `/board`, `/scene/:id`, `/scenes`, **`/session`** (combat `combat.start/advance-turn/apply-resource`, dice `dice.roll`, handouts `session.deliver/revoke/acknowledge-handout`, lifecycle `session.set-workflow`, active-map `session.set-active-map`/`project-active-map`, now-playing `session.audio.*`), **`/characters`** (`character.quick-create`/`edit-field`/`set-combat`/advancement, `combat.start`), **`/atlas`** (`map.create`/`create-layer`/`set-layer-visibility`/`reorder-layer`/`create-poi`/`append-fog`), **`/knowledge`** (`content.create-item`/`update-item`/`set-item-visibility`/`remove-item`/`commit-import`), **`/campaign`** (read-only world model: characters/content/calendar), **`/audio`** (`audio.*` library + transport + scene-link), **`/graph`** (real graph/backlinks/health reads), **`/player`** (real sheet/resources), **`/settings`** (Appearance persisted + Players/Permissions `grant.*`/`player-group.*`, Sync, Complexity). Plus two NEW surfaces: **`/play`** (`PlayerView` — standalone chrome-less player companion) and **`/upgrade`** (`Upgrade` — plans/pricing).

**Honest stubs (no Core backing — labeled in-UI):** Community publish/wiki/discover, billing/account/subscription, AI-provider config, the map **pixel renderer** (ADR-014 — data/control layer is wired, painting is a stylized placeholder). *(2026-07-04: Extensions install/enable/disable/remove/upgrade are now real `widget.package.*` dispatches — only the community marketplace fetch remains a stub; Campaign factions are now a core `content.*` vault-object subtype.)*

**Verified this pass:** `typecheck` ✓ · `build` ✓ · 16/16 routes mount with 0 console errors · `verify-roundtrip` 11/11 · `verify-canvas` 13/13 · **UI-driven** (real button click → core op-log grew → survives reload): Characters New-character, Atlas New-map, Session Go-live, Knowledge New-note.

**Known empty-states out of the box (not bugs — features work, demo data is just unseeded):** ~~Session now-playing audio + handouts, Campaign timeline/backlinks~~ — **mostly closed (2026-06-23, see §0b)**. Remaining: Knowledge backlinks (needs `[[wikilinked]]` notes), and delivered handouts (intentionally unseeded — see §0b).

---

## 0b. 2026-06-23 UPDATE — deferred canvas design built + demo-seed enriched

The two items left open in §0 are now done.

**Deferred canvas work — BUILT (ported from prototype `inspector.jsx` + `widgets.jsx`):**
- **Per-type widget-body templates** — `src/app/widget-bodies.tsx` renders each widget's representative body on the scene canvas from its REAL `configuration` (note heading/body, dice formulas, timer `durationSeconds` as `mm:ss`, character HP/AC + ability chips, initiative round/turn, audio loop state, map dot-grid, quick-ref/prep row counts). Wired into `SceneBoardCanvas.WidgetFrame`, replacing the generic description block.
- **Tiered Inspector** — `SceneEditor.Inspector` is now data-driven: it renders the selected widget definition's declared `configFields` (`WidgetDefinition.configFields` — the core's own customization surface) as live controls (text/textarea/number/toggle/select/color), each round-tripped through `scene.configure-widget`. Text/number commit on blur (one op per edit, never per keystroke); toggles/selects commit immediately. Binding-backed content (map/character) shows a locked note; the tier badge distinguishes system vs template/custom. A `title` override now flows through `board-helpers` so a renamed widget shows its new title. **Verified UI-driven:** edit → persists in core → canvas body reflects it → survives reload.

**Demo-seed enriched (`src/runtime/demo-seed.ts`) — seeded through the REAL core dispatch path (persists to IndexedDB, survives reload like user content), NOT frontend mock:**
- **Campaign calendar + dated notes** → `content.define-calendar` ("Reckoning of Saltreach", 6 months) + 3 dated notes (`dateFields`) → the Campaign **Timeline** tab now renders 3 ordered, calendar-formatted entries (was empty).
- **Now-playing audio** → `audio.configure-source` (web-stream, declared cache ⇒ playback-enabled, no asset bytes needed) + `session.audio.play` → the Audio **now-playing** strip shows the playing track (was "Nothing playing"). The strip now resolves the source's display name instead of a raw id.
- Each new category has its own emptiness guard added to the early-return, so an existing vault backfills the new content; the swallowing `catch` is supplemented with a DEV warn so a mis-shaped datum surfaces.
- **Delivered handouts deliberately NOT seeded:** `session.deliver-handout` requires an `active` Session workflow; forcing the vault "live" on first load (no players connected) would be incoherent and would flip the Session "Go live" gate. An empty delivered-handout list with no live session is correct domain behaviour.

**Verified this pass:** `typecheck:react` ✓ · `build:react` ✓ · 16/16 routes (0 console errors) · `verify-ui` 4/4 (incl. Session **Go-live still passes** — the seed did not force an active session) · `verify-canvas` 13/13 · feature assertions (calendar/dated-notes/audio-track all landed in core state; inspector edit persists+reflects across reload) ✓.

**Still deferred:** onboarding flow; the seven legacy modals; Knowledge `[[backlinks]]` demo data; the map pixel renderer (ADR-014). App remains uncommitted (untracked worktree).

---

## 1. Verdict (HISTORICAL — 2026-06-20, superseded by §0)

**Not yet a usable tool.** The architecture is real and sound — but only **3 of 15 screens** are
functionally wired to the Processing Core. The other 12 render **static mock data** (`mockCampaign`)
with handlers that are no-ops or local-only component state. The two halves of the app read from two
different, disconnected data worlds, so **the app cannot hold a coherent campaign across screens**:
content you create on a wired screen never appears on the others, and everything the mock screens
show is fabricated and unsaveable.

As a *design prototype* (its stated purpose) it is strong: it builds, typechecks, every route mounts
clean, and the visual framework is cohesive. As an *actual usable tool* it is roughly **20%
functional** — a real spine (runtime + IndexedDB persistence + scene/board canvas) wrapped in a
non-functional skin.

### What is genuinely functional (verified)

| Area | Status | Evidence |
|------|--------|----------|
| Core runtime + IndexedDB persistence | ✅ Real | `SceneRuntime` → `dispatchCommand` → `persistFullState`; round-trip gate **11/11** |
| `/board` — spatial widget board | ✅ Wired | `Board.tsx` dispatches `command-center.ensure-home`, `scene.move/resize-widget`, presets; canvas gate **13/13** |
| `/scene/:id` — scene canvas editor | ✅ Wired | `SceneEditor.tsx` dispatches `scene.add-widget`/move/resize; survives reload |
| `/scenes` — scene list/create | ✅ Wired | `ScenesCreator.tsx` dispatches `scene.create`; lifecycle "Saved" affordance real |
| Settings → Appearance (theme/density/motion) | ✅ Wired + persistent | `Settings.tsx:37-39` writes `localStorage`; `index.html:14-48` restores before first paint |
| Route navigation (sidebar/topbar) | ✅ Wired | `react-router`; all links resolve |
| Build / typecheck / boot | ✅ Green | `pnpm build:react` ✓, `typecheck:react` ✓ (exit 0) |
| All 15 routes mount without errors | ✅ Verified | Smoke test 15/15, incl. unknown `/scene/:id` degrades gracefully |

### Method

Ran against the live dev server (`pnpm dev:react`, port 5273):
`typecheck:react` (PASS) · `build:react` (PASS) · `verify-roundtrip.mjs` (11/11) ·
`verify-canvas.mjs` (13/13) · a 15-route headless smoke test (15/15 mount, 0 page errors). Then
static cross-reference of every `src/screens/*.tsx` for `useRuntime`/`dispatch`/`mockCampaign`/no-op
handlers, and comparison of the live-play surfaces against their Svelte wiring reference in
`apps/gm/src`.

**Verification basis (be precise about it).** The two shipped gate scripts dispatch commands via the
DEV `window.__rt` handle, *not* by clicking the UI — so on their own they prove the *Core* accepts a
command, not that a *button* fires it. The "✅ Functional" rating for the 3 canvas screens therefore
rests on **code-reading** (their handlers genuinely call `runtime.dispatch`, unlike the mock screens'
`onClick={() => {}}`) **plus** one **UI-driven** check I ran for this audit: on `/board`, clicking
*Edit layout → Add → a widget entry* drove the home-scene widget count 7→8 and it survived reload, 0
errors. That makes `/board` end-to-end verified; `/scene/:id` and `/scenes` are verified by the same
code pattern but were not individually click-tested. The 12 "Mock" ratings rest on the inverse
evidence (no `dispatch`, no-op handlers).

---

## 1.5 Remediation progress (live)

> Updated as gaps are filled. Each ✅ was verified **UI-driven** (real click in Playwright → core
> state changed → survived reload), not just typecheck-green.

| Gap | Status | Verified by |
|-----|--------|-------------|
| C3 — Home wired to core | ✅ Filled | home renders real scenes/party/counts |
| H2 — `/board` reachable + scene rows → `/scene/:id` | ✅ Filled | sidebar scene row opens `/scene/:id`; Board in nav |
| H3 — ⌘K command palette | ✅ Filled | ⌘K opens palette → navigates to a scene |
| H4 — View-as / preview | ✅ Filled | Preview as Player → write rejected read-only |
| H5 — Projection / live session | ✅ Filled | Go live → `session.workflow=active` + persists |
| M1 — Global Toaster | ✅ Filled | `ToastViewport` mounted; actions confirm |
| L1 — Real nav counts | ✅ Filled | sidebar/library counts derive from core |
| C1 — Coherent campaign (mock→core) | 🟡 In progress | home/chrome now coherent; per-screen ongoing |
| C2 — Session live-play | ⬜ Next | — |
| M2–M9 screens | ⬜ Pending | — |

## 2. Severity scale

Anchored to the goal — *"an actual usable tool"* — not to visual polish.

- **🔴 Critical** — breaks the product premise. The app misleads the user about its own state, or its
  central job (running a live session) does not work at all.
- **🟠 High** — a major workflow is entirely unreachable or non-functional (creation, the live
  session controls, the command palette, preview/projection).
- **🟡 Medium** — a screen is browse-only: it shows data but cannot edit/persist it, or feedback is
  missing.
- **🔵 Low** — cosmetic / hygiene / accuracy nits that don't block use but mislead or add debt.

---

## 3. 🔴 Critical gaps

### C1 — Two disconnected data realities (no coherent campaign)
The 12 visual screens render **static `mockCampaign` globals** (`DNDData`, `DNDHub`, `DNDPlayer`, …),
while the runtime seeds **different** demo content into the real Core that only the 3 wired screens
read. These never meet. Concretely:
- Create a scene in `/scenes` (real) → it does **not** appear in the Command Center home tiles
  (`CommandCenter.tsx` reads `DNDData`/`DNDHub` mock — `CommandCenter.tsx:6`).
- The canvas gate proves `content.create-item` round-trips through Core, yet the **Knowledge** screen
  that should show notes reads mock and its editor is a no-op (`Knowledge.tsx:97-98,162-165`).
- The sidebar Scenes library lists `DNDHub.scenes` (mock) — a different set from the real scenes in
  `/scenes`.

**Impact:** nothing the user does on a real surface is reflected anywhere else; everything the mock
surfaces show is fiction. This is more disqualifying than any single button. **Fix:** point the
visual screens at `useRuntime()` + the actor-filtered Core queries (the README §"Porting a screen"
already specifies exactly this), deleting the `mockCampaign` reads.

### C2 — The live-play surface (Session) is entirely mock
`Session.tsx` is the product's whole premise — "the live scene: combat, dice, maps, what players
see." It has **`useRuntime=0`, `dispatch=0`**, 21 `onClick`s of which **6 are explicit no-ops**
(`Session.tsx:199,252,407,414,455,463`). Combat, initiative, dice, handouts, add-widget — all
render from mock and do nothing.
The Core fully supports this (`combat.start`, `combat.advance-turn`, `combat.hp`, `dice.roll`,
`encounter.build`, `session.deliver-handout`, … exist in `packages/core`), and the **Svelte app
wires it through 9 GUI components** (`CombatTracker.svelte`, `DiceTools.svelte`,
`EncounterBuilder.svelte`, `CharacterRoster.svelte`, …). The React port wires none.
**Impact:** you cannot run a session. **Fix:** wire `Session.tsx` to the combat/dice/session command
families, using the Svelte components as the spec.

### C3 — The home screen shows fabricated state
`CommandCenter.tsx` (`/`, the launcher hub) is documented in README as a "core-wired … surface," but
it has **`useRuntime=0`, `dispatch=0`** and reads `DNDData`/`DNDEdit`/`DNDGaps`/`DNDHub` mock
(`CommandCenter.tsx:6`). The "resume the live scene," scene tiles, prep gaps, and counts are all
fake. Its only real behavior is route navigation.
**Impact:** the first screen the user sees presents invented campaign status as if real — actively
misleading. **Fix:** wire to `resolveCommandCenterHome` / `listScenesForActor` (the README names
these), drop the mock.

### C4 — 11 of 15 screens cannot persist anything
Every section screen except the 3 canvas surfaces is browse-only against mock data; their edit
controls are no-ops or `useState` that resets on reload. A user who "edits" a character, toggles a
plugin, writes a note, or changes a permission loses it instantly and silently. (Detailed per-screen
in §6.) **Impact:** the app *looks* editable everywhere but is editable almost nowhere.

---

## 4. 🟠 High gaps

### H1 — All creation flows are dead ends
"New character/map/note/widget/scene" buttons either navigate to a screen that can't create, or are
no-ops:
- `CommandCenter` quick actions just `navigate()` (`CommandCenter.tsx:129-133`) to screens with no
  create capability.
- `Characters.tsx:179,182,242,245` (New/Edit/Import/Start combat) — all `onClick={() => {}}`.
- `Knowledge.tsx:162,165` (Import/New note) — no-op.
- `Atlas.tsx:55,58,95` (Edit/New map/Reveal) — no-op.
Only `/scenes` (`scene.create`) actually creates anything.

### H2 — `/board` and `/scene/:id` are unreachable from the UI
The genuinely-functional `/board` is **not linked from any screen or nav group** — reachable only by
typing the URL. `/scene/:id` is reachable only via `ScenesCreator` rows. The sidebar Scenes library
rows all `onOpen={() => go('session')}` → the **mock** `/session`, never the real `/scene/:id`
(`AppShell.tsx:309`). **Impact:** the app's best, working surfaces are hidden behind a dead navigation
seam. **Fix:** add `/board` to the IA; route sidebar scene rows to `/scene/:id`.

### H3 — ⌘K command palette is a no-op
The topbar/sidebar search affordance is `onClick={() => {}}` (`AppShell.tsx:252`), and there is no
keyboard handler for ⌘K anywhere. A `CommandPalette` DS component exists
(`src/ds/components/command/CommandPalette.jsx`) but is never mounted. **Impact:** the primary
navigation/action accelerator advertised in the topbar does nothing.

### H4 — "View as" / Preview is implemented in the runtime but unreachable
`SceneRuntime` ships `setActiveActor`, `enterPreview`, `exitPreview`, `actors`, and read-only
enforcement (verified by the round-trip gate's preview-rejection check). **No UI exposes any of it** —
the AppShell has no actor switcher and no preview toggle. **Impact:** the player-safe preview model,
a headline design principle, cannot be used.

### H5 — Projection (Project/Stop) is a fake local toggle
The topbar projection pill is `useState(true)` flipped by the button (`AppShell.tsx:391,484`); it
dispatches nothing and drives no real player view. **Impact:** "what players see" — core to a GM tool
— is purely decorative.

### H6 — All interaction-gated overlays are no-op launchers
Per PROTOTYPE.md §4 (Deferred): the 7 modals (newScene, addWidget, condPick, changePlan,
importWizard, migration, buildSystem), the full-screen scene creator, the onboarding flow, and the
Atlas map-builder are wired as no-op launchers. Their authentic source is documented but unbuilt.
**Impact:** every "advanced" entry point opens nothing.

---

## 5. 🟡 Medium gaps

| ID | Gap | Evidence |
|----|-----|----------|
| M1 | **No global Toaster** — every action that should confirm/undo is silent | PROTOTYPE.md §4; `Community.tsx:9`, `Player.tsx:10` |
| M2 | **Settings: only Appearance persists.** Account, Subscription, Players, Permissions, Vault, Sync, AI, Plugins, Systems are local `useState` over mock — toggles work visually, reset on reload, affect nothing | `Settings.tsx:93-95,419,448,479` |
| M3 | **Settings → Complexity** is local `useState('standard')`, not persisted and drives nothing | `Settings.tsx:51` |
| M4 | **Knowledge** editor / "push to players" / share are no-ops despite Core `content.*` working | `Knowledge.tsx:97-98,127` |
| M5 | **Characters** sheet is mock (the full MaraSheet renders but edits nothing); no draft/creation wiring | `Characters.tsx` (`useRuntime=0`) |
| M6 | **Audio** soundboard/scene-link no-ops though Core has full `audio.*` + `session.audio-*` state | `Audio.tsx:229` |
| M7 | **Player** sheet/resources/level-up/journal are mock and unsaveable | `Player.tsx` (`useRuntime=0`) |
| M8 | **Graph / Campaign / Community / Extensions** are static renders of mock; no real graph/query/install/publish | resp. `useRuntime=0`, 10 no-ops in `Extensions.tsx` |
| M9 | **Atlas** map list, layers, fog, POIs are mock; no map mutations though Core `maps.*` exists | `Atlas.tsx` (`useRuntime=0`) |

## 6. Per-screen functional status

| Screen | Route | Wired to Core? | Persists? | No-op buttons | Net status |
|--------|-------|:--:|:--:|:--:|------------|
| Board | `/board` | ✅ | ✅ | 0 | **Functional** (but unreachable in-app — H2) |
| SceneEditor | `/scene/:id` | ✅ | ✅ | 0 | **Functional** |
| ScenesCreator | `/scenes` | ✅ | ✅ | 0 | **Functional** |
| Settings (Appearance only) | `/settings` | ⚠ partial | ✅ appearance only | — | **Partial** (M2/M3) |
| CommandCenter | `/` | ❌ | ❌ | 0 (nav-only) | **Mock** (C3) |
| Session | `/session` | ❌ | ❌ | 6 | **Mock** (C2) |
| Characters | `/characters` | ❌ | ❌ | 4 | **Mock** |
| Atlas | `/atlas` | ❌ | ❌ | 3 | **Mock** |
| Campaign | `/campaign` | ❌ | ❌ | 0 | **Mock** |
| Knowledge | `/knowledge` | ❌ | ❌ | 5 | **Mock** |
| Graph | `/graph` | ❌ | ❌ | 0 | **Mock** |
| Audio | `/audio` | ❌ | ❌ | 1 | **Mock** |
| Extensions | `/extensions` | ❌ | ❌ | 10 | **Mock** |
| Community | `/community` | ❌ | ❌ | 0 | **Mock** |
| Player | `/player` | ❌ | ❌ | 0 | **Mock** |

## 7. 🔵 Low gaps

- **L1** — Sidebar nav counts are hardcoded strings (`"4 PCs · 23 NPCs"`, `"12 maps"`, `"38 notes"`)
  in `nav.ts`; they don't reflect real or mock state and will be wrong the moment data changes.
- **L2** — Single **1.47 MB** JS bundle (gzip 386 KB), no code-splitting (build warns >500 KB).
- **L3** — `src/runtime/mockCampaign.ts` is `@ts-nocheck`; mock data shapes are untyped.
- **L4** — `Section` titles/subtitles and library counts duplicated between `nav.ts` and screens.

---

## 8. Docs vs. reality

The in-repo docs describe the *design intent* and partly mask the wiring reality:

- **README** lists `CommandCenter.tsx` among "Core-wired canvas/data surfaces." It is **not** wired
  (`useRuntime=0`) — see C3.
- **PROTOTYPE.md §5** says "The visual reskin left the core wiring intact (both round-trip gates stay
  green)." True but easy to over-read: the gates only exercise the **3 wired screens** plus one
  Knowledge `content.create-item` dispatched *directly through the runtime in the test*, not through
  the Knowledge UI. Green gates ≠ a wired app.
- **PROTOTYPE.md §1** calls the app "a complete, functional prototype of the GM app." Accurate for
  *visual* completeness; for *functional* completeness it is 3/15 screens. The "Deferred" and "Known
  fidelity caveats" subsections are honest about individual pieces but the cumulative effect (most of
  the app is non-functional) isn't stated up front.

This document is intended to be the missing up-front statement.

---

## 9. Suggested remediation order

To get from "design prototype" to "usable tool," in dependency order:

1. **C1/C3 first** — wire `CommandCenter` to real Core queries and delete the mock seam, so the home
   reflects reality. This unlocks the coherent-campaign property everything else depends on.
2. **H2** — add `/board` to the IA and route sidebar scene rows to `/scene/:id` (cheap, big payoff:
   surfaces the working canvas).
3. **C2** — wire `Session` combat/dice/initiative/handouts to the Core command families (largest
   single effort; port from the Svelte GUI components named in §C2).
4. **M-series** — convert the browse-only screens (Characters, Knowledge, Atlas, Audio, Player) from
   `mockCampaign` reads to `useRuntime()` reads + dispatch, one screen at a time per the README's
   per-screen porting contract.
5. **H4/H5** — expose the runtime's existing view-as/preview and a real projection path in the
   AppShell.
6. **M1** — add a global Toaster so actions confirm.
7. **H3/H6** — build the ⌘K palette and the deferred modals/onboarding.
8. **L-series** — derive nav counts from state; code-split the bundle; type the mock/fixtures.

Each item is independently shippable and each gate (`typecheck:react`, `verify-roundtrip`,
`verify-canvas`) should stay green throughout.
