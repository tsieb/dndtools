# UX-SHELL-command-surface-and-shortcuts — Completion Evidence

UX workpack status: `complete`

Epic: **UX-SHELL-command-surface-and-shortcuts** — Command Surface, Search Entry, and Shortcuts
Phase 02 (Shell and Navigation), P0. Requirements: **UX-NAV-014, UX-NAV-019, UX-SRCH-001, UX-SRCH-005**.

This is Phase 02's final epic. It extends the existing actor-filtered command palette and quick
switcher into the global keyboard/touch command surface, adds the global keyboard-shortcut registry
(with a searchable help panel and inline palette hints), and introduces the global search overlay —
reusing the established a11y primitives (focus-trap, the shared live region), platform-profile
patterns (compact sheets), and the single actor-filtered command/search reads in `@dndtools/v2-core`.

## Demo notes (Desktop / Tablet / Mobile)

- **Command palette (UX-NAV-014).** `Ctrl/Cmd+K` (Desktop/Tablet w/ keyboard) or the top-bar
  `⌘K Actions` button (all profiles) opens the palette. The field is focused on open and **Recent**
  destinations are shown before typing. Results are grouped by type (Navigate / Scenes / Act /
  Settings…), keyboard-navigable (`↑/↓`, `Enter`), and each navigation row shows its shortcut hint
  (e.g. `Alt + 2`). First `Escape` clears the text, second `Escape` closes and restores focus to the
  opener. A disabled result (e.g. "Save preset" before the Command Center is set up) shows its reason,
  is not executed on `Enter`, and the reason is announced. On Mobile/Tablet-portrait the same palette
  renders as a full-screen sheet (`data-profile="compact"`) exposing the identical commands.
- **Global shortcuts registry (UX-NAV-019).** `Alt+4` → Atlas (only when no text input is focused);
  `Alt+1..7` map to the visible global sections, `Alt+Shift+H` → Command Center, and the DM-only
  `Alt+Shift+S` → Scenes. `?` / `F1` opens the **searchable** keyboard-shortcuts panel (grouped by
  Command surface / Navigation / Shell / Overlays / Canvas); typing filters across keys, action,
  scope, and group. The registry is built from the same actor-filtered nav + command data the palette
  uses, so a player/observer panel omits DM-only shortcuts entirely.
- **Global search overlay (UX-SRCH-001).** `Ctrl/Cmd+Shift+F` or the top-bar `⌘⇧F Search` button opens
  the overlay. The scope chip "All visible content" is shown before typing and the field is focused.
  Queries of 1–2 chars show "Keep typing for results…"; ≥3 chars render results grouped by type
  (Notes / Objects / Map points / Handouts / Session) with per-group counts, debounced ~300 ms, and
  the visible count is published to a polite `role="status"` region. Two-stage `Escape`. Full-screen
  sheet on Mobile.
- **Quick switcher (UX-SRCH-005).** `Ctrl/Cmd+O` (changed from the prior `Ctrl/Cmd+P`) or the
  `⌘O Go to` button. Title-first ranking (title matches above body-only matches). A pre-query
  "Recent" caption; a `>` prefix switches to **command mode** (caption "Commands"), listing only
  commands — never entity titles. Full-screen sheet on Mobile.

Tablet uses the Desktop overlay layout in landscape and the compact sheet layout in portrait (shared
`profile.isCompact` / `viewportClass` plumbing); no Tablet-specific code path is required.

## Actor-safety / no-leak cases tested (DM vs player vs observer)

- **Palette:** DM-only commands (`scene.create`, `nav.scenes`, Command Center presets) are absent for
  players — not disabled — and their labels never appear (existing palette-nav e2e, still green).
- **Quick switcher:** a `dm-only` note title and the DM-only `Create Scene` command are absent for a
  player in both normal and `>` command mode; serialized results never contain the hidden labels.
- **Global search:** a player whose term matches only DM-hidden content sees the exact same
  zero-result state as a term matching nothing — no result row, no group, no count. Counts derive from
  the single actor-filtered `searchVaultForActor` read, so a hidden hit can never inflate a facet.
- **Shortcut registry:** the DM-only Scenes shortcut is present for a DM and absent for player/observer
  (unit + e2e help-panel AC4); an observer gets fewer nav shortcuts than a DM.

## Requirement → implementation → test traceability

- **UX-NAV-014** (command palette global surface + mobile menu) →
  `apps/v2/app/src/lib/gui/CommandPalette.svelte` (recents, grouped results, arrow/Enter keyboarding,
  two-stage Escape + focus restoration via the shared focus-trap, disabled-result announce, shortcut
  hints, compact sheet) wired in `apps/v2/app/src/routes/+layout.svelte` (`recent`, `shortcuts` props) →
  `apps/v2/app/tests/e2e/command-surface-shortcuts.spec.ts` (AC1/AC3/AC5),
  `apps/v2/app/tests/e2e/command-palette.spec.ts`,
  `apps/v2/app/tests/e2e/command-palette-nav.spec.ts` (actor filtering + AC2/AC3 unchanged-green).
- **UX-NAV-019** (global shortcuts registry) → `apps/v2/app/src/lib/navigation/shortcuts.ts`
  (`buildShortcutRegistry`, `shortcutHintForRoute`, `searchShortcuts`),
  `apps/v2/app/src/lib/gui/HelpTrigger.svelte` (searchable grouped panel),
  `apps/v2/app/src/lib/gui/CommandPalette.svelte` (row hints),
  `apps/v2/app/src/routes/+layout.svelte` (`Alt+<n>`/`Alt+Shift+H`/`Alt+Shift+S` with a text-entry
  guard) → `apps/v2/app/tests/unit/shortcuts.test.ts`,
  `apps/v2/app/tests/e2e/command-surface-shortcuts.spec.ts` (AC1/AC2/AC3/AC4),
  `apps/v2/app/tests/e2e/help-and-interaction-primitives.spec.ts` (unchanged-green).
