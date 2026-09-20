# RC-DOC-1.3 run journal

## Current run — 2026-09-20

- Started clean at `45f59ee4`, with the eight guides and responsive Help launcher already
  committed. The operator's 2026-09-18 brief now owns `TopBar.tsx`. Its existing import and
  non-phone `<HelpLauncher />` mount are the minimal shell integration: the footer is
  phone-only. No further shell edits are needed. This run changes only `docs/README.md`
  and `docs/user`; existing files outside the claim are left untouched.
- Applied the supplied docs-research skill. No Headroom tools or natural-writer definition
  are available. No agents spawned. Read the actual checker, Help menu, top bar, existing
  Help browser specs, platform contract, and focused implementation/test sources for
  onboarding, session lifecycle, maps, widget building, systems, joining and privacy.
- Retained the eight guides after source review. Added direct references for Help access,
  Android's minimum SDK and the packaged desktop worker limitation. Made the docs index
  welcome users and explain where Help lives. Guide text remains bundled and English-only;
  implementation references remain hidden from the in-app reader.
- The checker-unavailable statement in the historical record below is superseded:
  `scripts/validate/docs-links.ts` exists and `pnpm gates` invokes it in this checkout.

### Current validation

Commands run from the repository root. These are local checks, not remote gates or
independent review approval.

- `pnpm gates`: passed after the reference additions, exit 0; 263 documentation files
  reachable, 326 relative links resolved. Existing file-size warnings are non-blocking.
- `CI=1 DNDTOOLS_E2E_PORT=15937 pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/help-guides.spec.ts tests/e2e/help-menu.spec.ts --workers=1 --retries=0`:
  12 passed, exit 0. Every guide opens and returns to Help at desktop, rail and phone
  widths in both Chromium projects. Each tier has exactly one Help trigger; maintainer
  references are absent from the rendered articles.
- `pnpm exec prettier --check docs/README.md docs/user apps/gm-react/src/app/help/HelpMenu.tsx apps/gm-react/src/app/shell/TopBar.tsx`:
  passed. `git diff --check`: passed. No runtime code changed during this run.
- Self-review completed against the sources above. Independent review remains the central
  operator's next step. Native installation, real remote play, cloud recovery and an offline
  reopen were not exercised in this run. Historical test counts below are not current results.

## Historical run record

The following records the previous attempts and their validation at the time. In particular,
the old ownership boundary and missing-checker notes do not describe the current checkout.

## Scope and research

- Baseline: `b54cf4c7`. Prior candidate on this branch: `d551054b` (guides + Help links), which an
  independent review did not approve. Initial worktree clean. No agents spawned. No push, promotion,
  or dispatcher state edits.
- Applied the user-provided docs-research skill. No `natural-writer` agent definition and no Headroom
  tools were available in this environment.
- Read the existing architecture owners, UI, message catalog, schemas, and the onboarding, map,
  widget, system, session, joining and privacy test sources. Each guide links its sources under an
  `## Implementation references` heading that the app strips before rendering.
- Eight English guides share the existing Markdown renderer in Help. Cloud-Enhanced is described as
  consent-only and release-blocked; Android precision authoring and the desktop background-widget
  limits are stated explicitly.

## What the first candidate got wrong

The review's blocking finding was reproducible and correct: at 1280x900 the guides were not
reachable at all. `HelpMenu` had exactly one owner, `app/shell/Footer.tsx`, and `AppShell.tsx:237`
mounts that footer only on the phone tier. Above 640px the app rendered no Help trigger, so
"every page reachable from the Help menu" held on a phone and failed on a desktop or tablet.

The first candidate recorded this as a HANDOFF to the shell owner rather than fixing it, because
`Footer.tsx` and `AppShell.tsx` are RC-UX-3.4's `Owns`, not this story's. That kept the diff inside
the owned paths at the cost of leaving the acceptance criterion unmet, which is the wrong trade for
a user-facing acceptance: shipped docs nobody can open are not shipped docs.

## The fix, and the owned-path boundary it crosses

The trigger itself is new code in an owned file. `HelpMenu.tsx` now exports `HelpLauncher` — the
button, its unseen-release dot, and the menu it opens, as one self-contained element — so the shell
mounts one component and owns no Help logic.

Three files outside this story's `Owns` changed. All three are additive; nothing was removed or
re-routed, and no behavior on the phone tier changed.

- `apps/gm-react/src/app/shell/TopBar.tsx` (+4 lines): `<HelpLauncher />` in the right-aligned
  utility group, which `TopBar` renders only on the desktop and rail tiers. The phone branch of that
  same group is untouched, so the phone keeps `Footer.tsx`'s trigger and never shows two. This is
  the minimum change that makes the acceptance criterion true; there is no way to reach it from
  `HelpMenu.tsx` alone, because nothing above 640px imports it.
- `docs/architecture/NAVIGATION.md` §4: the top bar charter enumerates the utilities the bar may own,
  and Help was not among them. Updated so the contract and the code agree rather than leaving the
  code in silent violation of a documented contract.
- `apps/gm-react/tests/e2e/help-guides.spec.ts` (new): the acceptance evidence, at all three tiers.

RC-UX-3.4 (`Owns: app/shell/Footer.tsx`, `app/help/*`) remains the nominal owner of the Help
affordance and shipped only the phone trigger. Flagged for the operator: this is a scope overlap, not
a silent takeover.

## Validation

Commands run from the repository root. `pnpm gates` contains no docs-link check, so nothing here is
evidence that RC-DOC-2.2 passed — see "Remaining validation".

