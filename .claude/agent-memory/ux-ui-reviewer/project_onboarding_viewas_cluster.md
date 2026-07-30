---
name: onboarding-viewas-cluster
description: Defects + structure for app/Onboarding.tsx (first-run wizard) and app/ViewAsControl.tsx (the app's only role=menu), audited 2026-07-29 after commit fc40e764
metadata:
  type: project
---

## Onboarding.tsx (`src/app/Onboarding.tsx`, ~1191 lines, 7 steps, ADR-026 forced consent)
Generally well built: uses the shared `radioGroupKeyDown` from screen-kit (no duplicate copy),
`role=dialog`+`aria-modal`+Escape+Tab wrap trap, `isPhone` guards on both grids and the fixed
`width:880`, zero raw hex. The defects are all about **state persistence and status announcement**.

STILL OPEN (2026-07-29):
1. **`skip()` (~304) persists only privacy + the onboarded flag.** `TIER_KEY`/`TIER_ATTR`, `aiUsage`
   and `INVITES_KEY` are written ONLY in `finish()` (~368-372). Complete the tier/AI/party steps,
   then hit "Skip setup" (or Escape, or Android back — all route to `skip()`) and those three steps
   are silently discarded. `finish()`'s own comment claims choices "are never silently discarded" —
   true for finish, false for skip. `onboarding-consent.spec.ts` only asserts privacy persists, so
   a fix is spec-safe.
2. **Escape (~448) is bound on the panel container**, so it fires from inside the party-name Input
   (~985) and the E2EE ack Input (~831) — Escape while typing dismisses the wizard (and triggers #1).
3. **Privacy step dead-end (~1162/1164).** `disabled={step.id==='privacy' && !privacyDecided}` but
   the label only special-cases `privacy === null`. Pick Private (E2EE) + mistype the ack phrase →
   button reads plain "Continue", greyed, no explanation. Ack `Input` (~831) has no `aria-invalid`,
   no `aria-describedby`, no error text.
4. **Step position is never announced.** The 7-step rail (~561-608) is wrapped `aria-hidden="true"`
   with no `aria-current`; the "Step N of 7" span (~1154) has no `role="status"`. Focus on step change
   goes to a roleless `tabIndex={-1}` div (~297). File has ZERO `aria-live`/`role=status`.
5. **Ready-step checklist rows (~1071) call `finish(c.to)`**, which when `vault==='fresh'` runs
   `resetCoreStorage()` + reload (~374-385). A row whose accessible name is "A map is in the atlas"
   wipes the vault. The footer button (~1182) correctly says "Clear sample & start fresh"; the rows
   give no warning, and the checklist is derived from the sample vault it is about to erase.
6. Checklist done-state is visual-only (~1098: aria-hidden check Icon + line-through + border swap).
7. Duplicate party note silently swallowed (~413) — input clears unconditionally, no toast, while
   the two adjacent guards (~406, ~410) do toast.
8. `disabled={wiping}` on the just-clicked button (~1070/1175) blurs it → focus to `<body>`, escaping
   the panel's own Tab trap; the "Clearing vault…" label change is announced nowhere.

## ViewAsControl.tsx — the app's ONLY `role="menu"`
`MenuItem` (~197) is a real `<button role="menuitem">`; focus moves into the first item on open
(~112) and `close(true)` restores focus to the trigger. Three gaps remain:
- **No arrow-key roving focus** — the container's `onKeyDown` (~108) handles Escape only. Tab works
  (buttons default to tabIndex 0) but the ARIA menu pattern / WCAG 2.1.1 expects Up/Down/Home/End.
- **`MenuLabel` (~181) renders a bare `<div>` as a DIRECT child of `role="menu"`** at ~136 and ~164,
  as does the separator div at ~135. Invalid owned-element structure → axe `aria-required-children`.
  Fix: `role="presentation"` on MenuLabel (or wrap each section in `role="group"` + `aria-label`),
  `role="separator"` on the divider.
- **Single-select `active` state has no a11y counterpart** — conveyed by gold text + an aria-hidden
  check Icon only. These are mutually exclusive, so they should be `role="menuitemradio"` +
  `aria-checked`. Same defect class as Chip's `selected`, which was fixed in 5274a5f9.

See also [[settings-extensions-cluster]], [[ds-layer-audit]].