- **UX-SRCH-001** (global search overlay) → `apps/v2/app/src/lib/gui/GlobalSearch.svelte`
  (composes `searchVaultForActor`, scope chip, debounced grouped results, no-leak zero state,
  `role="status"` count, compact sheet) wired in `apps/v2/app/src/routes/+layout.svelte` →
  `apps/v2/app/tests/e2e/global-search.spec.ts` (AC1/AC2/AC3).
- **UX-SRCH-005** (quick switcher) →
  `apps/v2/packages/core/src/queries/quick-switcher-query.ts` (`parseQuickSwitcherQuery` + `>`
  command-mode in `buildQuickSwitcher`) and `apps/v2/app/src/lib/gui/QuickSwitcher.svelte`
  (`Ctrl/Cmd+O`, "Recent"/"Commands" caption) →
  `apps/v2/packages/core/tests/quick-switcher.test.ts` (SRCH-005 command-mode block) and
  `apps/v2/app/tests/e2e/quick-switcher.spec.ts` (`>` command-mode + Ctrl+O).

## Tests run

- Targeted unit (vitest): `apps/v2/packages/core/tests/quick-switcher.test.ts` **18 passed** (incl.
  new `>` command-mode + parse cases); core targeted batch (quick-switcher, command-availability,
  command-actions, search-filters, search-ranking-context, navigation-view, navigation-sections)
  **103 passed**; `apps/v2/app/tests/unit/shortcuts.test.ts` **8 passed**; full app unit suite
  **296 passed (38 files)**.
- E2E (Playwright) epic-owned + directly-affected specs: **desktop-chromium** command-surface +
  global-search + quick-switcher + command-palette + command-palette-nav + help **33 passed**;
  **mobile-chromium** same set **25 passed** (keyboard-only cases skipped per profile convention).
- Full Playwright suite on **both** desktop-chromium + mobile-chromium: **~621–624 passed, 31 skipped**
  per run; the only repeatable failure is the **pre-existing**
  `apps/v2/app/tests/e2e/character-creation-and-drafts.spec.ts` `CHAR-002` on mobile-chromium (a
  durable draft-resume reload assertion), which **also fails on the clean pre-change tree** (verified
  by `git stash`), plus a small number of unrelated character/content specs that flake under parallel
  IndexedDB contention but **pass in isolation**
  (`apps/v2/app/tests/e2e/character-party-and-player-records.spec.ts`,
  `apps/v2/app/tests/e2e/content-visibility-and-embeds.spec.ts`). None touch the command surface,
  search, or shortcuts.
- Gates: `pnpm lint` (eslint + nav-layer + tokens + non-text contrast + repo audit) **passed**;
  `pnpm a11y:axe` (8 routes × 2 profiles) **16 passed** (overlays are not in the DOM at rest, the
  scanned state stays clean); app `typecheck` (svelte-check) **0 errors / 0 warnings**; core
  `typecheck` clean; `pnpm docs:validate` **passed**; `pnpm v2:ux-workpack:validate` **passed**.

## Known gaps / deferrals

- Global search debounce min-query is 3 chars (per UX-SRCH-001 "≤2 chars: keep typing"); 1–2-char
  searches intentionally show the hint, not results.
- Search result rows are a condensed two-line variant (title + snippet + type); the full three-line
  result anatomy with source badges and inline preview/copy actions (UX-SRCH-002/004) is owned by the
  dedicated search-surface epics, not this shell epic.
- Axe is asserted against the at-rest routes (overlays closed), consistent with the existing gate;
  overlay-open axe scanning is not part of the automated register.
- One repeatable, pre-existing, unrelated mobile failure (`CHAR-002`) remains in the full suite, proven
  to pre-date this epic.

## Git

- Branch: `ux/UX-SHELL-command-surface-and-shortcuts` (off `ux/UX-SHELL-actor-filtered-nav-recents` @ 225f465).
- Commit: recorded at handoff (see final report).

Final `git status --short` (before the completion commit; the listed files are committed together):

```
 M apps/v2/app/src/lib/gui/CommandPalette.svelte
 M apps/v2/app/src/lib/gui/HelpTrigger.svelte
 M apps/v2/app/src/lib/gui/QuickSwitcher.svelte
 M apps/v2/app/src/routes/+layout.svelte
 M apps/v2/app/tests/e2e/display-preferences.spec.ts
 M apps/v2/app/tests/e2e/quick-switcher.spec.ts
 M apps/v2/packages/core/src/index.ts
 M apps/v2/packages/core/src/queries/quick-switcher-query.ts
 M apps/v2/packages/core/tests/quick-switcher.test.ts
 M docs/planning/v2/ux/epics/UX-SHELL-command-surface-and-shortcuts.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
?? apps/v2/app/src/lib/gui/GlobalSearch.svelte
?? apps/v2/app/src/lib/navigation/shortcuts.ts
?? apps/v2/app/tests/e2e/command-surface-shortcuts.spec.ts
?? apps/v2/app/tests/e2e/global-search.spec.ts
?? apps/v2/app/tests/unit/shortcuts.test.ts
?? docs/planning/v2/ux/epics/UX-SHELL-command-surface-and-shortcuts.completion.md
```