- `pnpm --filter @dndtools/gm-react typecheck`: passed (exit 0).
- `pnpm exec eslint apps/gm-react/src/app/help/HelpMenu.tsx apps/gm-react/src/app/shell/TopBar.tsx apps/gm-react/tests/e2e/help-guides.spec.ts`: passed. The first draft failed
  `dsn/no-raw-style-values`: the new badge's `borderRadius: '50%'` pushed `HelpMenu.tsx` to 15 raw
  values against its RC-DSN-1.1 ratchet allowance of 14. Fixed by using `T.radius.full`, not by
  raising the allowance. `pnpm lint:raw-style-count` and `vitest run tests/unit/no-raw-style-values.test.ts`
  (9 passed) confirm the ratchet is unchanged.
- `pnpm exec prettier --check` over every changed file: passed.
- `pnpm test:app`: 126 files, 1327 tests passed — identical to the baseline gate's count.
- `CI=1 DNDTOOLS_E2E_PORT=15931 pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/help-guides.spec.ts tests/e2e/help-menu.spec.ts --workers=1 --retries=0`:
  12 passed in both Chromium projects. `help-guides.spec.ts` drives desktop (1280x900), rail
  (900x800) and phone (390x844); at each it asserts exactly one control named "Help", then for all
  eight titles opens the guide, checks the article has real prose and no `Implementation references`
  section, and returns to the menu from the guide's footer. The 1280x900 case is the one the review
  reported failing.
- `CI=1 DNDTOOLS_E2E_PORT=15933 pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/responsive.spec.ts tests/e2e/a11y-axe-gate.spec.ts tests/e2e/session-posture.spec.ts tests/e2e/authoring-layout.spec.ts --workers=2 --retries=0`:
  153 passed, 1 skipped. These are the suites a new top-bar control is most likely to break —
  overflow at narrow widths, the axe route gate, and the TOPBAR_CHARTER status-only assertion.
- Full browser suite (`CI=1 DNDTOOLS_E2E_PORT=15941 DNDTOOLS_PW_WORKERS=3 pnpm --filter @dndtools/gm-react exec playwright test`),
  run because the top bar is on every route: **1104 passed, 11 skipped, 1 flaky, exit 0** in 17.7
  minutes. The one flaky is `knowledge-filters.spec.ts:101` on mobile-chromium, which fails on the
  first attempt and passes on retry. It is not this change: it fails the same way at the unmodified
  baseline, and its cause is the async `setSaveName('')` reset in `SavedSearches.tsx`, not the shell.
  The baseline gate for `d551054b` reported 1097 passed / 11 skipped / 2 flaky.
- Relative-link check over the whole `docs/` tree: 278 links across 94 files, one "failure" —
  the literal `](…md)` inside RC-DOC-2.2's own description of the rule in `RC_ROADMAP.md`. That is a
  pre-existing false positive in an unchanged file, not a broken link. Reproduce:

```sh
python3 - <<'PYTHON'
from pathlib import Path
import re
files = sorted(Path('docs').rglob('*.md'))
checked = broken = 0
for source in files:
    for target in re.findall(r'\]\(([^)\s]+)\)', source.read_text()):
        if '://' in target or target.startswith(('#', 'mailto:')):
            continue
        checked += 1
        if not (source.parent / target.split('#')[0]).resolve().exists():
            broken += 1
            print('BROKEN', source, '->', target)
print(f'{checked} relative links checked across {len(files)} docs files, {broken} broken')
PYTHON
```

## Review and remaining validation

- Self-reviewed the guide text against the linked sources and the existing tests. Session
  instructions put Go live before the start dialog, with the confirmation inside it. Source
  references stay out of the in-app prose. No external release-availability claims.
- Re-verified the concrete UI strings the guides quote against `i18n/messages/en.ts` and the source:
  `.dndmodule`, "Tables on your network", "Type the room and PIN instead", "Online join code",
  "Invite code from your DM", "Leave table", "Project to players", "Build a widget", "App updates".
  Android 7.0 checks out against `android/variables.gradle` (`minSdkVersion = 24`).
- Dropped "Quick Map" from `maps.md` and `android-desktop-install.md`. It is an internal name
  (`quickMapMode`, `android-quick-map.spec.ts`); the only place a user meets it is the "Quick map
  actions" toolbar label, so calling it a mode sent readers looking for a control that is not there.
  Both now describe what the Android editor actually does, per that spec's assertions: canvas-first,
  48dp controls, navigation armed by default, precision drawing tools absent, and the in-app
  **More map actions → About advanced drawing** note that says the same thing.
- `getting-started.md` now names where Help actually is (top-bar info button, or the row above
  the phone tab bar). The first candidate could not say this, because on desktop it was nowhere.
- The new button is a DS `IconButton` at `size="lg"` (2.75rem = 44px), which meets the 44px touch
  floor the navigation contract sets and matches the other top-bar utilities.

Still open, and not claimed as done:

- **RC-DOC-2.2 does not exist in this baseline.** `scripts/validate/docs-links.ts` is absent and
  `scripts/quality-gates.ts` has no docs-link gate, so the acceptance clause "the docs link checker
  (RC-DOC-2.2) passes" cannot be satisfied from this story. The hand-run check above covers only the
  first of RC-DOC-2.2's four rules (relative links resolve); whole-tree reachability from
  `docs/README.md`, the TESTING/LOCALIZATION string couplings, and the ADR status/index equality are
  unchecked. Implementing the checker is RC-DOC-2.2's own `Owns` (`scripts/validate/docs-links.ts`,
  `scripts/quality-gates.ts`) and was left alone.
- No native device installation, live remote table, cloud recovery, or offline browser session was
  exercised. The Android and desktop guide describes behavior read from source and existing tests.
- The guides are English only. The app marks their sections and articles `lang="en"` so a Spanish UI
  does not misannounce them, but they are not translated.
