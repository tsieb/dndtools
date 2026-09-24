# RC-POL-1.19 — Join and invite redeem

## Scope and implementation

Polished `apps/gm-react/src/screens/Join.tsx`. Supporting changes are EN/ES messages,
route tests, visual baselines and the FEATURE-GAPS inventory. No cloud contract or
runtime mutation changed. Initial worktree was clean. Headroom tools were not available.

The card now uses DS Card elevation, token spacing/radii/type, a 24px-minimum
Cinzel heading, shared invite/connection illustrations and a loading Skeleton.
Error state stores translation keys instead of server prose: unavailable editions,
expired links and retryable failures have distinct localized recovery guidance.
Long invite content can wrap; sign-in uses the standard touch target and wraps.

## Embedded §20.2–§20.5 checklist

Checked entries include explicit scoped waivers, not claims of unperformed checks.

### §20.2 Design fidelity

- [x] DS primitives/screen-kit, token color/spacing/type, no raw hex/rgba/px literals.
      Native structural elements remain for semantic heading, live regions and flex layout.
      Card width is a responsive rem measure; thin borders use the CSS keyword.
- [x] Prototype/template: waived exact remote comparison. DesignSync is unavailable;
      preserve the existing chrome-less invite structure per its documented player-entry contract.
- [x] Raised primary Card uses shared shadow-md; ready state retains one gold primary CTA.
      Supporting sign-in tile is sunken. Recovery actions remain secondary.
- [x] Three type sizes (2xl, sm, xs); Cinzel uses 2xl. No numeric statistic exists;
      expiration remains a localized prose date, not a mono statistic.
- [x] Failure has a broken-chain shape, missing/loading an envelope. Co-DM warning has
      its existing session icon and explicit role text. Purple secrecy stripe waived:
      this is a public invitation, not hidden DM content.
- [x] Five themes × desktop/rail/phone: 30 pinned-container missing/unavailable snapshots,
      cropped to the invite card (the whole surface) to fit the shared baseline budget.
      Reviewed a contact sheet of all 30 plus full-size phone/parchment unavailable state.
      Ready/auth screenshots waived for this local-edition suite: cloud is fail-closed,
      and live invitations/accounts are not provisioned by this task.
- [x] No custom motion added; shared Skeleton inherits reduced-motion support.
- [x] Missing, loading, invalid and edition-unavailable branches present; envelope and
      connection-lost drawings use existing keys; loading also has a text Skeleton.

### §20.3 Interaction and UX

- [x] Retry immediately enters loading with status; completion renders inline ready/error.
      Navigation uses router feedback. No artificial delay or network request was added.
- [x] Destruction/confirmation waived: no destructive operation on this landing.
- [x] Save status waived: no persistence. Errors name a next step in both languages.
- [x] Recovery exit returns to app; new keyboard test verifies browser Back to the invite.
      Android-specific Back waived: no owned overlay or custom Back handler.
- [x] No hover/gesture-only controls; shared normal-size Buttons, including sign-in.
- [x] Compact top-bar overflow waived: standalone card has no top bar or overflow actions.
- [x] Copy re-read; all errors now use t(), EN and ES updated together. Raw API text is
      no longer exposed, and locale changes do not trigger a new invite resolution.
- [x] HelpTip/shortcut waived: explicit action labels and recovery guidance; no shortcuts.

### §20.4 Accessibility

- [x] Axe clean on missing and unavailable Join routes in desktop/mobile Chromium;
      known-violations register unchanged. Owned overlays: none. Cloud sign-in modal
      waived here because unavailable in the fail-closed local-edition route.
- [x] Keyboard regression: focus retry → Enter → retain retry focus → Tab to exit →
      Enter → browser Back. Both profiles pass; shared Button supplies focus-visible styling.
- [x] One translated h1, labelled main. SECTION_TITLES/nav waived: chrome-less public
      route intentionally outside AppShell, with no navigation landmark.
- [x] Loading polite status and asynchronous failure alert preserved, decorative drawings
      hidden from AT, retry button retained during loading.
- [x] Human screen-reader spot check waived: no interactive screen-reader platform is
      available in this execution environment. Axe/semantic assertions are automated evidence,
      not a claim of NVDA/VoiceOver verification.
