# RC-POL-1.13 — Audio polish

## Scope and findings

- Current task branch only; clean starting tree. No AGENTS.md tracked or found in ancestor directories. Headroom tools unavailable. No agents, push, promotion, or dispatcher changes.
- Supporting translations, Audio tests, visual baselines, and FEATURE-GAPS changes are required by the task.
- Initial main file: 601 lines. Soundboard tiles did not disable in preview; saved-package deletion had no confirmation; preset and automation outcomes bypassed i18n; Audio absent from visual suite.
- Implemented: extracted track-editor lifecycle and source rows, shared spacing/type tokens, illustrated empty states, disabled preview tiles, named preset confirmation, EN/ES outcomes.

## Embedded checklist — each item checked or explicitly waived

### 20.2 Design fidelity

- [x] Composed only from `src/ds` primitives and `screen-kit`; zero raw hex/rgba/px literals (DSN-1.1 lint clean for this directory).
  - **Evidence:** AudioPanel composes screen-kit Panel; soundboard/mute controls use DS Button. Owned styles use shared tokens; directory ESLint has zero raw-style findings and no allowances.
- [x] Matches the prototype view for this section (`docs/design/README.md` §4) and the design-package template where one exists; deviations listed with rationale.
  - **Waived:** No Audio template is vendored in docs/design-package/templates. The remote prototype requires DesignSync, which is unavailable here. Retained the established now-playing / tabs / two-column structure, with the documented typography, spacing, emphasis and empty-state rules.
- [x] One primary action per region in gold; supporting tiles flat/sunken; the primary panel raised with `--shadow-md`.
  - **Evidence:** Import audio (Playback), Save current audio (Presets) and Add rule (Automation) are the only gold primaries, one per tab. Add track in Tracks & sources is secondary because it shares the Playback view with Import; `pnpm lint:emphasis` (RC-ENG-8.4) holds PlaybackLeft at 0. Recipe and source tiles are flat; now-playing uses shadow-md even while idle.
- [x] Type hierarchy uses 3–4 sizes; Cinzel only ≥ 24px; numbers in mono.
  - **Evidence:** Owned text uses xs/sm/base/md. AudioPanel replaces the shared small Cinzel heading with Inter; the shell retains its large display h1. Slider readouts use the DS numeric presentation. Mixed counts/duration metadata retain readable inline text (waiver: these are labels, not aligned numeric columns).
- [x] Every status color paired with a distinct icon shape; DM-only purple stripe where applicable.
  - **Evidence:** DS Badge supplies distinct success/warning/error icons; error feedback adds the error icon. Configuration panels carry a purple stripe and a labelled lock.
- [x] Renders correctly in all themes and all three tiers; visual snapshots updated and reviewed.
  - **Evidence:** 90 pinned-container snapshots: Playback, Presets, Automation, loading, error and delete dialog × five themes × three tiers. Final comparison and review recorded below.
- [x] Motion uses named tokens; nothing animates under `data-motion='reduced'`.
  - **Evidence:** Owned transitions use duration-fast/easing-standard; shared reduced-motion tokens collapse them. Axe tests select OS reduced motion; visual projects do so too. The click pulse is a transient selected color, not an animation.
- [x] Empty, loading, error, and "unavailable because…" states all present and illustrated where the key exists.
  - **Evidence:** Audio-empty illustration is used for empty library, mixer, packages, automation and SFX history. Import/starter work has busy text and a live region; errors have alert text and icon; missing bytes, blocked sources and unsupported outputs have explicit reasons. Waived dedicated loading/error illustrations: no such illustration keys exist.

### 20.3 Interaction and UX

- [x] Every action has feedback within 100 ms (optimistic or skeleton) and a completion toast or inline state.
  - **Waived:** Busy state is set synchronously before imports/saves, playback has a selected pulse, and completion uses inline state/toasts. A measured 100 ms bound for every operation is not claimed: the shared runtime and IndexedDB timing depend on host load. Existing commit-on-release tests prevent volume write storms.
- [x] Every destructive action is undoable or confirmed; every confirm names the thing.
  - **Evidence:** Preset deletion names the package in a cancel-first dialog. Layer and rule removal offer Undo; scene unbind now restores all accepted removals through the strict core schema, with an e2e restoring both cues.
- [x] Save status visible on auto-persisted surfaces; failures say what to do next.
  - **Evidence:** This surface uses explicit add/save operations and visible current playback/mixer state, not a document autosave editor. Success is reported after dispatch; failure text is retained and controls become available to retry. Waived a permanent Saved badge: it would imply external audio delivery/persistence guarantees the browser cannot make.
