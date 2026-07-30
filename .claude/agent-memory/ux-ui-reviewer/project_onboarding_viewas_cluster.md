---
name: onboarding-viewas-cluster
description: App-shell chrome cluster — Onboarding, ViewAsControl, CommandPalette, ProjectionControl, SceneDisplayOverlay, Join, screen-kit. FIXED-vs-OPEN split re-verified 2026-07-30 @ c93c5206 (run #9).
metadata:
  type: project
---

Cluster = `src/app/{Onboarding,CommandPalette,ProjectionControl,ViewAsControl,SceneDisplayOverlay,
screen-kit}.tsx` + `src/screens/Join.tsx`. Re-verified on `auto/visual-review-loop` @ `c93c5206`.
Re-check by grepping the anchor string, not the line number.

## FIXED since the 2026-07-29 pass — do NOT re-report
- **ViewAsControl is now largely correct.** All three prior gaps closed: roving Arrow/Home/End on the
  menu container (`:129-150`), `role="separator"` on the divider (`:175`), `role="presentation"` on
  `MenuLabel` (`:228`), `role="menuitemradio"` + `aria-checked` on every row (`:260-261`), Tab
  dismisses (`:125`), `close(true)` restores trigger focus, `maxHeight:'min(70vh,420px)'` +
  `overflowY:auto` for a full party.
- **Onboarding `skip()` now persists tier/AI/party** (`:314-318`), Escape-from-a-text-field is
  guarded (`:487-498`), the ready-checklist rows carry a consequence-naming `aria-label`
  (`:1147-1151`).
- **DS `Tabs` ARIA is fully closed** — `idBase` + `tabPanelProps` exist AND all 7 live consumers pass
  both (MapEditor, Audio, Extensions, Campaign, Characters, Player, Community). ds-audit item 3 DONE.

## STILL OPEN — Onboarding.tsx
1. **ZERO `aria-live` / `role="status"` / `aria-current` in the entire file** (grep-verified again).
   Step rail `:607-611` is `aria-hidden="true"`; "Step N of 7" `:1234` is inert text; step-change
   focus goes to a roleless `tabIndex={-1}` div (`:296-298`).
2. **Privacy dead-end persists.** Footer `:1237-1240` uses HARD `disabled` and the label only
   special-cases `privacy === null`, so E2EE + mistyped ack ⇒ plain greyed "Continue", out of the
   tab order, no reason anywhere. Ack `Input` (~`:860`) still has no `aria-invalid`/`aria-describedby`
   /error text. Fix = Button's soft-disable (`aria-disabled` + reason `title`), which the DS
   documents at `Button.jsx:25-26` and this repo already uses in ProjectionControl.
3. **The only full-screen modal that neither locks body scroll nor calls `isolateModalSiblings`**
   (`:518-537`). `Dialog.jsx:71-72` and `SceneDisplayOverlay.tsx:76` both do.
4. Checklist done-state still visual-only; duplicate party note still silently swallowed (`~:421`);
   `disabled={wiping}` still blurs the just-clicked button out of the Tab trap.

## STILL OPEN — SceneDisplayOverlay.tsx
5. `:166`/`:173` — "Next card" and "Clear display" hard-`disabled` on their own last click ⇒ focus to
   `<body>`, escaping the overlay's own Tab trap (`:89-106`). The file already uses the soft form
   correctly at `:183` for the second-screen button — just inconsistent.
6. **NO pointer entry point at all.** `grep setDisplayOpen` in `src/app/` returns exactly one setter:
   the Ctrl/Cmd+Shift+S hotkey (`AppShell.tsx:1019-1023`). No button, no menu row, no palette
   command ⇒ unreachable on phone/tablet, undiscoverable on desktop.
7. `:173`/`:176` ghost Buttons paint `--color-text-secondary` on a HARD-CODED `rgba(6,9,14,0.72)`
   bar (`#05070c`, `rgba(255,255,255,.14)` too). In parchment that token is `#5c4a39`
   (colors.css:160) ⇒ ~1.9:1. The bar never follows the theme.
8. `advance()`/`clear()` (`:124-129`) discard `CommandResult` — the silent-rejection class.

## STILL OPEN — screen-kit.tsx (shared primitive)
9. `BackBar` (`:254-271`) `padding: 0` ⇒ ~17px tall button, WCAG 2.5.8 fail. **Only 2 real consumers**
   (`Upgrade.tsx:234`, `Knowledge.tsx:446`) — `Characters.tsx:246` defines its OWN local `BackBar`.
10. `radioGroupKeyDown` (`:22-32`) doesn't filter disabled radios and has no Home/End, unlike its two
    siblings `Seg` (`:205-215`) and `Tabs` (`:80-91`). Focus/`aria-checked` desync on a disabled row.

## STILL OPEN — Join.tsx
11. `:192-196` "Try again" unmounts itself (effect sets `phase:'loading'`, dropping both the
    `role="alert"` and the button) ⇒ focus to `<body>`. `join.spec.ts:62` pins the name `Try again`,
    so keeping it mounted / refocusing is spec-safe; renaming is not.

## Raw z-index hygiene (LOW — verified NOT a live paint bug)
`ViewAsControl:110/156` (40/50), `SceneDisplayOverlay:140/149` (120/121), `Onboarding:529` (400) use
raw numbers while `--z-*` tokens exist. **`--z-titlebar` and `--z-sticky` have ZERO consumers**, and
the AppShell hotkey guard (`:1000`) refuses to open the display overlay while another `aria-modal`
is up, so nothing currently paints over the z-120 overlay. Tokenization only.

## PREMISE CORRECTIONS (save future runs the hunt)
- **There is NO `<iframe>` anywhere in gm-react** (grepped all .tsx/.jsx: 0 hits). `Extensions.tsx`
  has no custom-widget iframe surface — only a `<Badge status="info">sandboxed</Badge>` at `:519`.
  The iframe/CSP story lives in the archived Svelte app.
- `Join.tsx:175 Icon name="UserCircle"` DOES resolve (`Icon.jsx:506` maps it to itself). Not a dead
  glyph — Icon falls back to `Square` for unknown names (`Icon.jsx:526`).
- Global `:focus-visible` ring exists at `styles/tokens/base.css:36-38`. Never report a missing focus
  ring without checking that file first.

See also [[ds-layer-audit]], [[settings-extensions-cluster]], [[audio-upgrade-scenes-creator-cluster]].
