# RC-POL-1.10 — Story (Campaign)

Implementation complete; local validation recorded below. Scope: owned surface, required EN/ES copy, tests, snapshots, style ratchet, inventory. No dispatcher controls or remote refs changed.

### 20.2 Design fidelity

- [x] Composed only from `src/ds` primitives and `screen-kit`; zero raw hex/rgba/px literals (DSN-1.1 lint clean for this directory). — DS controls and screen-kit compose the surface. Removed every owned raw-style allowance; scoped ESLint is clean. Waiver: responsive grid minima, SVG coordinates, one-pixel borders and fixed calendar input widths remain structural dimensions rather than spacing tokens; no raw palette values are introduced.
- [x] Matches the prototype view for this section (`docs/design/README.md` §4) and the design-package template where one exists; deviations listed with rationale. — Uses the vendored NpcCard, QuestCard and SessionTimeline contracts. Waiver: the live prototype is not available through this task's tools and no Campaign template is vendored. Retained the existing tabbed structure rather than claiming a live prototype comparison.
- [x] One primary action per region in gold; supporting tiles flat/sunken; the primary panel raised with `--shadow-md`. — Quest/faction create or save is the sole gold action in its region. Faction cards use the flat surface; quest/faction editor panels use shadow-md. Calendar date-a-note is secondary; calendar new and save are mutually exclusive.
- [x] Type hierarchy uses 3–4 sizes; Cinzel only ≥ 24px; numbers in mono. — Owned text uses the token scale; small faction headings and calendar dates use sans. Waiver: shared Panel/NpcCard/QuestCard typography is outside the owned paths and retains its existing heading treatment; calendar prose combines date numbers and translated labels rather than making the whole sentence mono.
- [x] Every status color paired with a distinct icon shape; DM-only purple stripe where applicable. — Faction stances carry distinct icons (including neutral/allied); the DS quest status carries its icon. All quest/faction cards retain visibility chips; DM-only faction cards have a purple stripe. Secret labels use readable primary text, not the lower-contrast badge pigment.
- [x] Renders correctly in all themes and all three tiers; visual snapshots updated and reviewed. — 15 pinned-container snapshots updated and compared: five themes by desktop, rail and phone. Visually reviewed the complete contact sheet; phone navigation wraps and the illustration/action remain visible. Captures target #main-content because shell chrome is independently covered. Populated quest, NPC, faction and arc cards are pinned by the RC-KNW-3.2 `campaign-cards.spec.ts` images on all three tiers (rebaselined in attempt 3). Waiver: editor and confirmation-dialog states are not pixel-pinned; they are covered by axe and functional checks on both profiles.
- [x] Motion uses named tokens; nothing animates under `data-motion='reduced'`. — No custom motion added. Dialog uses the DS motion tokens and reduced-motion implementation; snapshots run with reduced motion. Axe waits for finite entrance animations before measuring contrast.
- [x] Empty, loading, error, and "unavailable because…" states all present and illustrated where the key exists. — Added quests, NPCs, factions, timeline, calendar and relationship illustrations using existing keys. Waiver: the runtime provider owns initial loading/error before mounting this synchronous local-state route; no per-screen network fetch or dedicated loading/error illustration key exists. Save failures remain actionable alerts/toasts; calendar read-only text explains unavailability.

### 20.3 Interaction and UX

- [x] Every action has feedback within 100 ms (optimistic or skeleton) and a completion toast or inline state. — Editor dispatches immediately disable save/cancel; tracker status disables while persisting; completion toasts confirm saves. Calendar and relationships release busy state and report thrown persistence failures. Waiver: no wall-clock 100 ms latency assertion on this shared workstation; synchronous busy updates are verified behaviorally.
- [x] Every destructive action is undoable or confirmed; every confirm names the thing. — Relationship removal opens a dialog naming source, verb and target, initially focusing Cancel; tests confirm cancellation and removal. Calendar row removal only changes the unsaved draft, recoverable with Cancel/reopen; committed calendar changes still require Save.
- [x] Save status visible on auto-persisted surfaces; failures say what to do next. — Quest tracker updates retain their inline status/objective state and show Saved; thrown failures advise checking storage and retrying. Other forms explicitly save rather than auto-persisting. Draft survives failed quest save in the test.
- [x] One clear route back; browser back works; Android Back follows the documented order. — Existing breadcrumb and browser history navigation retained; relationship Back test is green. Dialog delegates Escape/focus restore to DS. Waiver: physical Android Back is not exercised by Chromium mobile emulation; no platform back-handler contract changed.
- [x] No hover-only or gesture-only discovery; touch targets ≥ 44 px (48 dp Android). — All actions remain visibly labelled or have IconButton accessible labels/tooltips. Owned icon buttons now have a 48px minimum via space-12. Waiver: other DS controls retain the shared density/touch policy (compact desktop sizes are not enlarged globally by this surface task).
- [x] The compact tier exposes one primary top-bar action; overflow in a bounded sheet. — One primary Story action; Relationships remains a visible wrapping secondary action on phone. Waiver: no new overflow sheet is needed for this single secondary action; an extra sheet would add a navigation step without reducing crowding.
- [x] Copy follows the content fundamentals; strings via `t()`; ES present. — Copy reviewed against sentence-case, direct verbs and explicit visibility language. All added confirmation text is in t() with EN/ES translations. User-authored relationship verbs/note titles are content, not translated UI.
- [x] Contextual help (HelpTip) beside any non-obvious control; shortcuts in tooltips. — Existing ContextHelp and calendar HelpBeside retained; editor Field help explains objectives, hooks, dossier and secret. Icon controls retain descriptive tooltips. No new shortcut introduced.