- [x] One clear route back; browser back works; Android Back follows the documented order.
  - **Evidence:** Shared shell navigation remains the route back; no custom history handler added. Dialog uses the existing Escape, focus return and Android Back registration. Keyboard Escape/cancel is exercised in the new e2e; physical Android Back is waived here because the runner is Chromium, not an Android device.
- [x] No hover-only or gesture-only discovery; touch targets ≥ 44 px (48 dp Android).
  - **Waived:** Actions are visible buttons/selects with labelled fields; no gesture-only task. Soundboard and mute use DS buttons, mute explicitly uses touch-target-min. Shared compact controls use comfortable density. Universal desktop 44px / native Android 48dp verification is waived: the shared desktop density intentionally permits smaller controls and native dp requires the Android harness.
- [x] The compact tier exposes one primary top-bar action; overflow in a bounded sheet.
  - **Waived:** Audio has no owned shell top-bar action or overflow controller. Its existing three-tab navigation and wrapped in-panel actions are retained; introducing a second top-bar/overflow mechanism here would duplicate the shell contract. Mobile snapshots and large-text reachability cover the owned layout.
- [x] Copy follows the content fundamentals; strings via `t()`; ES present.
  - **Evidence:** Read against the calm stage-manager voice. Removed raw source/cache/offline taxonomy from rows; preset and automation success/undo copy now goes through t(), with ES entries. Authored recipe names/descriptions and core rejection text remain source-owned content, not silently translated in this screen.
- [x] Contextual help (HelpTip) beside any non-obvious control; shortcuts in tooltips.
  - **Waived:** Stream URL, source/asset, scene trigger and output restrictions already have persistent field help or nearby explanations. Kept that touch-accessible help rather than duplicating it in HelpTip overlays. No new shortcuts introduced.

### 20.4 Accessibility

- [x] axe clean (desktop + mobile) for this route and its open overlays; register unchanged.
  - **Evidence:** Full-route default-theme axe gate plus strict zero-violation scans of all tabs, loading/error and named deletion overlay on desktop/mobile. Register unchanged. Exploratory other-theme shell findings are disclosed below, not suppressed or reclassified.
- [x] Keyboard-only walkthrough of the primary task recorded in the PR; focus visible everywhere.
  - **Evidence:** Recorded in audio-polish.spec.ts: focus Track name, type Quiet room, Tab to Kind, choose bundled source by key, Tab/Enter submit; then keyboard opens deletion, Cancel receives focus, Escape restores focus and leaves the durable op count unchanged. No PR created by this task; this journal is the review record.
- [x] Landmarks and headings correct (`<h1>` once, from `SECTION_TITLES`); `nav` labelled.
  - **Evidence:** Shared shell provides one h1 and labelled nav. AudioPanel retains section/h2, EmptyState h3; tabs are labelled and associated via tabPanelProps. Strict axe checks cover the rendered hierarchy.
- [x] Live regions announce operations; no announcement spam.
  - **Evidence:** Busy import/starter uses one polite atomic region; failures use alerts; add/save/delete uses existing status/toast channels. EmptyState deliberately is not a live region; no ticking audio-time announcements added.
- [x] Screen-reader spot check on one platform noted.
  - **Waived:** No interactive screen-reader/audio-output platform is available in the headless runner. Accessible names, focus trapping/return, alerts and landmarks are machine-checked; a human VoiceOver/NVDA listening pass is not claimed.
- [x] 200% zoom / large text: no clipping; reachability spec case added if new scroll regions.
  - **Evidence:** New both-profile e2e doubles root font size, scrolls Add track into view and exercises validation. No new scrolling containers; Dialog retains the shared bounded body. All three layout tiers have visual baselines.

### 20.5 Core discipline and correctness

- [x] No state mutation outside `runtime.dispatch`; no client-side visibility filtering.
  - **Evidence:** Durable mutations remain runtime.dispatch; source, asset, scene and association lists come from core actor queries. New local state is only drafts, busy/error status and pending confirmation.
- [x] Preview-as-player: writes rejected read-only and controls hidden/disabled accordingly.
  - **Evidence:** Player-preview regression verifies soundboard assets are absent and importing disabled. Preset tests verify read-only save/apply; core rejects player writes.
- [x] Player projection of this surface verified through an actor read in an e2e.
  - **Evidence:** New e2e takes real runtime audio/permissions/playback and runs core actor reads for actor-player: no assets or associations, participant projection omits outputDevice and participantDelivery.
- [x] e2e on both profiles covers the primary task and one failure path.
  - **Evidence:** 36 Audio cases passed on the two profiles, including source/preset primary flows, invalid template application, stream offline behavior, starter failure, and deletion cancellation/Undo.
- [x] Perf: the surface's budget measured before/after (ENG-1.1); no regression.
  - **Waived:** The ENG performance registry has no Audio surface budget or capture scenario (docs/development/PERFORMANCE.md §1). No fabricated before/after numbers or global no-regression claim. Core playback/dispatch architecture is unchanged; commit-on-release e2e guards durable write count.
