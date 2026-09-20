# RC-POL-1.16 — Plans, cloud and legal

## Scope and implementation

- Work stays on the assigned task branch. No push, promotion, dispatcher state edits or agents.
- Headroom tools are not exposed in this session; native commands retain exact validation logs in `/tmp/pol16-*`.
- Split the 728-line Upgrade into the route/controller, PlanCards, PlanComparison, PlanStatus and existing dialogs. Preserve server entitlement and Stripe decisions.
- Token typography and grid spacing, supporting cards flat, recommended CTA gold, legal navigation 48px, legal main includes the heading and footer; small headings use Inter.
- Added illustrated stale-account retry and initial skeleton, blocked modal dismissal while saving, localized plan card/dialog copy and new states in EN/ES.

## Embedded §20.2–§20.5 checklist (checked or explicitly waived)

### 20.2 Design fidelity

- [x] DS/screen-kit primitives and token colors/type/spacing. Waiver: structural hairline borders, comparison minimum width and page/hero measures retain layout constants; replacing these with unrelated spacing tokens would break the comparison layout. Native table roles and long-form semantic HTML are intentional.
- [x] Prototype: retained existing port's hero, cycle switch, three cards, cost note and comparison. Waiver: remote DesignSync prototype unavailable in this session; `docs/design/README.md` §4 requires that service. Changed small Cinzel to Inter and supporting card elevation to match current token guidance.
- [x] One gold primary card action (recommended Lantern); supporting cards flat; recommended panel retains shadow-md.
- [x] Four-step UI type hierarchy, display ≥24px, prices mono; legal prose has its own readable body size.
- [x] Status icon shapes accompany color. DM stripe waived: these are account/public documents, no DM-only campaign data.
- [x] All five themes × three tiers: 75 pinned PNGs cover route, dialog, comparison, privacy and terms. Reviewed contact sheets for every combination; full comparison result recorded below.
- [x] No surface-owned motion. DS Skeleton/Dialog follow shared reduced-motion behavior.
- [x] Loading skeleton, illustrated connection-lost retry, offline comparison and unavailable explanations. Empty waived: fixed plan inventory and bundled legal documents cannot be empty; provider substitutes offline matrix for empty server responses. No plan-specific empty illustration exists.

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

All commands run in the assigned worktree, using native exact output. No allowances or axe-register entries added.

- `pnpm gates`: exit 0, no owned-file warning. Other surfaces retain their existing file-size warnings. Owned maximum: Upgrade.tsx 440 lines (previously 728); legalContent.ts 359, PlanDialogs.tsx 291, all remaining files smaller.
- `pnpm --filter @dndtools/gm-react typecheck`: exit 0.
- ESLint on owned surface, new e2e and visual specs: exit 0. Removed Upgrade’s 56-value raw-style allowance; all owned surface files lint without allowances. `pnpm lint:raw-style-count`: 2,519 repository findings across 259 other files.
- Prettier check on changed code/catalogs/docs: exit 0; `git diff --check`: exit 0.
- `pnpm --filter @dndtools/gm-react exec vitest run src/screens/legal/legal.test.tsx src/cloud/entitlements.test.ts src/cloud/billing.test.ts`: **24 passed** (3 files). Public legal pages still render without auth/runtime providers.
- `CI=1 DNDTOOLS_E2E_PORT=6042 pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/upgrade.spec.ts tests/e2e/legal.spec.ts tests/e2e/upgrade-polish.spec.ts tests/e2e/upgrade-cloud-polish.spec.ts --workers=2 --retries=0`: **32 passed**. Focus/target assertions subsequently strengthened; `upgrade-polish.spec.ts` rerun: **12 passed**.
- Browser fixture diagnosis: use Vite’s exact versioned React module URL, avoiding a second React instance; error toasts are `alert`, success is `status`. These corrections are in test code, not production seams. Separate local server port used for the final run.
- Final baseline generation: `CI=1 DNDTOOLS_PW_WORKERS=2 apps/gm-react/tests/visual/run-in-container.sh plans-legal.spec.ts --update-snapshots=changed --retries=0`: **45 passed**, writing **75** PNGs (5 views × 5 themes × 3 tiers). Final touch-target change intentionally moved Upgrade/dialog pixels; comparison captures added so the below-fold table is reviewed too. Every new PNG reviewed via contact sheets; phone matrix intentionally scrolls horizontally, with document overflow absent in e2e.
- Baseline budget: **210 files, 22,036.4 KiB / 32,768 KiB**, passes per-file and total caps.
- Final full pinned compare: `CI=1 DNDTOOLS_PW_WORKERS=2 apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --retries=0`: **180 passed (3.2m), exit 0**. Includes all 135 existing golden-route tests and 45 new tests producing 75 surface captures. No unrelated baseline was updated. Exact local output: `/tmp/pol16-visual-final-compare.log`.

## Review boundaries

Additional files outside the owned source directories are required acceptance support: EN/ES catalogs, two e2e specs, the visual spec and baselines, FEATURE-GAPS, removal of the existing lint allowance, and this journal. Legal obligations/placeholders, billing contracts, dispatcher controls and unrelated surfaces are unchanged. Remote publication, promotion and independent central review have not been performed.