### 20.4 Accessibility

- [x] axe clean (desktop + mobile) for this route and its open overlays; register unchanged. — campaign-polish.spec.ts scans the route, all tabs, quest/faction editors, calendar list/form, relationship empty/populated views and named removal dialog on both Chromium profiles. Zero violations asserted (including moderate/best-practice); known-violations register unchanged.
- [x] Keyboard-only walkthrough of the primary task recorded in the PR; focus visible everywhere. — Automated keyboard walkthrough: focus Create first quest → Enter → title receives focus → type title → Enter → injected failure preserves draft → Enter retry → success → New quest receives focus. Dialog Cancel restores launcher focus. Existing NPC Enter navigation test remains green. This journal carries the walkthrough because the task requests a local commit, not a PR.
- [x] Landmarks and headings correct (`<h1>` once, from `SECTION_TITLES`); `nav` labelled. — Route uses the shell heading; calendar subheading changed from h1 to h2. Existing labelled breadcrumb/tablist retained. Axe checks document landmarks and heading order.
- [x] Live regions announce operations; no announcement spam. — DS Toaster and inline role=alert report operations; empty illustrations are decorative and empty states are not live regions. No continuously updating live region added.
- [x] Screen-reader spot check on one platform noted. — Waiver: no native screen-reader session is available in this worker. Chromium axe, accessible-name/focus assertions and role-based keyboard tests are recorded; they are not claimed as NVDA/TalkBack speech verification.
- [x] 200% zoom / large text: no clipping; reachability spec case added if new scroll regions. — Both profiles pass the 200% root-text test: create remains reachable, succeeds, and document width does not overflow. No new scroll region introduced. Editor grid minima now clamp to the available width.

### 20.5 Core discipline and correctness

- [x] No state mutation outside `runtime.dispatch`; no client-side visibility filtering. — All durable mutations remain runtime.dispatch commands. Content/characters/relationships use actor reads; faction fields use core role projection. Local form draft edits are presentation state.
- [x] Preview-as-player: writes rejected read-only and controls hidden/disabled accordingly. — New player-preview test proves quest creation hidden and an attempted create rejected read-only. Relationship authoring is now gated on core actorCanAuthorContent; no permission bypass introduced.
- [x] Player projection of this surface verified through an actor read in an e2e. — Existing campaign.spec.ts verifies shared versus secret quests/factions and omission of DM-secret fields through player preview's actor projection. Those assertions run on both profiles.
- [x] e2e on both profiles covers the primary task and one failure path. — Full Campaign suite covers durable quest/faction/calendar/relationship writes and reloads; the new failure path injects a thrown create dispatch, checks retained input/error/enabled retry and successful recovery on both profiles.
- [x] Perf: the surface's budget measured before/after (ENG-1.1); no regression. — Waiver: ENG-1.1 has no Story-specific budget or capture scenario (see docs/development/PERFORMANCE.md). No credible before/after reference-hardware measurement is claimed. The actor queries and memo boundaries are unchanged; extraction adds no network dependency. Browser suite durations below are validation timing, not performance-budget evidence.
- [x] Docs: FEATURE-GAPS inventory row updated; architecture doc updated if a contract moved. — FEATURE-GAPS Story row updated with coverage and limitations. No core command/schema/persistence contract changed, so no architecture-doc revision is needed.

## Verification

Attempt 1, run from the task worktree on base 6dd4f09c. Initial failed runs are described here
rather than hidden:

