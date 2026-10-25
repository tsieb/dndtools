# RC-UX-5.5 — Navigation review before release

Status: **Accepted 2026-10-24 (decider: owner, Engineering; UX and Accessibility consulted through this review); implementation follow-ups RC-ENG-15.1–15.4 gate RC-ENG-7.3.**
As of 2026-10-25, 15.1–15.3 are integrated on `loop/rc` and 15.4's evidence is
[below](#task-based-checks-and-exact-candidate-gates-rc-eng-154). One task-based check still fails.
Reviewed 2026-10-12 against repository commit `020cc6a07f3a2296d8cd032344010f37873782e4`. This is
the decision proposal required by [RC_ROADMAP](RC_ROADMAP.md), §1.6 D6 and UX-5.5, following
CAN-7.9. It does not authorize a navigation change. [NAVIGATION](../architecture/NAVIGATION.md) remains the implemented contract;
this review owns the recommendation, not a second runtime specification.

## Evidence and limits

The observations below come from source and test inspection, not a new browser usability study.
The September 12 findings are the starting inventory, not claims that every defect still ships.
No external API or upstream compatibility claim is needed for this review.

- [nav.ts](../../apps/gm-react/src/app/nav.ts) registers 3 Run, 4 Library, 5 Platform and 2 footer
  destinations: 14 total. Maturity and experience gates can hide some entries; 14 is the configured
  inventory, not the number necessarily visible in a fresh vault.
- [sections.ts](../../apps/gm-react/src/app/shell/sections.ts) defines the phone tabs and resolves
  Run shortcuts by screen origin; [sections.test.ts](../../apps/gm-react/src/app/shell/sections.test.ts)
  covers origin rather than name/pin lookup, actor filtering and pre-provisioning aliases.
- [App.tsx](../../apps/gm-react/src/App.tsx) owns the actual HashRouter routes.
  [ADR-041](../adr/041-screens-as-the-run-surface.md) and NAVIGATION describe the CAN-7.9 retirement:
  `/` and `/session` render default flow screens; `/board` resolves to the GM screen.
- [ScreenMeta](../../packages/core/src/state/scene-state.ts) stores `pinned`, `pinOrder`,
  `layoutPolicy` and `origin`. Pins are screen records, not another static route registry.
  [pinned-screens.spec.ts](../../apps/gm-react/tests/e2e/pinned-screens.spec.ts) covers ordered
  pins, navigation and unique landmarks at desktop, rail and phone widths.
- [TopBar.tsx](../../apps/gm-react/src/app/shell/TopBar.tsx) passes `compact` to all four utilities
  on every non-phone tier. This contradicts NAVIGATION §4's claim that labels appear from 1280px.
  [SessionPanel.tsx](../../apps/gm-react/src/net/SessionPanel.tsx) gives Host and Account accessible
  names but the same people glyph. [ViewAsControl](../../apps/gm-react/src/app/ViewAsControl.tsx)
  opens `/play` for participant preview and keeps co-DM preview in the shell.
  [ProjectionControl](../../apps/gm-react/src/app/ProjectionControl.tsx) starts/ends live session
  posture; its current End glyph is a close icon. The historical “two eyes” description is not
  a complete account of all current states. Accessible names do not solve visual ambiguity.
- [Campaign.tsx](../../apps/gm-react/src/screens/Campaign.tsx) already creates narrative NPCs
  through Characters and opens `/characters/:id`; its story context is not a second sheet.
  [English messages](../../apps/gm-react/src/i18n/messages/en.ts) already use Maps, Story, Notes
  and `{gm} screen` for navigation. Internal route identifiers still differ from these labels.

## Recommended decision IA-1: six primary sections

Keep the current content routes and consolidate the shell into **Screens, Characters, Maps,
Story, Notes, Tools**, in that order. Six stable sections satisfy
[ADR-013](../adr/013-three-layer-navigation-contract.md)'s five-to-seven budget. This is a
proposal for later implementation; Tools is not an existing destination.

| Primary section | Entry and local ownership                                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screens         | `/screens`; all screens, default Command Center, GM screen and Session, templates and user pins. Screen content opens at `/screen/:id`. The app launch `/` remains the default Command Center, within Screens.                    |
| Characters      | `/characters`; PCs, NPC sheets and bestiary. Character records have one editing home.                                                                                                                                             |
| Maps            | `/atlas`; map library and editing. “Atlas” remains an internal route term only.                                                                                                                                                   |
| Story           | `/campaign`; quests, factions, calendar, timeline and narrative NPC relationships.                                                                                                                                                |
| Notes           | `/knowledge`; notes, handouts, wiki and backlinks; local Graph & Search entry at `/graph`, including `/graph/repair`. Global Search remains in the palette.                                                                       |
| Tools           | Proposed `/tools` landing page with explicit Audio, Extensions and Community links to existing routes. Respect current experience gates; keep permitted deep links usable. No account or paid-plan promotion in the primary list. |

Settings stays a labelled secondary utility, owning Plans & cloud (`/upgrade`), vault/sync,
privacy, preferences and configuration. Account remains the top-bar identity utility, linking to
account/billing settings where relevant. These are not extra primary sections. Every route has one
primary owner; `/settings` and `/upgrade` identify Settings in the secondary utility region.

Desktop renders six text-labelled primary rows; rail renders the same six with accessible names.
Phone renders **Screens, Characters, Maps, More**: More exposes Story, Notes and Tools, plus the
separate Settings utility. Screens is always one tap away, even with no pins. Its local chooser
makes Command Center, GM screen, Session and pins available in one further selection. This trades
Session's current direct tab for access to every run screen; retain the live indicator on Screens
and make the live screen prominent in its chooser. Do not auto-navigate when a session starts.

The user-defined **Pinned screens** region sits beside the primary list on desktop and rail, and
first in phone More as ADR-041 requires. It also appears in Screens' local chooser. Each item uses
its stored name, visibility and live state. Pins do not consume the six-section budget, cannot
create new global sections, and remain actor-filtered. New screen is a separate content action,
not an item inside the Primary landmark. Preserve keyboard reorder and distinguish the current
primary section from the current pinned screen with uniquely labelled landmarks.

## Every September 12 finding: disposition and recommendation

| Finding                                    | Recommendation and current qualification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14 destinations versus 5–7                 | Adopt IA-1's six; demote the three Run entries to Screens shortcuts, move platform tools to their specified local homes, and separate Settings from Primary. Hiding entries by maturity alone does not fix the inventory.                                                                                                                                                                                                                                                                                                     |
| Maps / atlas / Atlas                       | Use **Maps** in navigation, headings, breadcrumbs, help, palette and accessible names. Keep `/atlas` and internal IDs for compatibility. Existing nav copy already agrees; audit remaining visible copy.                                                                                                                                                                                                                                                                                                                      |
| Story / campaign / Campaign                | Use **Story** for the section; keep `/campaign` and its child routes. “Campaign” may still name the user's vault/campaign, not an alternate section label.                                                                                                                                                                                                                                                                                                                                                                    |
| Notes / knowledge / Knowledge              | Use **Notes** for the section; keep `/knowledge/:id?`. “Knowledge” remains an internal model term, not an alternate navigation label.                                                                                                                                                                                                                                                                                                                                                                                         |
| DM screen and GM Screen together           | Use system vocabulary `{gm} screen` for generic product copy, in sentence case. Preserve stored screen names and user renames everywhere; do not rewrite “DM screen” records merely by string matching. Default-name modernization needs origin-aware, explicit migration or a user rename.                                                                                                                                                                                                                                   |
| Plans & cloud primary                      | Move its entry to Settings, retaining `/upgrade` and contextual upgrade links at actual capability limits. Do not hide billing access or require payment for local navigation.                                                                                                                                                                                                                                                                                                                                                |
| NPCs from Characters, Story, Notes         | Characters owns sheets and creation. Story keeps narrative lists and relationships; Notes keeps mentions/backlinks. Label cross-links “Open character sheet” or “Open note” by their actual target. Preserve distinct note and character IDs and existing links; no data merge.                                                                                                                                                                                                                                               |
| Footer player view and top-bar view-as     | They now have different semantics. Move `/player` to Characters local navigation as **Player sheet**; rename the top-bar action **Preview as player**, retaining its read-only `/play` preview and explicit exit/return. Co-DM preview remains separately named. Never redirect real `/play` joins to the GM shell.                                                                                                                                                                                                           |
| Four unlabeled icons: two people, two eyes | Keep Help in its consistent location. Show explicit **Host table**, **Preview as player**, **Start session / End session**, and **Account** labels on wide layouts. At constrained widths use a labelled Table controls sheet with named rows, as phone already does. Pick distinct glyphs as reinforcement; retain accessible names, state, unavailable reasons, confirmation and focus return. Do not call Start session a mere display preview. Fix the documented wide-label discrepancy in the implementation follow-up. |
| Run screens missing from phone tabs        | Command Center and Session now are tabs; arbitrary screens and GM screen still require More/pins. Adopt the Screens tab and chooser above, and verify access with no pins, long pin lists and a live session. Do not report the historical finding unchanged.                                                                                                                                                                                                                                                                 |
| Where CAN-7.4 pins fit                     | Preserve their user-defined, ordered shortcut group under Screens, with phone More listing pins first. Pinning/unpinning never adds/removes primary destinations or affects the scene's projection.                                                                                                                                                                                                                                                                                                                           |

## Alternatives weighed

| Alternative                                               | Benefit                                                                              | Cost and decision                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep 14, fix labels only                                  | Lowest implementation and retraining cost; current bookmarks untouched.              | Does not meet ADR-013 or give phone Screens parity. Reject as the release target; retain only while this proposal awaits acceptance.                 |
| Five sections: Screens, Characters, Maps, Story, Notes    | Smallest familiar content list.                                                      | Audio, Extensions and Community become scattered utilities or overloaded Settings. Prefer six with an explicit Tools home.                           |
| Seven: retain Home or Session as a primary alongside IA-1 | Saves a click for one frequent run workflow.                                         | Reintroduces a privileged screen beside the library and pins after CAN-7.9. Reject unless usability evidence demonstrates the chooser is inadequate. |
| Six-section IA-1                                          | Meets the budget, preserves content vocabulary and gives every screen a phone entry. | Requires a Tools landing and new parent-selection logic; Session loses a direct phone tab. Recommend, subject to task-based validation.              |
| Rename paths to match labels                              | Easier to guess URLs.                                                                | Alias maintenance and unnecessary bookmark risk without improving in-app names. Reject for RC-1.                                                     |
| User-customizable primary tabs                            | Optimizes each GM's routine.                                                         | Variable instructions, empty-vault defaults and migration complexity. Defer; pins already provide customization.                                     |

## Route, bookmark and rollback contract for follow-up implementation

These are proposed acceptance requirements, not verified migration results. Hash URLs use forms
such as `#/atlas`; aliases must operate within HashRouter, not via server redirects.

| Existing route or bookmark                                   | Treatment under IA-1                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`, `/board`, `/session`                                    | Retain all as stable default-screen entry points. `/` and `/session` may keep rendering their provisioned screens in place; `/board` keeps its replace redirect and GM-only/retry states. Primary selection becomes Screens. Resolve identity from origin, not translated or user-renamed titles. |
| `/screens`, `/screen/:id`                                    | Retain library and stable IDs; selection is Screens. Missing, deleted or inaccessible IDs show the existing unavailable state, never another user's screen.                                                                                                                                       |
| `/scenes`, `/scene/:id`                                      | Preserve existing library alias and screen edit migration (`/screen/:id?edit=1`); template scenes keep their editor. Preserve other query parameters and router state.                                                                                                                            |
| `/characters/:id?`, `/atlas`                                 | Keep paths and record IDs; select Characters or Maps respectively.                                                                                                                                                                                                                                |
| `/campaign`, `/campaign/calendar`, `/campaign/relationships` | Keep paths and deep links; select Story.                                                                                                                                                                                                                                                          |
| `/knowledge/:id?`, `/graph`, `/graph/repair`                 | Keep paths and query/filter state; select Notes. Graph keeps its own local navigation.                                                                                                                                                                                                            |
| `/audio`, `/extensions`, `/community`                        | Keep paths and state; select Tools. New `/tools` is additive, not an alias that replaces those bookmarks.                                                                                                                                                                                         |
| `/upgrade`, `/settings`                                      | Keep paths; identify Settings in the secondary utility region, not Tools or a fallback Home selection.                                                                                                                                                                                            |
| `/player`                                                    | Retain sheet/picker/party behavior; select Characters. This is not participant preview.                                                                                                                                                                                                           |
| `/play`, `/join`, `/wiki`, `/display`, `/legal/*`            | Preserve chrome-less entry points, authorization and parameters unchanged. Preview return state is not an authentication mechanism.                                                                                                                                                               |

A normal navigation action pushes once. An alias normalization replaces once, without loops or an
extra Back stop. Preserve query strings, edit intent, router state, refresh behavior and forward
history; test both warm navigation and cold pasted bookmarks. Keep legacy routes for RC-1 with no
removal date; removal would need a separately accepted compatibility decision.

No persisted schema change is needed for regrouping. Preserve screen IDs, origins, pin order,
layouts, actor permissions, note links and palette recents. Update visible palette labels and
search synonyms (Atlas/Campaign/Knowledge remain useful search terms) without rewriting saved
URLs. Audit every alias consumer before shipping; `sectionPath` currently looks for `gm-screen`
while NAVIGATION documents `/board` fallback, so do not assume all defaults share one lookup.
Rollback restores the prior shell grouping while retaining old routes and the additive `/tools`
entry as a compatibility landing. It must not undo user content, pins or renamed screens.

## Proposed ADR-013 amendment text

Apply this text to ADR-013's Decision and Migration Impact **after acceptance**, retaining its
three-layer distinction and existing accessibility requirements. Record the accepting Engineering
decider, consultation with UX/Accessibility, date, and this review's merged commit.

> Global primary navigation has six sections: Screens, Characters, Maps, Story, Notes and Tools.
> Their definitions and parent-route mappings live in `nav.ts`; AppShell alone renders them across
> desktop, rail and phone. Phone More changes presentation, not section membership. Primary
> navigation uses `aria-label="Primary"` and excludes content actions.
>
> Settings and account access are secondary utilities. The Screens library is one primary section;
> default run screens and user-pinned screens are workspace shortcuts, not additional primary
> sections. Pins use a separate, uniquely labelled navigation region and preserve actor filtering,
> user ordering and a keyboard equivalent. New screen is a content action outside Primary.
>
> Every content route has one owning primary section. Cross-links may reach the same object from
> several contexts without duplicating its editing home. Local navigation uses the owning section's
> name; contextual links name their actual target. User-facing section names are Maps, Story and
> Notes regardless of their compatibility route names. System vocabulary supplies GM/DM wording;
> user-created screen names are preserved.
>
> Migration preserves existing hash routes, object IDs, query state, bookmarks and history semantics.
> Aliases replace rather than add history entries. Player sheet navigation, read-only participant
> preview and live session controls remain distinct. Verification must count the configured primary
> sections and check ownership, labels, reachability and history across all viewport tiers; landmark
> checks alone do not prove compliance with the section budget.

## Acceptance record and ENG-7.3 release precondition

| Required evidence                                                    | Status at this revision                                                                             |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Recommendation addresses every September finding                     | Covered above; proposed IA-1.                                                                       |
| Engineering accepts decision, with UX/Accessibility consultation     | Accepted 2026-10-24 by the owner as Engineering decider; IA-1 (six sections) is the release target. |
| Review merged                                                        | Merged on `loop/rc` in `3d8d8e96a` (proposal) with `2a9c1a81b` and `74efcfe28`.                     |
| ADR-013 amendment adopted                                            | Adopted 2026-10-24 (owner-authorized edit); see ADR-013 Decision.                                   |
| ENG-7.3 explicitly lists accepted decision as a release precondition | Applied in RC_ROADMAP ENG-7.3 (text below); checklist box recorded by RC-ENG-15.4.                  |
| Implementation stories filed after acceptance                        | 15.1 `f79675059`, 15.2 `2c97e96f8`, 15.3 `f168547c4` on `loop/rc`; RC-commit check is ENG-7.3's.    |

[RC_ROADMAP](RC_ROADMAP.md) RC-ENG-7.3 now carries this release precondition, added by this task
after independent review cited the gap (claim widened to the ENG-7.3 bullet only):

> Release precondition (RC-UX-5.5): the navigation review `IA_REVIEW.md` is merged and records an
> explicitly accepted IA decision with the accepting decider, date and merged commit; ADR-013
> reflects that decision; every 2026-09-12 finding has a disposition; and each required
> implementation follow-up is filed with an owner and verified on the release-candidate commit. A
> pending decision, an unmerged review or an unfinished required follow-up blocks RC-ENG-7.2; the
> UX-5.5 dependency alone is not acceptance evidence, and `RC_CHECKLIST.md` carries this as a check.

ENG-7.3's acceptance line now opens with "the RC-UX-5.5 precondition is met". The
[RC_CHECKLIST](../development/RC_CHECKLIST.md) IA box records the decision, decider, date, commits
and the four story IDs with their evidence (RC-ENG-15.4). It stays unchecked. Listing the evidence
does not meet the precondition: ENG-7.3 must verify the follow-ups on the release-candidate commit,
and the preview-return failure below has to be fixed first.

The decision is accepted; these bounded stories are filed as RC-ENG-15.1 (grouping), 15.2 (vocabulary), 15.3 (bookmarks) and 15.4 (evidence) through the roadmap owner with actual IDs and
explicit Owns/Deps; all depend on the accepted decision, not just this document's existence:

1. **Primary grouping and phone Screens access.** Own nav, shell, parent resolution and the new
   Tools landing; update NAVIGATION and guides. Verify six configured sections, complete route
   ownership, empty-vault/live/pinned flows, all tiers, keyboard and screen-reader landmarks.
2. **Vocabulary and table controls.** Own shell utility presentation, message catalogs and affected
   section headings/help. Verify distinct visible labels, translated/system vocabulary, separate
   sheet/preview/live semantics, preview write rejection and exit focus/return behavior.
3. **Bookmark compatibility.** Own route aliases, palette consumers and migration tests. Verify
   every route-table row on cold load and Back/Forward, including renamed/missing/private screens,
   query and edit intent, saved recents and unaffected companion joins. Depends on grouping.
4. **Decision and release evidence.** Own the ADR-013 and RC checklist amendments (the ENG-7.3
   precondition is already in the roadmap); attach the accepted decision and follow-up IDs,
   usability findings and exact-candidate gates to ENG-7.3.
   Do not call a proposed migration tested because existing alias tests pass.

## Task-based checks and exact-candidate gates (RC-ENG-15.4)

Run on 2026-10-25 against `f168547c4` (the `loop/rc` head after RC-ENG-15.3), not a tagged RC
commit. Each check started on the seeded local vault's default home (`#/`) and used only visible
labels and accessible names, never the `__rt` runtime handle. The scratch Playwright spec drove
the dev server (`vite`, cloud variables blank, as in `playwright.config.ts`) on the desktop profile
at 1440px (1280px for the second preview case) and on the Pixel 5 phone profile (393px). It was not
committed. This is scripted task coverage, not a usability study with people.

| Task                          | Path observed                                                                                                                                                                                          | Desktop                                                                                                            | Phone                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Find an NPC                   | Characters (Primary or tab) › Roster filter **NPCs** › Mira the Ferryman → `/characters/:id`; Characters stays current.                                                                                | Pass, 3 actions                                                                                                    | Pass, 3 actions                                   |
| Open a pinned screen on phone | Setup pinned Harbor of Saltreach from Screens › All screens › Pin. From a fresh home: **Screens** tab › chooser's Pinned screens › Harbor of Saltreach → `/screen/:id`. More also lists the pin first. | Not applicable                                                                                                     | Pass, 2 actions                                   |
| Return from player preview    | From Characters: Preview as player (in Table controls when constrained) › Any player → `/play` with banner › **Exit preview**.                                                                         | **Fail at 1440px**: lands on `#/`, not `#/characters`. Pass at 1280px: back on Characters, focus on Table controls | Pass: back on Characters, focus on Table controls |
| Find billing                  | Settings utility (phone: More › Settings) › Subscription › **Full comparison** → `/upgrade` (heading Settings). Primary has no Plans or billing entry.                                                 | Pass, 3 actions                                                                                                    | Pass, 4 actions                                   |

Findings:

- **Preview return at the wide tier (blocks the IA box).** With the inline Preview as player control
  (1440px and wider), Exit preview goes back to the route where the shell first loaded, not to the
  route the GM left. In a separate probe on both profiles, the `/play` history state carried
  `previewFrom: "/"` after a click from `/` to `/characters` at 1440px and 1600px, but
  `"/characters"` after a cold load of `/characters` or at 1280px (sheet control). The value is set
  in `ViewAsControl.tsx` (`previewFrom`) and read by `PreviewExitBanner` in `screens/play/Frame.tsx`.
  The cause is not established. `table-controls.spec.ts` misses this because it starts each preview
  from a cold `/screens`. A fix and a regression test need an owning story, which this docs story
  cannot file in RC_ROADMAP.
- **"billing" finds nothing in the palette.** `plans` finds Plans & cloud, but `billing` returns
  No matches in the local build. The Subscription notice also names Plans & cloud in bold text,
  not as a link, so Full comparison is the only way through. The live Billing panel (Manage billing)
  appears only with a configured cloud account, and these checks did not exercise it.

Exact-candidate gates on the same commit: `primary-sections.spec.ts`, `table-controls.spec.ts` and
`route-compat.spec.ts`, both profiles (`DNDTOOLS_E2E_PORT=<free port> pnpm exec playwright test
<those three specs> --workers=3` in `apps/gm-react`): 78 passed. The stories' full-suite, axe,
visual and unit results are in their run journals (`state/RC-ENG-15.1.journal.md`,
`state/RC-ENG-15.2.journal.md`) and commits. None of these results stands in for the RC commit:
ENG-7.3 re-runs the three specs and the four tasks on the tagged commit with the RC checklist
gates, and attaches them to its exit audit.

## Validation plan and review limits

Existing tests inspected: `sections.test.ts`, `pinned-screens.spec.ts`, `screens.spec.ts` (including
old `/board` history and unavailable IDs), and `shell-polish.spec.ts` (phone More state/focus).
These are useful foundations; they do not test the proposed six-section IA. Implementation must
extend them, run responsive and axe coverage, golden paths and the pinned visual gate, and record
real task-based checks for finding an NPC, opening a pinned screen on phone, returning from player
preview, and finding billing. Test English/Spanish, both GM vocabularies, keyboard and touch.

The original review made no runtime claim. The RC-ENG-15.4 section above records observed
scripted browser results on one `loop/rc` commit. It does not claim release success or usability
evidence from real users. Central gates and independent review of this update remain pending.
