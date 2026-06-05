# SRCH-quick-switcher-and-command-discovery — Completion Evidence

Epic: `SRCH-quick-switcher-and-command-discovery` — SRCH: Quick switcher and command discovery
Requirement IDs: SRCH-002
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 3 (Role, Visibility &
Permission Grant Model); the standing v2 architecture contracts + ADR-014.
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic SRCH-quick-switcher-and-command-discovery`.

## Summary

This epic adds the SRCH-002 QUICK SWITCHER: title-first navigation across VISIBLE content AND COMMANDS. It
COMPOSES the two surfaces the rest of SRCH/CMD already own — it adds NO second index and NO second command
registry, and re-derives NO visibility/permission/ranking policy:

- NAVIGATION entries come from `searchVaultForActor` (`queries/search-query.ts`, SRCH-001/003) — THE single
  actor-filtered visible search index over notes, structured objects, map POIs, handouts, and session
  artifacts. Every candidate is already visibility-filtered at its source (Cross-Contract Non-Negotiable 2),
  so a `dm-only`/hidden target is never even a candidate. The switcher re-uses that read's TITLE-FIRST
  scoring: a title match (score 2) outranks a body/relationship-only match (score 1) — SRCH-002 AC1.
- COMMAND entries come from `listPaletteCommands` (`queries/command-availability.ts`, CMD-008/NAV-008/
  NAV-010) — THE single actor-filtered command availability API the command palette and primary nav already
  consume. It fails closed: a non-permitted actor NEVER receives a DM-only command, a hidden scene/section
  command, or a command whose label/target would reveal hidden content — those entries are ABSENT, not
  disabled (SRCH-002 AC3). A present-but-blocked DM command (e.g. save-preset with no home configured)
  carries only a generic, non-leaking reason and is rejected by the core on resolve, so it can never fire.

The new Processing-Core read `buildQuickSwitcher` merges both surfaces into one deterministically ordered,
title-first entry list. `resolveQuickSwitcherEntry` resolves a CHOSEN entry from its OWN current descriptor
(a navigation route, or — re-using `resolvePaletteCommand` — the IDENTICAL `CoreCommand` a visible control
dispatches). The GUI renders the computed entries and either navigates or dispatches; it owns no ranking, no
visibility, and no command policy (Architecture Contract 1).

### Visibility / permission / data-safety design (the load-bearing contract)

- A `dm-only` note/object/POI/handout/secret-roll is never a navigation candidate — it is omitted at its
  actor-filtered search source, so a player never sees a hidden hit, a hidden title, or a count revealing one
  (SRCH-002 AC3). The hidden title appears NOWHERE in the player's serialized switcher (asserted by a JSON
  no-leak test).
- A DM-only command (Create Scene, Save/Apply Command Center preset, Add widget) is ABSENT from a non-DM's
  switcher — `listPaletteCommands` returns the actor-filtered list and `listCommandActions` returns `[]` for
  any non-scene-author actor, so the entries are absent, not disabled (SRCH-002 AC3). The DM-only Scenes
  navigation section is likewise absent for players (NAV-010). The serialized player switcher never mentions
  a DM-only command label.
- COMMAND-ELIGIBILITY FAIL-CLOSED ON INVOCATION: even when a command IS shown (a valid-but-blocked DM
  command), `resolveQuickSwitcherEntry` → `resolvePaletteCommand` returns `null` for any `unavailable`
  command or any command missing a required input, so a disabled/stale selection can NEVER dispatch a command
  a disabled control could not. The core re-validates actor/permission on dispatch regardless.
- STALE-SELECTION SAFETY (SRCH-002 AC2): an entry is resolved from the entry the user is acting on RIGHT NOW,
  never from a remembered index. The GUI derives the active selection from the CURRENT entry list (recomputed
  on every keystroke) and clamps the highlight, so a query change between keystroke and Enter executes the
  current selection, not a stale one.
- An unknown/unauthenticated actor receives an EMPTY switcher from BOTH composed surfaces (fail closed).

### Processing-Core addition (composes existing reads; no parallel index/registry)

- `apps/v2/packages/core/src/queries/quick-switcher-query.ts` — `buildQuickSwitcher(state, actorId, context,
  query, options?)`: the actor-filtered, title-first quick-switcher entry list. Navigation entries project
  `searchVaultForActor` hits (preserving its title-first score + deterministic order, capped); command
  entries wrap `listPaletteCommands` results (title/keyword matched, title-first). The merged list is ordered
  by score desc → navigation-before-command → id (stable tie-break). `resolveQuickSwitcherEntry(entry,
  input?)` resolves a chosen entry to a navigate route or — via `resolvePaletteCommand` — the identical
  resolved palette command; returns `null` for an unavailable/unfilled command (fail closed).
- `apps/v2/packages/core/src/index.ts` — exports `buildQuickSwitcher`, `resolveQuickSwitcherEntry`, and the
  `QuickSwitcher*` / `ResolvedQuickSwitcherEntry` types.

### GUI

- `apps/v2/app/src/lib/gui/QuickSwitcher.svelte` — the visible quick switcher: a modal combobox with a
  `role="combobox"` search input owning a `role="listbox"` of `role="option"` entries. It renders the
  computed `buildQuickSwitcher` list for the active "view as" actor + current query and either navigates
  (`goto`) or dispatches the resolved core command (`runtime.dispatch`). Global Cmd/Ctrl+P opens it (distinct
  from the command palette's Cmd/Ctrl+K); a header "⌘P Go to" button makes it reachable on touch profiles
  (SRCH-002 Mobile: yes). Keyboard: ArrowUp/Down move the active descendant (announced via
  `aria-activedescendant` + `aria-selected`), Enter runs the CURRENT entry, Escape closes (locally + globally,
  pointer-free). On a compact profile it renders as a full-screen sheet (`data-profile="compact"`). Read
  paths render the computed model; writes dispatch command intents only (Contract 1).
- `apps/v2/app/src/routes/+layout.svelte` — mounts `<QuickSwitcher />` in the primary header next to the
  command palette, so it is globally available across every route.

### Persistence / offline / sync

No new durable state, no migration. The switcher is a PURE local computation over already-durable
actor-filtered reads (content, maps, session, scenes, command-center, widgets, permissions), so it is fully
available offline (local-first) and identical on every restart. No new sync operations.

## Tests (primary evidence)

- `apps/v2/packages/core/tests/quick-switcher.test.ts` (14 tests) — fail-closed empty (unknown actor, empty
  and non-empty query); usable empty-query default (visible content + eligible commands); AC1 (a title hit
  outranks a body-only hit with score 2 vs 1; navigation entries rank above commands at equal score;
  deterministic across repeated runs); AC2 (a navigation entry resolves to its route; a command entry
  resolves to the SAME `command-center.save-preset` core command a visible control dispatches AND the core
  accepts it; resolving from the CURRENT entry never fires a stale selection after the query changes; a
  command missing its required input resolves to null; a present-but-`unavailable` command resolves to null);
  AC3 (a dm-only note absent for a player with a JSON no-leak assertion; a dm-only demo POI never a player
  entry; DM-only commands ABSENT — not disabled — for player AND observer, with no leaked label; the player
  switcher is profile-independent for non-widget entries).
- `apps/v2/app/tests/e2e/quick-switcher.spec.ts` (7 tests × 2 projects = 14 instances; 11 run + 3
  project-scoped skips) — full Playwright on BOTH desktop-chromium AND mobile-chromium: AC1 (a title match
  ranks before a body-only match in the rendered list); AC2 (selecting a content entry navigates to its
  section; KEYBOARD-ONLY: Ctrl+P opens, ArrowDown moves the active descendant to the second result,
  Enter runs the CURRENT selection — desktop; Escape closes without navigating — desktop); AC3 (a dm-only
  note absent for a player and its title never leaks → empty state; DM-only "Create Scene" command absent —
  not disabled — for a player); compact-profile sheet exposes the same entries and navigates (mobile).
  Accessibility/keyboard coverage: the combobox `aria-activedescendant`/`aria-selected` wiring is asserted in
  the keyboard-only test; Escape dismissal is asserted; the compact sheet `data-profile="compact"` is
  asserted.

### Commands run (results)

- `pnpm --filter @dndtools/v2-core test` — PASS (122 files, 1688 tests; +14 new quick-switcher tests).
- `pnpm v2:typecheck` — PASS (core `tsc --noEmit` 0 errors; app `svelte-check` 0 errors / 0 warnings,
  805 files).
- `pnpm v2:lint` (boundary) — PASS (no v1 runtime imports; core has no Svelte/DOM/GUI imports).
- `pnpm lint` (FULL: `eslint .` + `lint:navigation` + `lint:tokens` + `audit:repo`) — PASS.
- `pnpm docs:validate` — PASS (includes the v2 workpack validator).
- `pnpm v2:workpack:validate` — PASS (before and after `set-status active` and `complete`; no drift).
- `pnpm e2e` (from `apps/v2/app`, BOTH desktop-chromium AND mobile-chromium, WHOLE suite) — PASS: 481 passed,
  21 intentional project-scoped skips, 0 failed (base was 470 passed / 18 skipped; +11 passed + 3 skipped =
  +14 instances from the 7 new tests across the two projects). One transient `toBeEnabled` flake (a
  pre-existing CMD test, NOT in this epic's spec) appeared once under 7-worker combined-project load and
  passed on re-run and in per-project isolation (desktop 246 passed; mobile 235 passed).

## Traceability (SRCH-002 → code + tests)

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| AC1 — a title match ranks above a body-only match | `buildQuickSwitcher` preserves `searchVaultForActor`'s title-first score (`navigationEntries`/`compareEntries` in `apps/v2/packages/core/src/queries/quick-switcher-query.ts`) | `apps/v2/packages/core/tests/quick-switcher.test.ts` (title-vs-body score; nav-before-command; determinism), `apps/v2/app/tests/e2e/quick-switcher.spec.ts` (title ranks before body in the rendered list) |
| AC2 — Enter executes the current selection; stale selection state is not used | the GUI derives the active selection from the CURRENT list + clamps the highlight; `resolveQuickSwitcherEntry` resolves from the entry's own descriptor (`apps/v2/app/src/lib/gui/QuickSwitcher.svelte` + `apps/v2/packages/core/src/queries/quick-switcher-query.ts`) | `apps/v2/packages/core/tests/quick-switcher.test.ts` (resolves current not stale; route + identical core command; null on unfilled/unavailable), `apps/v2/app/tests/e2e/quick-switcher.spec.ts` (keyboard ArrowDown → Enter runs the CURRENT entry) |
| AC3 — a player never discovers DM-only commands, hidden entity targets, or hidden command labels/ids/counts | navigation candidates from the actor-filtered `searchVaultForActor`; command candidates from the fail-closed `listPaletteCommands`/`listCommandActions`; both omit hidden/DM-only entries ENTIRELY; `resolveQuickSwitcherEntry` rejects any `unavailable` command (`apps/v2/packages/core/src/queries/quick-switcher-query.ts`) | `apps/v2/packages/core/tests/quick-switcher.test.ts` (dm-only note absent + JSON no-leak; dm-only POI absent; DM-only commands absent for player+observer; profile-independent), `apps/v2/app/tests/e2e/quick-switcher.spec.ts` (dm-only note absent + empty state; Create Scene absent for player) |
| Processing/Display decoupling | GUI renders the computed entry list + navigates/dispatches command intents only (`apps/v2/app/src/lib/gui/QuickSwitcher.svelte`); ranking/eligibility live in the core (`buildQuickSwitcher`) | `apps/v2/app/tests/e2e/quick-switcher.spec.ts` (dispatches the same core command as a visible control via the resolved palette command) |

## Demo path

1. `pnpm v2:dev`, open `/knowledge/`.
2. As the DM, create two player-visible notes: "Dragon Cult" (body "Followers gather in shadow.") and
   "Harbor Watch" (body "A dragon was sighted offshore.") — Save each. Create one dm-only note "Secret
   Ritual".
3. Press Cmd/Ctrl+P (or click "⌘P Go to" in the header) to open the quick switcher. Type "dragon": "Dragon
   Cult" (title match) ranks ABOVE "Harbor Watch" (body-only match) — SRCH-002 AC1.
4. Press ArrowDown to highlight "Harbor Watch", then a different query, then Enter — the CURRENT selection
   is executed, never the stale one (SRCH-002 AC2). Selecting a content entry navigates to its section
   (Knowledge); a command entry (e.g. "Create Scene", "Save Command Center preset") dispatches the SAME
   Processing Core command the visible control uses.
5. Use the header "View as" control to switch to "Test Player", open the switcher, and type "ritual": the
   dm-only "Secret Ritual" is ABSENT (empty state), and its title appears nowhere. Type "create scene": the
   DM-only "Create Scene" command is ABSENT — not disabled (SRCH-002 AC3).
6. On a narrow viewport / mobile profile, the switcher opens as a full-screen sheet exposing the same
   entries (SRCH-002 Mobile: yes).

## Quality review

- Correctness: all three SRCH-002 acceptance criteria implemented + unit + e2e covered (title-first ranking,
  current-selection execution with stale-safety, and full fail-closed absence of hidden content/commands).
- Architecture: a pure Processing-Core read composed from the EXISTING actor-filtered search index
  (`searchVaultForActor`) + command-availability surface (`listPaletteCommands`) — no second index, no second
  command registry, no re-derived visibility/permission/ranking. The GUI renders the computed model and
  navigates/dispatches intents. Boundary lint green; no v1 runtime imports; core imports no Svelte/DOM.
- Tests: unit (fail-closed, AC1–AC3, no-leak, determinism, command-eligibility) + e2e on both profiles incl.
  keyboard-only and accessibility coverage.
- Accessibility: a labelled `role="combobox"` input controlling a `role="listbox"` of `role="option"`
  entries with `aria-activedescendant`/`aria-selected`; full keyboard operation (Ctrl/Cmd+P open, Arrow
  navigation, Enter run-current, Escape close locally + globally); a header trigger so touch profiles are
  not shortcut-only; a compact full-screen sheet on slim profiles; a `role="status"` live region for
  run/unavailable feedback. svelte-check reports 0 a11y warnings.
- Performance: pure O(visible content + visible POIs + eligible commands) work over already-computed
  actor-filtered reads per keystroke; the navigation list is capped (default 25) so a large vault never
  produces an unbounded list. No new work on the dispatch hot path.
- Security/permissions: every navigation candidate is actor-filtered before search; every command candidate
  is actor-filtered before listing; DM-only commands/targets are absent (not disabled); a shown-but-blocked
  command is rejected on resolve AND re-validated by the core on dispatch; an unknown actor receives empty
  (fail closed); the serialized player switcher carries no hidden title or DM-only command label.
- Persistence: no new durable state and no migration — a pure read over existing durable slices.
- Sync/offline: a pure local computation, fully available offline; no new sync operations.
- UX: empty state for "no matching content or commands"; per-entry kind tag (content type / "command");
  non-leaking reason text for a shown-but-unavailable command; keyboard + pointer + touch parity.
- Maintainability: one small typed query module + one read-only-ish GUI; re-uses the shared `SearchFilter`,
  `PaletteCommand`, and `resolvePaletteCommand` (no duplication); no speculative abstractions; no unrelated
  refactors.
- Docs: this completion doc; the module/GUI docs cite SRCH-002, the composed reads, and the title-first +
  fail-closed + stale-safety contracts.

## Known gaps / deferred items

- The switcher routes a chosen content/POI/handout/session-artifact hit to the SECTION that owns its domain
  (Knowledge for content, Atlas for POIs, Session for handouts/artifacts) — the same canonical route roots
  the navigation registry declares. DEEP-LINK-PRECISE focusing WITHIN a section (focus a specific POI on the
  map viewport, scroll to a note heading) is owned by NAV-route-aliases-and-deep-links (SRCH-007); the
  switcher's job per SRCH-002 is title-first navigation TO the visible target, which it delivers. When the
  content/note deep-link branch lands in `resolveDeepLink` (currently `not-cached` for note/object), the
  switcher can pass a precise selection without changing its contract.
- The switcher uses a DISTINCT global shortcut (Cmd/Ctrl+P) from the command palette (Cmd/Ctrl+K). Both
  surfaces coexist: the command palette (CMD-008/NAV-008) is the command-action surface; the quick switcher
  (SRCH-002) is the title-first content+command navigation surface. They share the SAME underlying
  actor-filtered command list (`listPaletteCommands`) and search index, so there is no duplicated policy.
- POIs/handouts/session-artifacts carry no separate per-item route parameter in the current model, so they
  navigate to their section root; a later MAP/SES epic that adds per-entity deep-link params flows through
  the same `routeForHit` mapping.

## Stop conditions

None hit. ADR-014 supports the approach (a Processing-Core read over actor-filtered reads, browser-local,
SvelteKit GUI); no v1 runtime imports were required; the permission/visibility model was unambiguous (every
navigation candidate is an existing actor-filtered read; every command candidate is the existing fail-closed
command-availability list; command-eligibility fails closed both by absence and on invocation); the generated
workpack validates; and the working tree showed no unrelated overlapping changes.

## Git

Branch: `epic/SRCH-quick-switcher-and-command-discovery` (chained off the prior epic tip
`epic/SRCH-local-indexes-and-freshness` @ `27e1d2e`, per the v2 epic-branching convention — NOT from master).
Commit SHA (feat): `e755ccf` (`feat(v2): complete SRCH-quick-switcher-and-command-discovery epic`).
The completion-evidence SHA is recorded by the follow-up `docs(v2): record commit SHA …` commit.

### Final `git status --short`

After the completion `feat` commit and the SHA follow-up, the working tree is clean:

```
(empty — clean working tree)
```