- Initial full e2e: 28 passed, 2 failed on faction DM-secret text contrast (4.21:1). Changed the owned label to primary text while retaining the purple stripe/visibility chip.
- Next focused scan exposed contrast during the DS dialog entrance animation. The test now waits for finite animations to finish; it does not exclude nodes, disable rules or change the violation register.
- Final full e2e: **32 passed (43.1s)** across desktop-chromium and mobile-chromium.
- Pinned visual generation: 15 passed (31.3s); separate comparison: 15 passed (28.4s).
- Baseline budget: 502 files, 32558.7 KiB / 32768.0 KiB; the complete set shrank despite adding two themes.
- App typecheck, scoped ESLint, boundary lint, git diff --check: passed.
- pnpm gates: passed; unrelated existing file-size warnings remain. None names Campaign.tsx or screens/campaign/. Owned files range from 32 to 430 lines.

Headroom tools were not exposed in this session; native command output was read directly.
No push, promotion, dispatcher state modification, or additional agent was performed.

### Reproduction commands

```sh
pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/campaign.spec.ts tests/e2e/campaign-calendar.spec.ts tests/e2e/campaign-relationships.spec.ts tests/e2e/campaign-polish.spec.ts --workers=2
DNDTOOLS_PW_WORKERS=2 apps/gm-react/tests/visual/run-in-container.sh -g 'Story polish' --update-snapshots=changed
DNDTOOLS_PW_WORKERS=2 apps/gm-react/tests/visual/run-in-container.sh -g 'Story polish'
node apps/gm-react/tests/visual/check-baseline-budget.mjs
pnpm --filter @dndtools/gm-react typecheck
pnpm exec eslint apps/gm-react/src/screens/Campaign.tsx apps/gm-react/src/screens/campaign apps/gm-react/tests/e2e/campaign-polish.spec.ts
pnpm lint:boundary
pnpm gates
```

All commands above completed successfully. Formatting checked across every changed source,
test, catalog, inventory, ratchet and journal file. Scoped ESLint emitted no diagnostics.
The central operator's independent review and integration gates are separate from this local evidence.

## Attempt 2 — claim fence and reconcile onto loop/rc 5611f236

Gate feedback: the candidate committed runner logs under `state/RC-POL-1.10/` (boundary, e2e,
format, gates, typecheck, visual-compare), which are outside the claim. Those files are removed;
the results that mattered are summarised in this journal, and the raw logs from this attempt stay
outside the tree in `/tmp/rcpol110-*.log`.

`loop/rc` had moved 58 commits past the old base, and a trial `git merge-tree` conflicted on
`Campaign.tsx` and six `campaign--*.png` baselines, so the candidate was rebased onto 5611f236:

- `Campaign.tsx`: RC-WID-5.1 added an "open quest" intent target (`targeted` prop, scroll/focus,
  `aria-current`, outline) to `QuestCardRow`, which this story had moved to `campaign/Cards.tsx`.
  Ported it there unchanged except that `outlineOffset` uses `var(--space-1)` instead of a raw 4,
  keeping the owned files at zero raw-style allowances. The intent handling, `questTarget` state and
  tab-change reset auto-merged in `Campaign.tsx`.
- PNG conflicts: `loop/rc` still carried the old full-page shelled-route `campaign--{tavern,
parchment,high-contrast}` captures for desktop and rail. Regenerated them in the pinned container
  on the new base; the decoded pixels were identical to this story's compressed attempt-1 baselines,
  so those blobs were kept.
- `src/i18n/dev/qps-ploc.ts`: regenerated (`npx tsx scripts/i18n-catalog.ts pseudo`) for the three
  new relationship-removal keys; the pseudo catalog now has to match `en.ts` key for key. It is a
  manifest companion path.

### Verification on 5611f236

- Story e2e (`campaign`, `campaign-calendar`, `campaign-relationships`, `campaign-polish`) plus
  `widget-intents.spec.ts` (exercises the ported quest target), desktop-chromium and
  mobile-chromium: **42 passed (1.2m)**. This includes the axe scans of the route, every tab, the
  quest/faction editors, calendar list/form, relationship views and the removal dialog.
