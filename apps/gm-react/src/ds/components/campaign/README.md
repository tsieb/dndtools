# Campaign cards

`QuestCard` keeps the status, hook, objective checklist and reward in the DS card.
Its optional `footer` slot contains caller-owned visibility and author controls.
Omitting `onToggleObjective` renders a readable checklist; supplying it exposes
pressed-state buttons. The screen remains responsible for core commands and permissions.

`NpcCard` is a quick reference with a wrapping name, role/location, optional
explicit disposition, secret hook and tags. The name button is the keyboard
entry point when `onClick` is supplied. Missing disposition data renders no badge.

`SessionTimeline` defaults to `layout="log"` for vertical session feeds.
`layout="arc"` places ordered beats in a horizontally scrollable campaign strip.
The strip is keyboard focusable; callers supply its accessible name with
`aria-label`. `active` exposes the current step. Array order is preserved.

The Campaign faction dossier uses the same display typography, spacing tokens
and accent edge while retaining role-projected goals and DM secrets.

Visual acceptance lives in `tests/visual/campaign-cards.spec.ts`, with four
core-backed surfaces on desktop and phone, plus quest and arc captures on the rail tier. Generate and
compare baselines using `tests/visual/run-in-container.sh` from the app directory
(or the full repository-relative script path from the root).
