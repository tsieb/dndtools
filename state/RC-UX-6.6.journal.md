# RC-UX-6.6 — Help a lost GM can find and read

Base: `loop/rc` 9a7b675d (RC-POL-1.23). Branch `dispatch/dndtools/544e7443768b9756dc84`.

## Plan

- ONB-10: `HelpTrigger` (HelpMenu.tsx) renders a labelled "Help" button on every tier. The top-bar
  charter (NAVIGATION.md §4) said "44px icon button, no visible label"; amended (companion path
  `docs/architecture/*.md`) so Help is the one utility that keeps its word at the rail tier.
  The unseen-release dot on the trigger is gone; a "New" chip sits on the What's new row instead and
  only clears once the DM has actually seen that row.
- Route → guide map in `helpTopics.ts`: screens, session, characters, maps, notes, settings. New
  guides `docs/user/{screens,characters,notes,settings}.md`. Help opens on the route's guide; its
  footer "All help topics" goes one level up to the full list. Routes with no guide open the list.
- ONB-9: `changelog.ts` reads only the `### For players and GMs` block of each release, strips code
  spans/emphasis, and `latestRelease` returns null when the latest shipped release has no block →
  "No notes for this release." (`help.whatsNewNone`). `ReleaseNotes.tsx` is untouched.
- ONB-17: guide paragraphs tagged `<!-- keyboard -->` / `<!-- touch -->`; the phone tier reads the
  touch variant. Test: every keyboard paragraph has a touch twin, no keyboard copy is untagged.
- ONB-18: Space row gets its own description (`shortcuts.action.canvasPickUp`); registry test
  asserts no two rows share a description.

## Log
- 2026-10-04 commit abc1be32: implementation + unit tests. `vitest app help/ shortcuts/ i18n/` green
  (101 + 47). `tsc --noEmit` (gm-react) clean. qps-ploc regenerated.
- Registry "no two rows share a description" also caught map `Pan` (tool) vs `Space + drag` (Pan):
  `mapEditor.shortcut.pan` now reads "Pan without switching tools" (en/es).
- Prettier puts a blank line after `<!-- keyboard -->`, so a marker paragraph tags the NEXT
  paragraph (`guideParagraphs`).
- e2e: guide dialog failed axe `scrollable-region-focusable` (prose body, no controls, scrolls) →
  `<article tabIndex={0} aria-label>`. help-menu.spec 12/12 both profiles after the fix.
- Crossed outside Owns (all manifest companions except one): i18n catalogs, e2e specs, unit tests,
  CHANGELOG.md, docs/architecture/NAVIGATION.md (charter admits the labelled Help). Non-companion:
  `docs/README.md` user-guide index (said "info button", "eight guides") — two-line doc fix.
- e2e (desktop-chromium + mobile-chromium, port 5761): help-menu, help-guides, shortcuts,
  palette-polish, shell-polish, responsive, session-posture, command-palette → 248 passed, 3 failed.
  2 were shell-polish's axe matrix expecting the Help list on `/screens` (it now opens on the Screens
  guide; spec updated to axe the guide AND the list); 1 was the phone palette focus-return check,
  which passed 4/4 on rerun (shell-polish `--repeat-each=2` both profiles: 40 passed).
- Visual (container): the labelled Help changes the top bar on every desktop/rail golden (diffs
  confined to rows 13–61) and the phone footer row; Help/shortcuts dialogs changed by design.
  Re-baselined `--update-snapshots=changed` on all three tiers (300 PNGs). Fresh Chromium PNGs were
  +25% vs the base's filter-0 encodes (37,748 KiB, over the 32 MiB cap); a lossless re-encode
  (unfilter → best of filter-0 / original filters at zlib 9, pixels asserted equal) brought the set
  to 30,064 KiB (base 31,867). Strict compare after re-encode: desktop+rail 322 passed, phone 161.
