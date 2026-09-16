# RC-CAN-7.5 run journal

Parity inventory of the three run surfaces, before anything is converted.

## Implementation

- `docs/planning/SCREENS_PARITY.md` (new, the story's owned path) records every element of the
  Command Center (`/`), the GM screen board (`/board`) and the Session console (`/session`) as they
  ship at `83f94aabb28cf188630d30e56f9d301d2773fb26`. 15 Command Center rows, 20 board rows (13
  chrome + the 7 seeded tiles), 30 Session rows (6 lifecycle, 8 combat, 12 panels, 4 dialogs). Each
  row carries behaviour, the states observed, its keyboard and heading contribution, its per-tier
  behaviour, and a parity target that is either an existing builtin, a template kind, screen chrome
  another story owns, or a named gap.
- `docs/planning/README.md` gains one paragraph pointing at the new document. This file is **not**
  in the story's `Owns:`; the RC-DOC-2.2 docs gate fails any `docs/**` file that no chain of
  relative links from `docs/README.md` reaches, and `docs/planning/README.md` is the only file that
  links into this folder. Confirmed by creating the new document as a stub and running
  `pnpm gates`, which reported exactly one problem:
  `[unreachable-doc] docs/planning/SCREENS_PARITY.md`. The edit is one paragraph and touches nothing
  else in that file.
- `state/RC-CAN-7.5/aria/` — 27 aria snapshots, the evidence the acceptance criterion is measured
  against. `state/RC-CAN-7.5/screens/` — 41 screenshots, the three themes × three tiers for each
  route plus the state variants, converted from Playwright PNG to **lossless** WebP (3.0 MB rather
  than 3.9 MB; `magick … -define webp:lossless=true -define webp:method=6`, so no pixel changed).
  The roadmap's own risk row for this conversion names "committed baselines", which is why these are
  in the tree rather than only in a scratch directory.
- No product code, no test, no dispatcher state and no roadmap file was changed. No agents, no push,
  no promotion, no loop.

## How the capture was made

A temporary Playwright spec pair under `apps/gm-react/tests/e2e/` drove the capture and was deleted
before the commit — it exercises the bespoke surfaces CAN-7.9 removes, so committing it would create
a second thing to delete. It used the repo's own `_helpers.ts` (`markOnboarded`, `gotoRoute`,
`seedFresh`, `enterPreview`, `exitPreview`) on `--project=desktop-chromium --workers=1`, driving all
three tiers with `page.setViewportSize` so device emulation could not fight the media queries.

```sh
# from apps/gm-react, with a port nothing else holds
DNDTOOLS_E2E_PORT=15701 CAN75_OUT=/tmp/can75 \
  pnpm exec playwright test tests/e2e/<harness>.spec.ts --project=desktop-chromium --workers=1
```

- Theme was set by `page.addInitScript` writing `dndtools:react:theme` before boot, which is what
  `public/prepaint.js` reads, so each theme is a real pre-paint boot, not a runtime switch.
- Aria snapshots are `#main-content` (the route), except the three dialog snapshots, which are
  `body` because a dialog renders outside the main landmark.
- Lifecycle states were arranged with `session.set-workflow` through the DEV `window.__rt` seam, the
  same shortcut `session-lifecycle.spec.ts` uses to arrange a state.
- Two capture attempts failed first and were corrected rather than worked around:
  `combat.start` was rejected with "Command payload failed schema validation" because
  `startCombatantSchema` requires `kind` and `name`, not just `characterId`; and the rest dialog's
  confirm is `Call the rest` after choosing a radio, not a "Long rest" button. Both were fixed and
  the run reported `combat.start → accepted` before the live-combat snapshot was taken.
- Two files were renamed after capture because their first names were wrong:
  `session-phone-active` was byte-identical to the recap snapshot (the harness drove
  prep → active → recap in order, so the phone capture ran after recap) and is now
  `aria-session-phone-recap.yaml`; the player-preview session snapshot is now
  `aria-session-desktop-recap-preview-player.yaml` for the same reason. §5 of the document says so
  rather than leaving the labels to be trusted.

## Findings that changed the document

- The hub's accessibility tree is **identical** at desktop, rail and phone; so is Session's, at every
  lifecycle state including live combat with the full initiative list. Only `/board` differs by
  tier, and only in the Initiative tile's reduced phone variant. Verified by `diff`, not by reading.
- `/board` on a 390px phone clips its third column horizontally at the ≈0.45 fit scale and renders
  Prep and Quick Reference body text below legibility. Recorded as D-07 with the existing mobile axe
  `target-size` failure from `state/RC-DSN-2.2.browser-baseline.md`, which predates this story.
- The seeded Map tile is **unbound** at this base and shows a repair instruction as its resting
  state. `be3c2e2c` ("RC-ENG-8.2 default content binds the home Map tile") exists on another
  dispatcher branch and `git merge-base --is-ancestor be3c2e2c HEAD` is false, so it is not in this
  tree. Recorded as D-06 with a note to re-baseline that row after it lands, rather than describing
  behaviour this commit does not have.
- Five more defects were observed and recorded without being fixed (none is in this story's `Owns:`):
  no heading at all in the hub's player and observer variants, one heading for seven board tiles, the
  Create grid staying two columns on a phone, the avatar stack truncating at five silently, and the
  Prep / Quick Reference list bodies reordering their rows between renders with no state change.

## The gap register, and what is not done

§4.1 assigns 4 gaps across 60-odd rows to the existing RC-WID-5.1–5.4. §4.2 proposes **five more**
that none of 5.1–5.4 covers: widget-owned dialogs and confirmations (six Session controls raise a
modal, four of them guarding an irreversible write); declarative gating with disabled reasons and
live regions (every gated control on both surfaces carries its reason inside its accessible name);
declared keyboard models (the combat tracker's bare-key model); multi-select over a query source (the
capture form's 14-item checkbox group and the encounter builder's roster); and a labelled region plus
heading for a bare widget (without which WID-5.3's bare presentation deletes Session's `<h2>` per
panel).

**The acceptance criterion is therefore only partly met, and this is the one thing to carry
forward.** The matrix covers every control in the aria snapshots — that half is done and the
snapshots are committed so it can be checked. But "filed as a new WID-5 story" requires editing
`docs/planning/RC_ROADMAP.md` §6 and the §23 story index and re-running
`tools/roadmap/sync-tasks.py`; the roadmap is outside this story's `Owns:` and running dispatcher
tooling is outside its brief. The five stories are written in the roadmap's own story format in §4.2
so filing them is a copy, but until they are filed **CAN-7.6's precondition is not satisfied**.

## Validation

- `pnpm gates`: exit 0. Docs check passed — 255 files reachable from `docs/README.md`, 288 relative
  links resolved, up from 254 files and 279 links before this story. File-size warnings are the
  repo's existing set, unchanged.
- `pnpm exec prettier --check` on both changed markdown files: passed.
- The capture harness itself passed 7/7 across its two specs before deletion; its output is the
  committed evidence, and the two failures above are recorded rather than hidden.
- No unit, browser or typecheck run is claimed for this story: it changes no code. Full operator
  gates and independent review remain external.