- [x] 200% root text test on both profiles: no horizontal overflow, keyboard exit reachable.
      No new scroll region. Browser UI zoom/manual OS large-text check waived in headless mode.

### §20.5 Core discipline and correctness

- [x] Local fetch UI state only; no domain writes or visibility filtering.
- [x] Preview-as-player mutation rejection waived: landing has no domain write controls.
- [x] Actor projection waived: public resolve endpoint supplies invite metadata, not an
      actor-filtered vault projection. Existing API/actor contracts unchanged.
- [x] Join e2e on both profiles covers missing link, failed resolve/retry, exit and player
      session code refusal. Live successful redemption waived: local edition has no backend;
      tests assert honest failure rather than claim cloud success.
- [x] ENG-1.1 before/after route budget waived: no Join-specific budget/fixture exists.
      No dependency, additional fetch, timer or subscription added; two shared static SVGs
      and existing Skeleton only. Functional timings below are not a performance benchmark.
- [x] FEATURE-GAPS invite row updated. Architecture update waived: no contract moved.

## Validation evidence

- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/join.spec.ts tests/e2e/a11y-axe-gate.spec.ts --grep join --workers=2`: **20 passed (17.1s)**,
  both profiles, including missing/unavailable axe and 200% text keyboard regression.
- `apps/gm-react/tests/visual/run-in-container.sh join.spec.ts --update-snapshots=changed --workers=2`:
  **30 passed (35.8s)** in pinned Playwright 1.61.1 noble container.
- `pnpm --filter @dndtools/gm-react typecheck`: exit 0.
- `pnpm gates`: exit 0; repository warnings concern unrelated files, none for Join.tsx
  (under 500 lines). Quality-gate wiring and docs reachability checks passed.
- Final visual comparison and focused lint results recorded below before commit.

Central operator still owns independent review and subsequent broad gates. No push,
promotion, loop launch or dispatcher-state edit performed.

- Pinned visual comparison: **30 passed (25.7s)**, no changed snapshots.
- Focused ESLint initially rejected the stale allowance (13 -> 1). Its remaining
  finding was heading margin 0; changed to T.space.zero and removed Join from the
  allowance entirely. Final focused lint and no-allowance lint pass.
- Final typecheck and gates re-run passed; no owned-file size warning.

## Rebase onto loop/rc `acde3cf9` (2026-09-24)

The first attempt's commit was based on `2d9f566d`; `loop/rc` has since moved 118 commits.
Rebased the single commit and resolved two conflicts in `loop/rc`'s favour:

- `no-raw-style-values.allow.js`: kept `loop/rc`'s list (other POL stories had already removed
  their entries) and removed only the `Join.tsx: 13` line.
- `FEATURE-GAPS.md`: kept `loop/rc`'s table and rewrote only the Invite redeem "What it does"
  cell; Prettier now changes that single row (the first attempt reflowed the whole table).

The visual baseline budget went red after the rebase: `check-baseline-budget.mjs` reported
32,786.1 of 32,768 KiB, because later POL stories used the headroom the full-page Join captures
had assumed. `tests/visual/join.spec.ts` now screenshots the `main` card locator instead of the
page. Join baselines went from 927 KB to 706 KB and the total to **32,569.9 KiB (pass,
~198 KiB left)**. The shared cap was not raised.

Re-run on the rebased tree:

- `node apps/gm-react/tests/visual/check-baseline-budget.mjs`: pass, 390 files, 32,569.9 KiB.
- `run-in-container.sh join.spec.ts --update-snapshots=all`, then compare with no update: **30 passed**.
- `playwright test tests/e2e/join.spec.ts --workers=2`: **16 passed**, desktop + mobile.
- `playwright test tests/e2e/a11y-axe-gate.spec.ts --grep /join`: **4 passed** (`/join` and
  `/join?token=axe-invalid` on both profiles).
- `pnpm --filter @dndtools/gm-react typecheck`: exit 0. ESLint on Join.tsx, both Join specs and
  EN/ES messages: exit 0. `pnpm format:check:changed -- --base loop/rc`: 9 files, clean.
- `pnpm gates`: exit 0; 52 `file-size-warn` lines, none for Join.tsx (229 lines).
