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
  asserts no two rows in a scope share a description.

## Log
