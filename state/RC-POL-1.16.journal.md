# RC-POL-1.16 — Plans, cloud and legal

## Scope and implementation

- Work stays on the assigned task branch. No push, promotion, dispatcher state edits or agents.
- Headroom tools are not exposed in this session; native commands retain exact validation logs in `/tmp/pol16-*`.
- Split the 728-line Upgrade into the route/controller, PlanCards, PlanComparison, PlanStatus and existing dialogs. Preserve server entitlement and Stripe decisions.
- Token typography and grid spacing, supporting cards flat, recommended CTA gold, legal navigation 48px, legal main includes the heading and footer; small headings use Inter.
- Added illustrated stale-account retry and initial skeleton, blocked modal dismissal while saving, localized plan card/dialog copy and new states in EN/ES.
- 2026-09-24 resume: rebased the 2026-09-20 commit onto `loop/rc` 692b4e1c (119 commits newer; only FEATURE-GAPS conflicted, resolved by keeping loop/rc's table and re-applying the two row edits). Three follow-ups: (1) the 75 full-page PNGs (9,155 KiB) no longer fit the shared baseline cap, so the visual spec now pins one small crop per theme and tier (below); (2) the loop/rc vocabulary test rejected the literal `co-DM` in the new plan-card keys, so EN/ES now use `Co-{gm}`, the glossary form `session.roster.role.coDm` already uses; (3) the skeleton crop showed the Recommended badge (`top: -10`) overlapping the loading skeleton. The stale-account banner sits in the same slot with no margin either, so both `PlanStatus` states now have a `--space-5` bottom margin.

## Embedded §20.2–§20.5 checklist (checked or explicitly waived)

### 20.2 Design fidelity

- [x] DS/screen-kit primitives and token colors/type/spacing. Waiver: structural hairline borders, comparison minimum width and page/hero measures retain layout constants; replacing these with unrelated spacing tokens would break the comparison layout. Native table roles and long-form semantic HTML are intentional.
- [x] Prototype: retained existing port's hero, cycle switch, three cards, cost note and comparison. Waiver: remote DesignSync prototype unavailable in this session; `docs/design/README.md` §4 requires that service. Changed small Cinzel to Inter and supporting card elevation to match current token guidance.
- [x] One gold primary card action (recommended Lantern); supporting cards flat; recommended panel retains shadow-md.
- [x] Four-step UI type hierarchy, display ≥24px, prices mono; legal prose has its own readable body size.
- [x] Status icon shapes accompany color. DM stripe waived: these are account/public documents, no DM-only campaign data.
- [x] All five themes × three tiers, with a budget-driven waiver on what gets pinned. Pinned: `plans-account-check--{theme}.png` in all three tiers (15 PNGs, 10.0 KiB): the first row of the account-check skeleton, served by the shared `tests/e2e/_accountFixture.ts` `loading` mode. Not pinned: the full route, the dialog, the comparison and both legal pages. The shared 32 MiB cap (`check-baseline-budget.mjs`) has 331 KiB left on `loop/rc` 692b4e1c and **23.2 KiB** once the in-flight RC-POL-1.19 branch (`dispatch/dndtools/182924ef…`, f4cb4a64) lands. Measured crops that include text cost 2–6.5 KiB per image (saving pill ~2.6, badge ~2.2, legal nav ~3.7, cycle row ~6.4), i.e. 33–97 KiB across fifteen, and the earlier full-page set cost 9,155 KiB. Those surfaces were instead rendered in the pinned container for all 5 themes × 3 tiers and reviewed as contact sheets (not committed). The review found the badge overlap fixed above; dialogs, cards and legal prose read correctly in every theme. Raising the cap is an owner decision (RC_ROADMAP §24); this story does not change it.
- [x] No surface-owned motion. DS Skeleton/Dialog follow shared reduced-motion behavior.
- [x] Loading skeleton (now clear of the Recommended badge), illustrated connection-lost retry, offline comparison and unavailable explanations. Empty waived: fixed plan inventory and bundled legal documents cannot be empty; provider substitutes offline matrix for empty server responses. No plan-specific empty illustration exists.

### 20.3 Interaction and UX

- [x] Feedback is synchronous React busy/disabled state; browser specs verify saving/redirecting labels, retained dialog on failure, retry and completion toast.
- [x] Downgrade names target and warns of lost cloud access; live subscription changes delegated to hosted portal.
- [x] Explicit save, no auto-persist editor. Stale account says to reconnect/retry; saving dialogs cannot be dismissed.
- [x] Settings back route, legal browser history, dialog Escape and trigger focus return pass on both profiles. Native Android Back uses shared Dialog registration; native-device walkthrough waived because no Android device is attached.
- [x] No hover-only actions; legal links are 48px. Scoped DS density tokens make plan controls 48px on desktop too; e2e measures both primary CTA and billing switch.
- [x] Compact shell retains its existing action/overflow. Plan cards are content actions, not additional top-bar actions.
- [x] EN/ES plan card and dialog descriptions + new state copy via t(). Waiver: authoritative server feature matrix has no locale keys; bundled legal body remains the existing English legal draft, not an unreviewed translation of obligations. Legal navigation/title translations retained.
- [x] Non-obvious preview/billing/cycle behavior explained inline next to controls. No surface keyboard shortcuts requiring tooltips.

### 20.4 Accessibility

- [x] axe has zero violations for upgrade, both legal routes, preview upgrade/downgrade dialogs, hosted-checkout dialog and account error state, on both profiles. Register unchanged. Scan waits for finite animations to finish (initial scan caught intermediate fade-in opacity).
- [x] Both profiles: enter the focused Lantern CTA with Enter, Escape returns focus, Enter reopens, Tab reaches Save, Enter commits and announces success. The test starts at the CTA; keyboard discovery of the shared shell is outside this surface.
- [x] Shell owns upgrade h1/SECTION_TITLES; public legal pages own one h1 and labelled nav. Legal heading/footer now inside main landmark.
- [x] Loading/retry status and completion toasts; comparison itself is not live, preventing repeated announcements.
- [x] Accessibility-tree spot check: single h1, labelled dialog with description, named actions, success status and failure alert asserted by role. Actual screen-reader speech check waived: no screen-reader/audio session is available. This is not a speech-verification claim.
- [x] 200% root text on both profiles: no document overflow, legal footer reachable and navigable, comparison remains focusable/scrollable and privacy link reachable. Existing scroll region retained.

### 20.5 Core discipline and correctness

- [x] No campaign writes or client visibility filtering. Account changes use existing entitlement/billing APIs; UI preferences are local React state.
- [x] Preview-as-player write guard waived: billing belongs to signed-in account/device, legal is public; there are no campaign writes to guard.
- [x] Player actor projection waived: these surfaces neither read campaign entities nor use actor permissions; testing an actor projection would not exercise them.
- [x] Both profiles cover local plan save and cycle selection, cancelled checkout, account-save failure/retry, failed hosted checkout handoff, stale account refresh/skeleton, and Spanish card/dialog copy. Cloud cases use browser module fixtures and never contact a payment/account service.
- [x] Perf waiver: ENG-1.1 registry has no Plans/legal budget (its domain budgets cover Canvas, Maps, Search, Graph, Sync and Collaboration plus shared startup). This change adds no background IO, campaign query or data-dependent collection; cards remain three and matrix is the existing provider inventory. No before/after budget or no-regression claim is fabricated. Shared startup/CI performance remains the central gate’s responsibility.
- [x] FEATURE-GAPS Plans & cloud and Legal rows updated with polish behavior and browser specs. No architecture contract moved.

## Validation evidence

Re-run in full on 2026-09-24 after the rebase onto `loop/rc` 692b4e1c, in the assigned worktree. Exact logs are in `/tmp/pol16-*.log`. No allowances or axe-register entries added.

- `pnpm gates`: exit 0. No `file-size-warn` for `screens/Upgrade.tsx`, `screens/upgrade/*` or `screens/legal/*` (other surfaces keep their existing warnings). Owned maximum: Upgrade.tsx 440 lines (previously 728), legalContent.ts 359, PlanDialogs.tsx 291; all other owned files are smaller.
- `pnpm --filter @dndtools/gm-react typecheck`: exit 0. `pnpm lint` (full, incl. raw-style, emphasis and contrast lints): exit 0. Upgrade's 56-value raw-style allowance stays removed.
- `pnpm format:check:changed -- --base loop/rc`: exit 0. `git diff --check loop/rc`: exit 0.
- `vitest run src/i18n src/screens/legal src/cloud/entitlements.test.ts src/cloud/billing.test.ts`: **59 passed** (5 files), including `vocabulary.test.tsx` (it failed on `co-DM` before the fix above).
- `CI=1 DNDTOOLS_E2E_PORT=6143 playwright test tests/e2e/upgrade.spec.ts tests/e2e/legal.spec.ts tests/e2e/upgrade-polish.spec.ts tests/e2e/upgrade-cloud-polish.spec.ts --workers=2 --retries=0`: **32 passed** on desktop-chromium and mobile-chromium.
- `CI=1 DNDTOOLS_E2E_PORT=6144 playwright test tests/e2e/a11y-axe-gate.spec.ts -g "upgrade|legal|privacy|terms" --retries=0`: **2 passed** (`/upgrade`, both profiles). The legal routes, dialogs, checkout dialog and account-error state are scanned by the polish specs above.
- Baselines: `run-in-container.sh plans-legal.spec.ts --update-snapshots=all` wrote the 15 crops. `node tests/visual/check-baseline-budget.mjs`: **405 files, 32,446.8 KiB / 32,768 KiB**. On top of RC-POL-1.19 this would be ~32,755 KiB, still under the cap.
- Full pinned compare: `CI=1 DNDTOOLS_PW_WORKERS=2 apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --retries=0`: **315 passed (6.3m), exit 0**. No unrelated baseline changed (`PlanStatus` only renders in account-backed modes, which the golden routes never enter).

## Review boundaries

Additional files outside the owned source directories are required acceptance support: EN/ES catalogs, two e2e specs and their shared `_accountFixture.ts`, the visual spec and its 15 baselines, FEATURE-GAPS, removal of the existing lint allowance, and this journal. Legal obligations/placeholders, billing contracts, dispatcher controls and unrelated surfaces are unchanged. Remote publication, promotion and independent central review have not been performed.
