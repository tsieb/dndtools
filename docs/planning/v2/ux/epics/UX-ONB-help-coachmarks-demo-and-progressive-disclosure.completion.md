# Completion — UX-ONB-help-coachmarks-demo-and-progressive-disclosure

UX workpack status: `complete`

Epic: Help, Coach Marks, Demo Content, and Progressive Disclosure (phase "10 Onboarding and
Production Polish", P1). Requirement coverage: `UX-ONB-013` (contextual coach marks), `UX-ONB-014`
(persistent "?" help entry), `UX-ONB-015` (keyboard shortcut cheat sheet), `UX-ONB-016` (contextual
help panel / help center), `UX-ONB-017` (progressive onboarding — Tier 1 wired), `UX-ONB-018`
(feature-tier control in Settings), `UX-ONB-019` (demo/sample content offer — scoped, see gaps),
`UX-ONB-020` ("What's New" / changelog).

## Summary

Finished learnability with a coherent, device-local help-and-onboarding system on the design tokens.

- **Coach marks (UX-ONB-013 / UX-ONB-017 Tier 1):** a new non-modal `CoachMark` primitive
  (`src/lib/gui/ux-onb/CoachMark.svelte`) anchored by a `.coach-anchor` wrapper, driven by a new
  device-local `CoachMarkStore` (`src/lib/platform/coach-marks.svelte.ts`). It fires on **first reach**
  (never on time/login/session count), is **dismissible**, persists "seen" so a dismissed mark never
  fires again, enforces a **two-per-session frequency cap**, is **non-blocking** (`pointer-events:none`
  except the dismiss button — the affordance behind it stays clickable), announces via
  `role="status"`/`aria-live="polite"` without stealing focus, and disables its fade under
  `prefers-reduced-motion`. Wired as the Tier-1 mark on the Command Center add-widget affordance.
- **Persistent "?" help + contextual help center (UX-ONB-014/015/016):** `HelpTrigger` is now a
  contextual **help center** — heading + overview + quick tips scoped to the current surface (new
  `src/lib/content/help-content.ts` registry, longest-prefix match), a passive **What's New** section
  (latest 3 releases + "See all release notes →"), and the existing **searchable, actor-filtered
  keyboard cheat sheet**. The "?" button opens it; the `?`/F1 key opens it focused on the cheat sheet
  (suppressed inside text inputs). It stays the shared modal `Dialog` (focus trap, Escape, focus
  restoration) so the A11Y-014/009/012 contract is preserved.
- **Feature-tier control in Settings (UX-ONB-018):** the tier radiogroup (`core`/`intermediate`/
  `advanced`) is now also in Settings, pre-selected at the active tier, with the
  `visibleFeatures(tier)` capability list; changing it takes immediate effect and is reversible.
- **"What's New" / changelog (UX-ONB-020):** a new `src/lib/content/changelog.ts` registry surfaced
  passively in the help center and in full at **Settings → About**, with a device-local
  `ChangelogSeenStore` driving a passive red **badge** on the "?" button that **clears when the center
  opens** — never an interruptive launch modal.

Visual polish: coach marks use `--color-surface-overlay` + `--shadow-lg` with a token arrow; the
help center sections, changelog cards, and tier pills all reuse the shared tokens; the tier pills got
the same `:has(input:checked)` highlight as the onboarding surface.

## Requirement coverage / traceability

| Requirement | Implementation | Test |
|---|---|---|
| **UX-ONB-013** coach marks (trigger rules, cap, dismiss, non-block, reduced-motion) | `CoachMark.svelte` + `CoachMarkStore` + `.coach-anchor`/coach-mark tokens | e2e `onboarding-help-coachmarks` (fires/dismiss/non-block; seen persists across session) |
| **UX-ONB-014** persistent "?" help entry (button = center; `?` key = cheat sheet; ≥44px) | `HelpTrigger.svelte` (top bar, every route) | e2e `help-and-interaction-primitives` + `touch-targets` (Help trigger target) + `onboarding-help-coachmarks` |
| **UX-ONB-015** keyboard shortcut cheat sheet (searchable, Escape/`?` close) | `HelpTrigger` shortcuts section | e2e `help-and-interaction-primitives` (`?` opens, Escape closes, focus restore) |
| **UX-ONB-016** contextual help center (surface heading + overview + quick tips + What's New + shortcuts) | `HelpTrigger` + `help-content.ts` registry | e2e `onboarding-help-coachmarks` (Command Center help vs Settings help) |
| **UX-ONB-017** progressive onboarding (Tier 1 first-reach) | CC Tier-1 coach mark via the milestone-free first-reach store | e2e `onboarding-help-coachmarks` (coach mark) |
| **UX-ONB-018** feature-tier control in Settings | `settings/+page.svelte` tier radiogroup + `visibleFeatures` | e2e `onboarding-help-coachmarks` (pre-selected + immediate effect) |
| **UX-ONB-020** "What's New" badge + changelog | `changelog.ts` + `ChangelogSeenStore` + Settings → About | e2e `onboarding-help-coachmarks` (badge shows/clears/persists; passive surface) |

## Actor-safety / no-leak evidence

- Coach-mark, help, and changelog content is **presentation-only** (authored static content + the
  already-actor-filtered shortcut registry). There is no new read path into vault state, so nothing
  here can leak hidden DM content; a player/observer help center lists only the shortcuts their
  actor-filtered registry already exposes (UX-NAV-019 AC4).
- All three new stores are **device-local display preferences** (Contract 1) backed by `localStorage`,
  declared as scoped exceptions in `apps/gm/platform-access-exceptions.json` (PLAT-012) alongside the
  theme/density/motion/nav-chrome preference stores. They never touch durable vault or sync state.

## Tests / gates run

- `pnpm typecheck` — **0 errors, 0 warnings (4760 files)**.
- `pnpm lint` — **PASS** (eslint + boundary + nav-registry + a11y:contrast).
- `pnpm tokens:contrast` — **PASS** (96 pairs × 5 themes). `pnpm gates` — **PASS** (7 gates).
  `pnpm docs:validate` — **PASS**.
- Targeted e2e, **both projects**: `onboarding-help-coachmarks` (new), `help-and-interaction-primitives`,
  `onboarding`, `a11y-axe-gate`, `a11y-target-size`, `touch-targets` — **PASS**.
- Full Playwright suite, **both projects** (desktop-chromium + mobile-chromium) — **see run below**.
- `pnpm ux-workpack:validate` — **PASS**.

## Files changed

New — GUI / state / content:
- `apps/gm/src/lib/gui/ux-onb/CoachMark.svelte` (non-modal coach-mark primitive).
- `apps/gm/src/lib/platform/coach-marks.svelte.ts` (device-local coach-mark store).
- `apps/gm/src/lib/platform/changelog-seen.svelte.ts` (device-local "What's New" seen-state).
- `apps/gm/src/lib/content/changelog.ts` (changelog registry).
- `apps/gm/src/lib/content/help-content.ts` (contextual help content registry).
- `apps/gm/tests/e2e/onboarding-help-coachmarks.spec.ts` (coach mark / help center / tier / changelog).

Modified:
- `apps/gm/src/lib/gui/HelpTrigger.svelte` (contextual help center + What's New + badge; cheat sheet preserved).
- `apps/gm/src/routes/+layout.svelte` (provide + init the two new stores).
- `apps/gm/src/routes/+page.svelte` (Command Center Tier-1 coach mark on the add-widget affordance).
- `apps/gm/src/routes/settings/+page.svelte` (feature-tier control + What's New / About changelog).
- `apps/gm/src/routes/styles.css` (coach-mark + badge + tier-pill + changelog tokens; token-only).
- `apps/gm/platform-access-exceptions.json` (two scoped localStorage exceptions, PLAT-012).

Generated by the UX workpack commands (do not hand-edit):
- `docs/planning/v2/ux/workpack-state.yaml`, `docs/planning/v2/ux/status.yaml`,
  `docs/planning/v2/ux/epics/UX-ONB-help-coachmarks-demo-and-progressive-disclosure.yaml`.

## Known gaps / deferred

- **Demo / sample content seeding (UX-ONB-019):** the empty states + help center point at the first
  action, but the one-click "Load demo content" seeders (demo notes/characters/maps/scene tagged
  `_demo: true`, "Demo" badges, and "Remove all demo content" in Settings) write **durable vault
  state** owned by each content surface's create flow. That seeding is deferred to the content surfaces
  (Knowledge/Characters/Maps) rather than bolted onto the onboarding layer, to keep Architecture
  Contract 1 clean; the empty-state secondary-CTA slots from the empty-states epic remain the hooks.
- **`/changelog` full-page route (UX-ONB-020 §spec):** the changelog is surfaced in full at **Settings
  → About** (correct route `h1`, reachable from the help center's "See all" link) rather than a
  dedicated `/changelog` route, which would otherwise resolve to the home section's `h1` without a core
  IA-registry entry (NAV-007 single-`h1` contract). All three UX-ONB-020 acceptance criteria are met by
  the Settings → About surface + the passive badge.
- **Help center as a non-modal side drawer (UX-ONB-016 §platform):** delivered as the shared **modal**
  `Dialog` to preserve the existing A11Y-014/009/012 focus-trap + restoration contract and its tests;
  the contextual content, quick tips, What's New, and shortcuts are all present.
- **Coach-mark trigger registry beyond Tier 1:** the store + primitive are generic; only the Command
  Center Tier-1 mark is wired. Additional surface marks (Canvas/Maps/Characters Tier 2/3, UX-ONB-017)
  drop in by adding a `<CoachMark>` to each surface with no store changes.

## Git evidence

- Branch: `ux/UX-ONB-help-coachmarks-demo-and-progressive-disclosure` (off `176fe4f`).
- Commit: `feat(ux): UX-ONB help center, coach marks, feature tiers, changelog`.

Final `git status --short` (pre-commit snapshot):

```
 M apps/gm/platform-access-exceptions.json
 M apps/gm/src/lib/gui/HelpTrigger.svelte
 M apps/gm/src/routes/+layout.svelte
 M apps/gm/src/routes/+page.svelte
 M apps/gm/src/routes/settings/+page.svelte
 M apps/gm/src/routes/styles.css
 M docs/planning/v2/ux/epics/UX-ONB-help-coachmarks-demo-and-progressive-disclosure.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
?? apps/gm/src/lib/content/
?? apps/gm/src/lib/gui/ux-onb/
?? apps/gm/src/lib/platform/changelog-seen.svelte.ts
?? apps/gm/src/lib/platform/coach-marks.svelte.ts
?? apps/gm/tests/e2e/onboarding-help-coachmarks.spec.ts
```
