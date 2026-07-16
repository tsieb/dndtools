# UX Guidelines (engineering)

Engineering-facing UX rules for the primary React GM app (`apps/gm-react`, `@dndtools/gm-react`).

This doc covers UX _rules that engineers enforce in code_. Visual language, tokens, and component
specs are owned by the design system — see `docs/design/`. Do not duplicate design-system content
here; link to it.

Where things live:

- Screens: `apps/gm-react/src/screens/*.tsx`
- Shell / composition (nav, command palette, canvas): `apps/gm-react/src/app/*.tsx`
- Design-system components: `apps/gm-react/src/ds/components/**`
- Icons: `apps/gm-react/src/ds/components/core/Icon.jsx` (semantic name → `lucide-react`)
- Tokens / global CSS: `apps/gm-react/src/styles/index.css` + `apps/gm-react/src/styles/tokens/`
- Runtime capabilities: `apps/gm-react/src/platform/capabilities.ts`

## 1) Product context

Primary usage is live tabletop sessions: fast retrieval under time pressure and low tolerance for
data loss or confusing state. Users are Dungeon Masters (heavy authoring) and Players (frequent
read/light update).

## 2) Non-negotiable principles

1. Content-first layout.
2. Fast interaction feedback.
3. Zero-surprise persistence behaviour.
4. Keyboard parity for all major actions.
5. Accessible defaults (see `docs/development/ACCESSIBILITY.md`).

## 3) Interaction requirements

### Navigation

- Every screen has a clear route back to a home/list surface.
- Browser back/forward semantics stay intact (the app uses `react-router-dom` `HashRouter`).
- Android Back closes the topmost menu/dialog/sheet, leaves a fullscreen editor, uses router history,
  then minimizes from the root destination.
- Sidebar/drawer toggling must never trap focus.
- The command palette (`Cmd`/`Ctrl`+`K`, `apps/gm-react/src/app/CommandPalette.tsx`) is the
  keyboard-first entry point for navigation and actions.

### Editing & persistence

- Visible save status for any auto-persisted surface; save/index failures surface actionable
  messaging, not silent loss.
- Destructive actions require explicit confirmation; deletions are reversible unless a permanent
  delete is explicitly requested.
- Long-running actions (imports, vault/cloud backup) show progress and result feedback.

### Search

- Title-first quick navigation and content-oriented search are distinct affordances; results carry
  enough context to disambiguate fast.

## 4) Visual system

- Use semantic tokens from `apps/gm-react/src/styles/tokens/` — never hard-coded colours.
- Consistent spacing and interaction states via the token scale.
- Preserve reduced-motion compliance (`prefers-reduced-motion` baseline in `styles/tokens/base.css`).
- For the full visual language (palette, type scale, component anatomy), defer to `docs/design/`.

## 5) Accessibility (mandatory)

Full requirements and gates are in `docs/development/ACCESSIBILITY.md`. In short:

- Full keyboard access for critical workflows; visible `:focus-visible` indicators on all controls.
- Correct ARIA semantics on tablists, dialogs (use `ds/components/overlay/Dialog.jsx`), and live
  regions; no keyboard traps in modals/drawers.
- Skip-to-content present and functional.
- Enforced by `pnpm a11y:gate` (axe on desktop + mobile Chromium, contrast lints, merged report).

## 6) Mobile & responsive

- Compact screens use bottom navigation for Command Center, Session, Characters, and Maps, with every
  other destination in the More sheet; wider layouts adapt to the navigation rail/sidebar.
- Android controls meet a 48dp touch-target floor with adequate target spacing and no hover-only or
  gesture-only action discovery; the mobile Chromium and TalkBack/API 36 checks guard this.
- Editor/input surfaces must handle the virtual keyboard without obscuring the active field.
- Edge-to-edge chrome may extend behind system bars, but interactive content uses all four safe-area
  insets. Rotation, resizing, and split-screen remain supported.
- Compact contexts expose one clear primary top-bar action; secondary actions move into labelled
  overflow or bounded sheets whose confirmation controls remain reachable above the keyboard/safe area.

## 7) Reliability UX

- Trash/undo behaviour is reversible by default.
- Vault-switch, import/export, and cloud-backup actions display progress and a clear result state,
  including conflict reporting before applying a destructive merge.
