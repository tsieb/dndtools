# Friction budgets in the golden paths

RC-ENG-9.2. These are maximum interaction counts on **both** `desktop-chromium` and
`mobile-chromium`. Every row has a real application journey and a boundary fixture
that passes at its ceiling and fails after one additional confirmation dialog. Rows
whose journey is at its ceiling also have that dialog seeded into the real app.

| Budget ID           | Maximum | Unit       | Measurement and journey                                                                                                                                                                                                                       |
| ------------------- | ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onboarding-clicks` | 5       | clicks     | First onboarding page through visible Command Center guide; includes focusing campaign name. `golden-path.spec.ts`: first run.                                                                                                                |
| `onboarding-keys`   | 12      | keystrokes | Same complete onboarding with Tab/Shift+Tab and Enter, from initial content focus; no pointer or scripted focus. `friction-budgets.spec.ts`: keyboard onboarding.                                                                             |
| `capture-note`      | 2       | actions    | Notes library through focused note body, before its first character: New note, Enter. `golden-path.spec.ts`: knowledge journey.                                                                                                               |
| `quick-track`       | 6       | clicks     | Reading board through a placed, visible Quick-track widget: Edit layout, Add, Build your own, recipe, Next, Add to screen. `widget-quick-builder.spec.ts`: Counter or clock (also Party list).                                                |
| `tile-layout`       | 4       | actions    | Already in Edit layout: Add, Dice, move drag, resize drag; both layout changes must appear. `friction-budgets.spec.ts`: tile journey.                                                                                                         |
| `player-damage`     | 2       | taps       | Joined player's My character sheet: tap amount, tap Damage; changed HP must reach the DM and player. `companion-sheet.spec.ts`: joined sheet journey. Touch enabled at both viewport sizes.                                                   |
| `help`              | 1       | click      | Each GM shell route and entity detail through real Help: the Help menu with its Guides section, or the route's own guide (its article and All help topics). Any other dialog does not complete it. `friction-budgets.spec.ts`: Help journeys. |
| `table-scene`       | 1       | action     | Configured Start session dialog through shared scene visible on joined player's stage. Includes the final Start session confirmation, so no further action is required after Start. `table-view.spec.ts`: shared-scene journey.               |

The Help route inventory covers every GM shell route (including aliases, nested
routes and dynamic screen, scene, character and note details). Standalone companion,
join, wiki, legal and projection documents have no GM-shell Help launcher.

## Counting contract

`countActions(page)` in `tests/e2e/_helpers.ts` captures trusted browser input rather
than counting calls in a journey. Pointer clicks and touch taps count once, including
compatibility events. A drag counts once regardless of its move events. Each
non-modifier keydown counts, including repeats and typed characters; modifiers
belong to the chord. Keyboard-generated clicks are not counted again. Wheel and
native touch scrolling are excluded (native scrolling cancels its pointer gesture).

Text payloads (campaign name, note title, damage amount) use `fill` or `insertText`;
their character length is not a navigation budget. Pointer focus and keyboard
traversal still count. Do not inject focus, dispatch commands or otherwise bypass UI
steps inside a measured segment. Seed data, joining a table, selecting a character,
and entering Edit layout for the tile journey happen before their named segments.
The note's body is never filled before its budget assertion.

`assertWithin(id)` checks **all** counted actions against the row, even for a
click-only flow: adding a keyboard detour cannot evade a click ceiling. Failure
messages include the budget ID, actual/maximum count and every action's kind and
target. Passing counts are retained in Playwright annotations. Full document
navigation during measurement fails closed; start a new segment after navigation.

## Tightening only

Update the executable `FRICTION_BUDGETS` constants and this table together. A
ceiling may only decrease. The browser gate checks table/code parity, original
ceilings and every committed version of this table in HEAD's history. A shallow
checkout (CI clones at depth 1) has no such history, so the check fetches HEAD's
commit graph from `origin` without blobs into a scratch repository and reads the
table versions from there. If that history cannot be obtained, the check fails
("Friction budget history unavailable") rather than comparing against nothing.
Do not remove a row, relax a limit or move a measurement boundary to hide a failure.

## Seeded defects

`friction-budgets.spec.ts` runs the counter's scripted-sequence unit test in a real
browser and a seeded extra-dialog fixture for every ID (including both onboarding
alternatives). Boundary fixtures consume the full allowance before adding the
dialog; this tests the ceiling, not a claim that every current journey has no spare
capacity. They invoke the exact same `assertWithin` used by the real journeys.

The journeys themselves also run with one dialog seeded into the application
(`seedExtraDialog`): the first trusted activation of the named control opens an
"Extra confirmation" dialog, and confirming it replays the original action. The
seeded run first proves the step has not taken effect while that dialog is showing
(so the journey's completion check cannot be met by it), then completes the same
journey and requires `assertWithin` to fail with one action over the ceiling and
the extra step in its trace.

| Budget ID       | Seeded control | Seeded test                                                        |
| --------------- | -------------- | ------------------------------------------------------------------ |
| `capture-note`  | New note       | `golden-path.spec.ts`: seeded defect before the new note           |
| `quick-track`   | Add to screen  | `widget-quick-builder.spec.ts`: seeded defect before Add to screen |
| `tile-layout`   | Add            | `friction-budgets.spec.ts`: seeded defect before the Add panel     |
| `player-damage` | Damage         | `companion-sheet.spec.ts`: step 5 of the joined sheet journey      |
| `help`          | Help           | `friction-budgets.spec.ts`: seeded defect on `/` and `/board`      |
| `table-scene`   | Start session  | `table-view.spec.ts`: seeded defect before Start session           |

The onboarding journeys run below their ceilings (keyboard onboarding currently uses 9 of
12 keys; pointer onboarding 4 of 5 clicks), so one added dialog does not exceed them
today; their boundary fixtures cover those ceilings. Tightening either row to its
current count makes an in-app seed meaningful there too.
