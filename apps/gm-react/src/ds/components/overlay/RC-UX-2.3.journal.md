# RC-UX-2.3 run journal

- Scope: overlay primitives and repository tabindex lint. Per-screen POL fixes and core/Menu
  changes are outside ownership. No dispatcher edits, delegation, push or promotion.
- Audit: Dialog/Sheet provide title IDs, focus return, Escape layers, Android Back registration,
  modal isolation and scroll locking. Toast is a live region; Tooltip is a noninteractive
  description, so neither should trap focus or use dialog labelling.
- Fixed Tab eligibility (negative tabindex, hidden ancestors, disabled fieldsets), nested overlay
  ownership and focus entry from the panel itself.
- Added repository lint for positive JSX tabindex, object props, DOM assignment and setAttribute.

## Review round 2 — three changes on top of `1f7d0f59`

The first attempt gated **Tab** on `ownsEscape`. That was wrong: Escape belongs to the innermost
open layer of any kind, but Tab containment belongs to the innermost layer that actually implements
a trap. `ds/components/core/Popover.jsx` handles Escape, an outside pointerdown and Android Back —
no Tab trap — so a popover nested inside a Dialog/Sheet took Tab and let it walk out of the modal.
The live path is the phone map editor: `app/map/MapEditor.tsx:1066` opens the "Map panels" Sheet,
and `app/map/dock/LayersPanel.tsx:253` renders a layer-row menu as an inline Popover inside it.

1. **Separate trap ownership from escape ownership.** `overlay/focus.js` now carries a second,
   narrower registry — `pushTrapLayer` / `popTrapLayer` / `ownsFocusTrap` — that only Dialog and
   Sheet join. Tab is gated on `ownsFocusTrap`, Escape still on `ownsEscape`. A nested popover or
   menu therefore leaves the trap intact; a genuinely nested Dialog/Sheet still takes it over.
   Entry focus moved to the same gate, plus an explicit "focus is already inside this panel" check
   — so a nested flyout that focused one of its own controls keeps it, while a flyout with nothing
   focusable no longer costs the overlay its own entry focus.
2. **Wrap on `panel.contains`, not on tabbable-list membership.** Treating "active element is not in
   `nodes`" as "focus escaped" also fired for focusable-but-not-listed descendants (`tabindex="-1"`
   rows, `<iframe>`, media with controls) and yanked focus back to the first control. The panel
   itself is still treated as outside, so the entry-from-the-panel wrap is unchanged.
3. **`.jsx` is now linted for real, with a visible backlog.** The previous config switched every
   recommended rule off for `**/*.jsx`, which would have left ~all of `ds/components/*.jsx`
   permanently covered by exactly one rule. The recommended sets now apply to `.jsx`; the 15
   violations that predate coverage sit in `scripts/eslint-rules/jsx-ratchet.allow.js`, per rule and
   per file, with a shrink-only contract. The 6 of those 21 that were in owned files (Dialog.jsx,
   Sheet.jsx — the `fn && fn()` expression-statement idiom) are fixed rather than listed.

## Menu half — explicitly split, not silently dropped

`ds/components/core/Menu.jsx` and `core/Popover.jsx` are outside this story's ownership, so the menu
half is recorded rather than changed:

- Conformant and covered by an existing test: `role="menu"` + `aria-label`, ArrowUp/ArrowDown/Home/
  End skipping disabled items, focus entering the menu on open, Escape dismissing and returning
  focus to the opener — `ds/components/core/Menu.test.tsx:30-79`, with the return-focus contract in
  `core/Popover.jsx:110-116`.
- The two app-level menus implement the pattern directly and both already dismiss on Tab:
  `app/canvas/TileActionMenu.tsx:191` and `app/ViewAsControl.tsx:127`.
- **Open gap (deferred, unowned):** the DS `Menu` primitive does not close on Tab (APG: Tab closes
  the menu and moves focus on). Its real call sites are `screens/Board.tsx:578` and the DS gallery.
  Fixing it means editing `ds/components/core/Menu.jsx` — either widen this story's `owns` to
  include it, or take it as a follow-up story. Nothing in this branch touches it.

## Validation

- `node scripts/eslint-rules/no-positive-tabindex.test.js`: passed (RuleTester valid/invalid
  JSX and imperative DOM cases).
- `pnpm exec eslint . --no-cache`: 0 errors, 15 pre-existing warnings. `pnpm lint`: exit 0
  (raw-style, boundary, emphasis, non-text contrast).
- Ratchet mutation check: emptying `jsxRatchet` surfaces exactly 15 errors across 12 `.jsx` files,
  so the base rules are genuinely live on `.jsx` and the list is load-bearing rather than decorative.
- `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/ds/components/overlay
apps/gm-react/src/ds/components/core`: 17 files, 50 tests passed (44 before; 6 new, run against
  both Dialog and Sheet).
- Test mutation check: restoring the `ownsEscape` Tab/entry gate and the `nodes.includes` wrap
  condition fails all three new cases (nested-popover trap, nested-popover-with-nothing-focusable
  entry focus, focusable non-tabbable descendant) and passes everything else.
- `pnpm --filter @dndtools/gm-react typecheck`: exit 0. Prettier: clean.
- Full Playwright suite (both projects) — result recorded below.
