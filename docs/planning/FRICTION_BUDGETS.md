# Friction budgets in the golden paths

RC-ENG-9.2. These are maximum interaction counts on **both** `desktop-chromium` and
`mobile-chromium`. Every row has a real application journey and a boundary fixture
that passes at its ceiling and fails after one additional confirmation dialog.

| Budget ID           | Maximum | Unit       | Measurement and journey                                                                                                                                                                                                         |
| ------------------- | ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onboarding-clicks` | 5       | clicks     | First onboarding page through visible Command Center guide; includes focusing campaign name. `golden-path.spec.ts`: first run.                                                                                                  |
| `onboarding-keys`   | 12      | keystrokes | Same complete onboarding with Tab/Shift+Tab and Enter, from initial content focus; no pointer or scripted focus. `friction-budgets.spec.ts`: keyboard onboarding.                                                               |
| `capture-note`      | 2       | actions    | Notes library through focused note body, before its first character: New note, Enter. `golden-path.spec.ts`: knowledge journey.                                                                                                 |
| `quick-track`       | 6       | clicks     | Reading board through a visible Quick-track widget: Edit layout, Add, Build your own, recipe, Next, Add to screen. `widget-quick-builder.spec.ts`: Counter or clock (also Party list).                                          |
| `tile-layout`       | 4       | actions    | Already in Edit layout: Add, Dice, move drag, resize drag; both layout changes must appear. `friction-budgets.spec.ts`: tile journey.                                                                                           |
| `player-damage`     | 2       | taps       | Joined player's My character sheet: tap amount, tap Damage; changed HP must reach the DM and player. `companion-sheet.spec.ts`: joined sheet journey. Touch enabled at both viewport sizes.                                     |
| `help`              | 1       | click      | Each GM shell route and entity detail through visible Help dialog. `friction-budgets.spec.ts`: Help journeys.                                                                                                                   |
| `table-scene`       | 1       | action     | Configured Start session dialog through shared scene visible on joined player's stage. Includes the final Start session confirmation, so no further action is required after Start. `table-view.spec.ts`: shared-scene journey. |

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
ceilings and every recorded version of this table reachable in local Git history.
CI/review must retain the table's history when validating a tightening (a shallow
checkout can only compare its available history and the original ceilings).
Do not remove a row, relax a limit or move a measurement boundary to hide a failure.

`friction-budgets.spec.ts` runs the counter's scripted-sequence unit test in a real
browser and a seeded extra-dialog fixture for every ID (including both onboarding
alternatives). Boundary fixtures consume the full allowance before adding the
dialog; this tests the ceiling, not a claim that every current journey has no spare
capacity. They invoke the exact same `assertWithin` used by the real journeys.