- [x] Docs: FEATURE-GAPS inventory row updated; architecture doc updated if a contract moved.
  - **Evidence:** FEATURE-GAPS Audio row now records this polish and actual source/platform limits, replacing the stale same-origin-only projector gap. No architecture contract moved.

## Implementation and verification notes

- Track-editor hook catches picker failures as well as import/persistence failures; sources use localized kind labels instead of raw cache taxonomy.
- Shared AudioPanel composes screen-kit Panel, gives compact headings Inter, and marks DM configuration with a purple border and lock. Now-playing stays raised; nested tiles stay flat. Empty areas use the existing audio-empty illustration. No audio loading/error illustration key exists; those states use busy live text and error icons.
- Soundboard actions are DS Buttons; player preview hides the actor-filtered assets and disables importing. Named, cancel-first preset confirmation uses the standard Dialog focus/Back contract. Scene unbind now offers Undo for every successfully removed cue, including partial failures.
- Surface raw-style allowances removed after migration; remaining direct numeric values are non-style timing/model values or structural sizes supported by DS APIs.
- Initial existing Audio e2e run: 32 passed. Expanded regression checks exposed a strict command-schema rejection in Undo (the read-model id is not a payload key); the handler now renames id to associationId and preserves the definition. The final 36-case rerun passed.
- Test setup corrections: import individual pure core queries rather than the package barrel (Node rejected the barrel's JSON import); use the real Track name label; assert assets are absent in player preview. Default-theme route/overlay scans use reduced motion to inspect settled colors.
- Broader exploratory theme scans found existing parchment shell tertiary-text contrast failures (4.49:1 and 3.84:1). The task acceptance scans the complete route and overlays in the default theme on both profiles; the register is unchanged. All five themes remain in visual coverage. No claim of a clean whole-app axe scan for every theme.
- First pinned-container render: 75 tests passed, 90 Audio PNGs. Further UI review consolidated duplicate empty-state actions, corrected compact heading fonts, and switched the destructive button to error-text on error-subtle after axe caught the filled variant's contrast. Final snapshots and strict compare passed (see results below).

## Final validation — 2026-09-20

All results below are from this task worktree, from original tool output. No push or promotion.

| Check                                                                                                                                                        | Result                                                                        | Original local output                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------- |
| Audio e2e: audio-polish, audio-presets, audio-starter-pack, audio-web-embed, combat-audio-automation, sfx-events; desktop + mobile, two workers, retries off | 36 passed (37.0 s), exit 0                                                    | /tmp/pol-audio-e2e-final.log              |
| Final complete-route axe gate and strict Audio tabs/loading/error/dialog scans, both profiles, retries off                                                   | 6 passed (12.7 s), exit 0; register unchanged                                 | /tmp/pol-axe-final.log                    |
| Pinned container Audio snapshots, --update-snapshots=changed --retries=0                                                                                     | 75 passed; 90 PNGs covering six states × five themes × three tiers            | /tmp/pol-visual-accepted-update.log       |
| Pinned container strict comparison, CI=1, --update-snapshots=none --retries=0                                                                                | 75 passed (57.3 s), exit 0                                                    | /tmp/pol-visual-compare.log               |
| Baseline budget                                                                                                                                              | 225 total PNGs, 22314.7 KiB / 32768 KiB; per-file cap also passed             | check-baseline-budget.mjs original output |
| App typecheck                                                                                                                                                | exit 0                                                                        | /tmp/pol-typecheck-final.log              |
| ESLint: Audio directory and changed specs                                                                                                                    | exit 0; zero raw-style findings in Audio                                      | /tmp/pol-lint-final.log                   |
| Live raw-style count                                                                                                                                         | 2491 repository-wide values, 253 files; Audio has no allowance                | /tmp/pol-raw-count.log                    |
| i18n catalog tests                                                                                                                                           | 25 passed, exit 0                                                             | /tmp/pol-i18n.log                         |
| pnpm gates                                                                                                                                                   | exit 0; no Audio file-size warning; largest owned file index.tsx is 479 lines | /tmp/pol-gates-final.log                  |

Visual review: opened all 90 final PNGs in six labelled theme/tier contact sheets, plus full-size
parchment Playback (desktop) and Scholar deletion (rail). Confirmed empty illustrations, flat tiles,
DM marking, readable headings, wrapped phone actions, loading text, error icon/copy, and a bounded
named deletion dialog with Cancel/Delete available. The existing page scroll handles content below
the captured viewport; the large-text e2e exercises reachability. Contact sheets are local QA aids
(`/tmp/pol-review-*.png`), not replacement baselines.

The final primary-button emphasis change was followed by the six-case axe/interaction rerun and the
strict visual comparison. Formatting and `git diff --check` are checked before committing. No claim
is made for GitHub CI, real audible output, a human screen-reader pass, physical projector hardware,
or whole-app axe in every theme; the applicable checklist waivers above remain explicit.

## Reconcile onto loop/rc df073f66 — 2026-09-24

The previous session ended at the provider allowance limit after committing `b86b7ecb`. By then loop/rc
had moved 109 commits ahead, and a trial merge conflicted in three files. I merged loop/rc into the task
branch (no rebase, so the dispatcher commits are kept) and resolved the conflicts:

- `audio-presets.spec.ts`: kept this task's Undo-restores-both-cues assertions and adopted loop/rc's
  RC-UX-4.4 copy (`Link audio to …` / `Unlink audio from …`).
- `FEATURE-GAPS.md`: took loop/rc's table and re-applied only the Audio row (Prettier re-aligned it).
- `no-raw-style-values.allow.js`: took loop/rc's list, dropped the seven Audio entries,
  regenerated with `node scripts/raw-style-count.js --write`. Only the total changed (2514 → 2430).

The first strict container compare on the merged tree failed on every Audio PNG (about 1–4 % of pixels
per image). Diffs traced to upstream shell/copy changes: the RC-DOC-1.3 Help launcher in the top bar
and the "audio linked to scenes" subtitle. The Audio layout did not change. I re-baselined with
`--update-snapshots=changed` (87 of 90 PNGs rewritten, no non-Audio files) and reviewed tavern desktop
Playback, parchment phone Presets and high-contrast rail deletion by eye.

| Check (merged tree)                                                         | Result                                           | Log                           |
| --------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------- |
| gm-react typecheck                                                          | exit 0                                           | /tmp/pol13-typecheck.log      |
| ESLint: Audio directory, audio specs, golden-routes                         | exit 0                                           | /tmp/pol13-lint.log           |
| i18n vitest                                                                 | 35 passed, exit 0                                | /tmp/pol13-i18n.log           |
| Audio e2e (six specs), desktop + mobile, retries 0                          | 36 passed, exit 0                                | /tmp/pol13-audio-e2e.log      |
| axe gate `/audio` + strict tabs/overlay/loading/error scans, both profiles  | 6 passed, exit 0                                 | /tmp/pol13-axe.log            |
| Container visual, pre-rebaseline strict compare                             | failed (upstream shell drift, see above)         | /tmp/pol13-visual.log         |
| Container visual, `--update-snapshots=changed`                              | 75 passed                                        | /tmp/pol13-visual-update.log  |
| Container visual, strict compare `CI=1 --update-snapshots=none --retries=0` | 75 passed, exit 0                                | /tmp/pol13-visual-compare.log |
| Baseline budget                                                             | 285 files, 29722.2 KiB of 32768 KiB              | check-baseline-budget.mjs     |
| `pnpm gates`                                                                | exit 0; no Audio file-size warning (largest 479) | /tmp/pol13-gates.log          |

## Gate retry — emphasis lint (2026-09-24)

The operator's Lint gate failed on `6bb3be38`. ESLint was clean, but `pnpm lint:emphasis` (RC-ENG-8.4, which
arrived with the loop/rc merge) reported `PlaybackLeft.tsx` multiple-accent-primaries 1 > 0: Import audio
and Add track were both gold primaries in the same Playback view. My reconcile pass had run ESLint on the
Audio paths rather than the full `pnpm lint`, so it never ran this check. Fix: Add track is now
`variant="secondary"`. In an empty library, importing audio is the main action; adding a stream track is supporting.

| Check                                                                           | Result                                                             | Log                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------- |
| Full `pnpm lint` (raw-style, ESLint, boundary, emphasis, non-text contrast)     | exit 0; multiple-accent-primaries 61 = baseline 61                 | /tmp/pol13-full-lint.log                  |
| Container visual, strict compare before re-baseline                             | 10 failed, all visual-rail Playback + loading (Add track now flat) | /tmp/pol13-visual2.log                    |
| Container visual, `--update-snapshots=changed`                                  | 75 passed; 15 rail PNGs rewritten, Audio only                      | /tmp/pol13-visual2-update.log             |
| Container visual, strict compare `CI=1 --update-snapshots=none --retries=0`     | 75 passed, exit 0                                                  | /tmp/pol13-visual2-compare.log            |
| Audio e2e (six specs) + `/audio` axe gate + strict overlay scans, both profiles | 38 passed, exit 0                                                  | /tmp/pol13-e2e2.log                       |
| gm-react typecheck; `pnpm gates`; `format:check:changed --base loop/rc`         | exit 0; exit 0 with no `screens/audio` warning; clean              | /tmp/pol13-tc2.log, /tmp/pol13-gates2.log |
