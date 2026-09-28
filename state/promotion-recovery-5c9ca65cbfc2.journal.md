# promotion-recovery-5c9ca65cbfc2 run journal

## Scope

Repair the failed promotion gate `CI: e2e` for `5c9ca65cbfc212a53fc645453b8eea71120b3349`
(fingerprint `1d00391366f6`). No push, promotion, loops, or dispatcher control-state edits.

## What is red

The gate had 1 failed and 1603 passed tests. The failure was
`characters-polish.spec.ts:24` "roster polish: axe on roster, action sheet, creation chooser and
import overlay" on mobile-chromium. It failed at the "More character actions" sheet step with
axe `color-contrast` on three nodes: the sheet title `h2` and the first two action buttons.
Axe measured fg `#80776c` on bg `#241c13` (3.81:1). That foreground is the sheet text blended
toward the background.

## Reproduction

- The unmodified spec passed 12/12 (`--repeat-each=12`, mobile-chromium) on an idle host, so the
  failure depends on host load.
- A temporary probe opened the sheet, paused `dndScrimIn` and `dndSheetUp` 40 ms into the entry,
  and ran axe. It reported `color-contrast` on the same three nodes (2.21:1 at that frame).
- A second probe slowed the entry to `playbackRate = 0.05`. Scanning right away failed. Waiting
  for the finite animations first gave no violations. So the settled sheet passes, and the gate
  failure came from axe scanning a transient entry frame.

## Fix

`characters-polish.spec.ts` `axe()` now waits on `animation.finished` for every finite
animation before it scans. This is the same settle step `_communityAxe.ts` and
`char-builder-polish.spec.ts` use. The assertion is unchanged (`violations` must equal `[]`),
and the scan still covers the roster, the action sheet, the creation chooser and the import
overlay. Only infinite animations (spinners) are left out of the wait.

## Verification

- `characters-polish.spec.ts` with `--repeat-each=6` on both projects: 60/60 passed.
- `eslint` and `prettier --check` on the changed spec: clean. I deleted the probe spec.