- Pinned visual container, `-g 'Story polish' --update-snapshots=none`: **15 passed** (5 themes x
  desktop/rail/phone).
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs`: 562 files, 30171.3 KiB of 32768.0 KiB.
- `pnpm --filter @dndtools/gm-react typecheck`: exit 0.
- `pnpm lint` (raw-style count, full ESLint, boundary, emphasis, non-text contrast): exit 0.
- `pnpm gates`: exit 0. 36 file-size warnings, none for `Campaign.tsx` or `screens/campaign/`
  (owned files: Campaign.tsx 448 lines, largest in `campaign/` is Relationships.tsx at 403).
- Vitest `src/i18n` (4 files, 47 tests) and the vocabulary, token-references, session-start-copy
  and map-vocab tests (4 files, 35 tests): passed.
- Prettier check on every changed non-PNG file: clean.

`loop/rc` then advanced to 6dec65df (RC-CAN-5.5: canvas tile overflow, widget bodies, their e2e
and board/scene baselines; nothing under Story). Rebased again without conflicts. On 6dec65df: app
typecheck exit 0; the pseudo catalog regenerates unchanged; `src/i18n` tests 47 passed; baseline
budget 30035.5 KiB of 32768.0 KiB. The browser runs above were not repeated because that range
does not touch the Story route, its catalogs or its baselines.

## Attempt 3 — campaign-cards visual baselines

Gate feedback: the pinned-container visual gate on 48b3771e failed 3 tests, all
`tests/visual/campaign-cards.spec.ts` (RC-KNW-3.2), one per tier; 429 passed. First mismatch was
`campaign-quest.png`: the card grew from 237/244 px to 248 px tall. Attempt 2 ran only the
`Story polish` visual tests, which is why this was missed.

Cause: this story's own §20.2/§20.3 changes to `campaign/Cards.tsx`, so the baselines were
updated rather than the code:

- quest card: the edit IconButton now has a 48 px minimum (`var(--space-12)`), which makes the
  footer row taller;
- faction card: heading in sans `--text-md` (Cinzel only at 24 px and up), a minus icon on the
  Neutral stance badge, the 48 px edit button, and the DM-secret label in primary text (the
  purple label measured 4.21:1).

Regenerated the spec's images with `--update-snapshots=changed` in the pinned container on 6dec65df:
5 images changed (quest × desktop/rail/phone, faction × desktop/phone; NPC and arc unchanged).
Reviewed old/new side by side. On the narrow desktop faction card, "Saltmarsh Watch" now wraps
to two lines because the badge and 48 px button take the rest of the row; the badge and button stay
centred and nothing clips. I accepted that over shrinking the touch target or reinstating small
Cinzel. Re-deflated the five PNGs losslessly (126,888 → 122,660 B, decoded rows asserted
identical).

### Verification on 6dec65df

- Full pinned visual suite, the gate's own command
  (`run-in-container.sh --update-snapshots=none --workers=2`): **432 passed (8.3m)**, exit 0.
- `check-baseline-budget.mjs`: 562 files, 30041.6 KiB of 32768.0 KiB.
- No source changed in this attempt, so the attempt-2 e2e, lint, typecheck and gates results on
  this tree still apply.

No push, promotion, dispatcher state change or additional agent.

## Attempt 4 — independent review corrections

Review of 06c63172 found an intermittent focus failure after keyboard quest creation/retry
and an unregistered neutral-faction icon name. Both findings are addressed:

- Quest and faction close handlers record the intended launcher. A React effect keyed to the
  editor state restores focus after the closed editor and its launcher commit; it consumes the
  request once. Removed the frame callback that could run before the launcher mounted.
- Kept the failed-save/retry focus assertion. Added first-quest Cancel focus coverage and a
  faction save/reopen/Cancel focus test on both profiles.
- Changed the neutral icon to the registered `remove` (Minus). Updated and visually inspected
  both affected faction baselines: the badge now shows a minus and text remains unclipped.
  Rail shares the phone faction capture by the existing visual spec contract.

The embedded §20.2–§20.5 checklist and waivers above remain applicable. No copy changed in this
correction, so the existing EN/ES and FEATURE-GAPS updates remain current.

### Verification on the corrected tree

All commands exited 0. Headroom retained output and exact result text was retrieved before
recording the results; raw runner logs remain outside the repository in `/tmp/rcpol110-*4.log`.

- Keyboard quest failure/retry, `--repeat-each=10 --workers=2`, both profiles: **20 passed (43.0s)**.
- Campaign, calendar, relationships, polish and widget-intents specs, `--workers=2`, both profiles:
  **44 passed (1.2m)**, including axe for the route, tabs, editors and relationship removal dialog.
- Pinned visual container, `-g 'campaign cards|Story polish' --update-snapshots=changed`:
  **18 passed (28.4s)**. Only the desktop/phone faction PNGs changed.
- Separate pinned comparison with `--update-snapshots=none`: **18 passed (26.3s)**, covering
  all five Story themes across desktop/rail/phone plus populated cards on the three tiers.
- Baseline budget: **562 files, 30044.0 KiB / 32768.0 KiB**.
- App typecheck, scoped ESLint, changed source/test Prettier and `git diff --check`: passed.
- `pnpm gates`: passed; all file-size warnings belong to other surfaces. Owned files range from
  **32 to 454 lines** (Campaign.tsx 454, largest campaign child Relationships.tsx 403).

These are local targeted results; the central operator's complete wrapper gates and independent
review remain separate. No push, promotion, dispatcher control change or additional agent.
