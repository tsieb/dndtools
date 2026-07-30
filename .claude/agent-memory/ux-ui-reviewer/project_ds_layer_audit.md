---
name: ds-layer-audit
description: FIXED-vs-OPEN split for visual/interactive defects in apps/gm-react/src/ds/components/** — which DS exports are dead, which token traps exist, and what is still broken as of run #10 (2026-07-30 @ 8fa95d31)
metadata:
  type: project
---

Design-system audit of `apps/gm-react/src/ds/components/**` + `src/ds/index.d.ts`.
NOTE: `screen-kit` lives at **`src/app/screen-kit.tsx`**, not `src/screens/` — task briefs cite the wrong path.

**How to apply:** these are STRUCTURAL classes; every consuming screen inherits them. Fix once in `ds/`,
not per-screen. Re-verify before reporting — this file has been wrong before.

## LIVE-vs-DEAD map (re-grepped 2026-07-30 @ 8fa95d31 — do NOT spend effort on the dead column)

**DEAD, zero consumers:** `core/Breadcrumb`, `core/Tooltip`, `navigation/NavSidebar`,
`map/LayerPanel`, `map/ToolPalette`, `map/FogControls`, `map/GenerationPanel`, `map/ImportWizard`,
`creature/StatBlock`, `domain/InitiativeRow`, `spell/SpellCard`. Also latent: `DataTable`'s
`sortable`/`onSort` (2 consumers, neither passes it) and `Chip`'s `onClick` branch (no live site).
⚠️ **`navigation/NavItem` is NOT dead** — `NavRail` (live at `app/AppShell.tsx:710`) imports it. My
earlier note claiming otherwise was wrong.

**LIVE:** NpcCard, QuestCard, SessionTimeline (Campaign) · ConditionBadge, ConditionTracker
(Characters) · AbilityScore · DiceResult (Session/PlayerView) · HPBar, StatPill, Stat, DefinitionList,
DataTable, ProgressMeter, Badge(139×), StatusDot, Skeleton, Avatar, Stepper, Sheet, NavRail,
BottomTabBar, SpellSlots, Minimap, POIMarker, POIPopover, LayerRow, LayerTypeBadge, MapCreationForm,
Checkbox, Slider(9×), SegmentedControl, Switch, Field, Input, Select, Button, IconButton, Card, Tabs,
Dialog, Popover, Toast, CommandPalette, EmptyState, Chip, VisibilityChip(33×).

## FIXED — do NOT re-report

- `Tabs` ARIA: `idBase` → `id` + `aria-controls`, `tabPanelProps()` exported, all 7 consumers wired.
- Radiogroups: `SegmentedControl` + `screen-kit`'s `Seg` both roving-tabIndex + Arrow/Home/End.
  (`SegmentedControl`'s Home/End trick `moveSelection(-1,1)` / `(0,-1)` is CORRECT — verified.)
- 24px targets: `Checkbox` (`:25-26`), `Switch` (`:34-35`), `Chip.onRemove` (`:55`),
  `ConditionBadge.onRemove` (`:85`), `Slider`'s `stepBtn` (`:110`) all use `var(--density-touch-target)`.
- `DataTable` NOW has the `maxWidth:100%; overflowX:auto` wrapper (`:16`).
- `POIMarker:39` uses `var(--color-text-inverse)` (was `#fff`).
- `Button` danger uses `var(--color-status-error-foreground)` — **that token now EXISTS in all 4
  themes + forced-colors** (colors.css 68/126/180/233/398).
- `Minimap` jump surface is a real `<button>` with arrow-key panning (`:41-59`).
- `VisibilityChip` normalizes core aliases (`player-visible`/`shared` → `players`).
- `Toast`: permanent live-region wrapper + pausable auto-dismiss (hover AND focus flags).
- `Popover`: `returnFocusRef` + body-first initial focus.
- `Button`/`IconButton`: truthy `aria-disabled` = soft disable; `IconButton` hover covers `outline`.
- `Input`/`Select`/`Textarea`: `composeFocus` — `{...rest}` no longer clobbers the ring handlers.
- `Dialog`: `backdropDismissible` prop; `initialFocus`; it is THE reference impl for modal a11y.
- `Field`: auto-`htmlFor`, `aria-required`, `aria-describedby` + `role="alert"` on error.
- `CommandPalette:572` `{n} results` is a `role="status"`.
- `Card`, `EmptyState`, `Skeleton`, `Badge`, `LayerTypeBadge`, `StatPill`, `Stat`, `Avatar`,
  `SessionTimeline`, `AbilityScore`, `HPBar` (all live sites show numerals) — read clean.

## STILL OPEN (run #10, ranked)

1. **`forms/Slider.jsx:19-20` — focus is effectively invisible.** `.dnds-range{outline:none}` plus
   `:focus-visible{box-shadow:0 0 0 3px var(--color-interactive-selected)}`. That token is
   `rgba(224,176,111,.16)`; composited over `--color-surface` #1f1810 it's ~**1.4:1** (need 3:1).
   The runtime-injected `<style>` (`ensureStyles`, appended to head) has EQUAL specificity to
   base.css's `:focus-visible` but later source order, so it kills the global 2px gold ring. Unlike
   `Input`/`Select`, the range has NO compensating border change. 9 live sliders.
2. **`Slider.jsx:21-24` thumb is 16×16** (WCAG 2.5.8). Worst at `screens/Session.tsx:1741` (track
   Volume) — no `steppers`, no paired number input, i.e. a lone slider, which the repo's own comment
   at `app/map/ToolOptionsBar.tsx:17` calls a WCAG 2.5.7 failure.
3. **`overlay/Sheet.jsx:52` opens focused on Close** — `panel.querySelector(FOCUSABLE)` in DOM order,
   header precedes children. Identical to the Popover bug already fixed. Sheet has no `initialFocus`
   prop. Live: `app/AppShell.tsx:788` (phone "All sections"), `:949`, MapEditor.
4. **`feedback/VisibilityChip.jsx:43-44` double-announces.** `<Icon label={l.label}>` is
   unconditional AND `{!compact && l.label}` prints it → "DM only DM only" on most of 33 sites.
   `ConditionBadge:70` does it right (`label={compact ? text : undefined}`).
5. **`Sheet.jsx:19` `SIDE_SIZE.bottom='88vh'`** — app measures itself with `--app-viewport-height:
   100dvh` (`styles/index.css:23`). UNVERIFIED on device; mobile-chromium has no dynamic URL bar so
   the gate can't catch it. Same class as `CommandPalette.jsx:244` (`max(14vh,…)`) / `:265` (`70vh`).
6. **`core/Tabs.jsx:50` hard-codes `aria-label="Sections"`** — all 7 tablists announce identically,
   incl. MapEditor's Selected/Layers/Assets/History dock (`app/map/MapEditor.tsx:445`). No consumer
   overrides via `{...rest}` (grep-verified). Also `:93-113` — Tabs have NO hover feedback and there
   is no global `button:hover` rule (`IconButton.jsx:46` says so explicitly).
7. **`campaign/QuestCard.jsx:60-70` objectives.** No `aria-pressed`/`aria-checked` — done-ness is
   strike-through + an aria-hidden Check only. AND `disabled={!onToggleObjective}` (`:62`) makes a
   read-only quest's whole checklist unreachable by keyboard. Live at `screens/Campaign.tsx:187`.
8. **`spell/SpellSlots.jsx:32-34` pips are 16×16, `rotate(45deg)`, `gap:var(--space-1)`** —
   adjacent sub-24px targets; a mis-tap spends the wrong slot. Characters.tsx:1224, Player.tsx.
9. **`condition/ConditionTracker.jsx:30-50`** add button ≈21px tall and its accessible name is just
   "Condition" (the `<Icon name="add">` at `:49` has no `label` ⇒ aria-hidden). Characters.tsx:1134.
10. **`data/DefinitionList.jsx:24,46`** `gridTemplateColumns:'auto 1fr'` + `whiteSpace:'nowrap'`
    labels — long labels can't shrink. Characters.tsx:1431, Player.tsx:764.
11. **`navigation/BottomTabBar.jsx:54-68`** the badge dot is `aria-hidden` with no text equivalent.
12. **`system/ProgressMeter.jsx:36`** `aria-label` only when `label` is a `string` ⇒ unnamed
    progressbar otherwise; no `aria-valuetext`, so the visible `valueLabel` isn't what's announced.
13. **`core/Stepper.jsx:12,24-25`** `nowrap` labels in a non-wrapping `<ol>` (MapBuilder.tsx:1329).
    UNVERIFIED at 375px.
14. **`campaign/NpcCard.jsx:28-29,40`** `onClick` + `cursor:pointer` on a bare `<article>`; only the
    heading button (`:59`) is keyboard-reachable.
15. **Unguarded enum maps degrade silently:** `core/Icon.jsx:526` (`GLYPHS[p] || Square` → a blank
    square for a typo'd name), `feedback/StatusDot.jsx:16` (`colors[status] || colors.idle`).
16. **`feedback/StatusDot.jsx:42-46`** re-emits its `@keyframes dndPulse` `<style>` per instance
    (10 sites). `Slider.jsx:13-31`'s `ensureStyles()` singleton is the in-repo pattern. Nit.
17. **`condition/ConditionBadge.jsx:73-77`** duration announces as a bare number ("Poisoned 3").
18. **`ds/index.d.ts:7`** — every export is `ComponentType<Record<string, unknown>>`, so `idBase`,
    `ariaLabel`, `label` etc. are unenforceable at compile time. Every regression above can silently
    reappear. Systemic, not visual.

## Token-layer landmines (read BEFORE writing any color/theme finding)

- **`--color-visibility-dm{,-subtle}` are UNDEFINED** yet written at 7 sites in
  `screens/PlayerView.tsx:281-285,1794-1799`, `screens/Player.tsx:2252-2253`, `screens/Community.tsx:640-641`.
  `1px solid var(<undefined>)` is an invalid shorthand ⇒ NO border at all on the DM-only banner.
  Real names: **`--color-dm-only-badge` / `--color-dm-only-subtle`**.
- `:root` `--layer-*` are LIGHT (tuned for the candle-lit map well); only `[data-theme='parchment']`
  re-cut them DARK. A white glyph on them breaks in the DEFAULT theme, not parchment.
- `--color-interactive-selected` (16% alpha) is a SELECTION wash, NOT a focus color. Anything using
  it as a focus ring fails 1.4.11/2.4.11. The real ring is `--focus-ring-{width,offset,color}`
  (2px / 2px / `--color-interactive-focus-ring` #e0b06f), applied globally by `base.css:36-39`.
- `--density-touch-target` = 2rem desktop / 2.75rem touch / 1.75rem compact (spacing.css:107/119/131).
- z-index IS fully tokenized (`--z-base`…`--z-dm-boundary`); `[data-motion]` in `styles/index.css`
  globally zeroes animation, so per-component `prefers-reduced-motion` is genuinely unneeded.
- The legacy alias bridge (`colors.css:319-328`: `--bg/--fg/--card/…`) has ZERO consumers. Dead.
- `--color-bg` IS defined in all themes (Avatar's ring gap is fine).

## e2e coupling
No spec in `apps/gm-react/tests/e2e/` locks any of the labels above: greps for `getByRole('tablist'`,
`'All sections'`, `'DM only'` (as an accessible name), `role('slider')`, `'Minimap'`, `'Jump viewport'`
all come back empty. `onboarding-consent.spec.ts` / `settings.spec.ts` DO lock radiogroup names
("Vault privacy mode", "Experience complexity") — don't rename those.

See [[gm-react-ds]], [[completion-pass-ux-patterns]], [[onboarding-viewas-cluster]].
