# UX-PERM-visibility-preview-badges-and-privacy-status — Completion

UX workpack status: `complete`

Epic: `UX-PERM-visibility-preview-badges-and-privacy-status` (phase "04 Trust and Safety", P0).
Branch: `ux/UX-PERM-visibility-preview-badges-and-privacy-status` (off `ux/integrate-completed-epics`).

DM-safe visibility tooling before deeper player-facing projection work: the canonical 3-state inline
visibility toggle (entity + section granularity, with the pre-dispatch dm-only conflict warning),
the app-wide "Preview as player / observer" mode (rendered through the SAME core actor-filtered
queries a real player would get, never a cosmetic overlay), the ambient visibility badge on content
items, and the DM "Session privacy" cache-purge status panel. Every new surface resolves through a
DM-only DEFAULT-DENY Processing-Core choke point (`null` for any non-DM ⇒ not rendered), in the
`safeBindingEntityId` / `resolveSectionRouteAccess` pattern.

## Demo path (Desktop / Tablet / Mobile)

- **Desktop (desktop-chromium):** `/knowledge/` → create a note → the editor shows the persistent
  3-segment visibility radiogroup (shared / players / dm-only, icon + label each). The notes list
  shows the ambient badge per row (amber "DM only" always visible; "Mixed" when section/field
  overrides differ). Top bar → "Preview as…" → Player: the amber fixed banner appears, the URL gains
  `?preview=player`, dm-only content vanishes, every dispatch is rejected read-only;
  `Shift+Escape` or "Exit preview" restores the full DM view. `/settings/` → "Session privacy"
  panel: per-departed-participant purge chips (Purged / Purge unconfirmed / Purge failed) with
  advisory copy and the all-clear empty state.
- **Tablet (comfortable density):** identical surfaces; toggle segments and the banner exit button
  grow to the 44px touch floor via `html[data-input-modality='touch']` rules.
- **Mobile (mobile-chromium / Pixel 5):** the same stacked card surfaces; the collapsed section
  toggle expands on tap (activation, never hover-only); the banner compacts to 44px. All e2e
  coverage runs on BOTH Playwright projects.

## Requirement coverage (id → implementation → tests)

- **UX-PERM-001 (3-state inline visibility toggle):**
  Core read model `packages/core/src/queries/visibility-status.ts` —
  `VISIBILITY_TOGGLE_SEGMENTS` (canonical order shared → player-visible → dm-only, with the spec's
  label + tooltip copy), `resolveContentVisibilityToggle` / `resolveSectionVisibilityToggle`
  (DM-only default-deny; section toggles report inherited-vs-own state), and
  `evaluateVisibilityChangeConflict` (AC2 warning BEFORE dispatch when active grants exist;
  expired grants are inert per PERM-004).
  GUI `apps/gm/src/lib/gui/ux-perm/VisibilityToggle.svelte` — radiogroup of `role="radio"`
  segments (`aria-checked`, filled background, icon + label, never color alone), arrow-key cycling,
  collapsible at-rest icon (32px target) that expands on activation and moves focus into the group,
  inline conflict warning with "Hide anyway and flag conflict" / "Cancel". Wired into
  `apps/gm/src/lib/gui/NotesWorkbench.svelte` (entity level, editor header → dispatches
  `content.set-item-visibility`) and `apps/gm/src/lib/gui/ContentVisibilityEmbeds.svelte`
  (per-section → dispatches `content.set-section-visibility`).
  Tests: `packages/core/tests/ux-perm-visibility-status.test.ts` (AC1 segment contract, AC2
  conflict matrix, AC3 default-deny, AC4 player section absence via
  `getContentItemDetailForActor`); e2e `apps/gm/tests/e2e/perm-visibility-preview-badges.spec.ts`
  (AC1 editor group, AC2 grant→warn→cancel/confirm via the real GrantManager flow, AC3 player has
  zero toggles, AC4 section dm-only → player keeps entity, loses section).
- **UX-PERM-006 (Preview as player / observer):**
  Core `packages/core/src/queries/preview-mode.ts` — reserved zero-grant generic preview actors
  (`preview-generic-player` / `preview-generic-observer`), `resolvePreviewActor` (fail-closed:
  unknown / non-player specific ids collapse to generic; `dm` is never previewable),
  `permissionsWithPreviewActors` (pure projection; STRIPS any grant addressed to a reserved id so
  persisted data can never smuggle `shared` content into a generic preview), `parsePreviewParam`
  (strict two-role URL allowlist), `previewBannerModel`, `PREVIEW_READONLY_MESSAGE`.
  GUI runtime `apps/gm/src/lib/canvas-runtime/runtime.svelte.ts` — `enterPreview`/`exitPreview`/
  `preview`; while previewing `activeActorId` IS the previewed actor and `state` swaps in the pure
  preview-actor permission projection, so the whole shell renders the player's actor-filtered data;
  `dispatch()` is the single READ-ONLY choke point (every durable command — routes, panels, and
  modal dialogs alike — is rejected with the shared message; raw state/persistence never see
  preview actors). Shell `apps/gm/src/routes/+layout.svelte` — `PreviewLauncher` (DM-only chrome) +
  fixed amber `PreviewBanner` (`role="status"`, `aria-live="assertive"`,
  `aria-keyshortcuts="Shift+Escape"`, always-visible Exit), `?preview=` URL entry (shareable
  "what will the player see" link), `Shift+Escape` global exit, `data-preview-mode` shell state +
  write-control lock layer in `apps/gm/src/routes/styles.css`.
  Tests: `packages/core/tests/ux-perm-preview-mode.test.ts` (fail-closed resolution, grant
  stripping, generic-preview no-leak through `getContentItemsForActor`, URL allowlist, banner
  copy); `apps/gm/tests/unit/ux-perm-preview-runtime.test.ts` (actor swap, dispatch rejection +
  no-write proof, synchronous exit, DM-only entry); e2e AC1 (banner + dm-only absent + DM chrome
  gone + URL param), AC2 (`Shift+Escape` restores full view), AC3 (specific player's exact grants:
  granted `shared` note present for them, absent for generic), observer deep-link cold load.
- **UX-PERM-007 (ambient visibility badge):**
  Core `resolveContentVisibilityBadge` in `packages/core/src/queries/visibility-status.ts` —
  DM-only default-deny; `mixed` wins when any section/field override differs from the entity level;
  `dm-only` is `emphasized` (always-visible critical state).
  GUI `apps/gm/src/lib/gui/ux-perm/VisibilityBadge.svelte` — compact chip, icon + label
  (`role="img"`, `aria-label="Visibility: …"`), `--color-dm-only-badge`/`--color-dm-only-subtle`
  DM-boundary tokens for the dm-only state, Mixed tooltip; rendered in the NotesWorkbench list rows
  (replacing the previous RAW visibility string that players could see — an actor-safety fix).
  Tests: core badge suite (default-deny, emphasis, mixed/non-mixed, fail-closed unknown/deleted);
  e2e AC1 (amber badge without hover), AC2 (seeded briefing row shows Mixed), AC3 (player list has
  zero badges and no leaked title).
- **UX-PERM-008 (cache purge + session privacy status):**
  Core `packages/core/src/queries/session-privacy.ts` — `resolveSessionPrivacy`: DM-only
  default-deny; three coarse outcomes with the spec's advisory copy
  (`PURGE_UNCONFIRMED_ADVISORY`, `PURGE_FAILED_ADVISORY` + "Review grants" remediation flag); the
  row type carries ONLY id/name/status/copy — no device-level fields exist by construction; 24 h
  display-then-archive window (`SESSION_PRIVACY_WINDOW_MS`, fail-closed on unparseable clocks);
  all-clear empty state (`SESSION_PRIVACY_EMPTY_STATE`).
  GUI `apps/gm/src/lib/gui/ux-perm/SessionPrivacyStatus.svelte` on `/settings/` — status chips with
  distinct icon shapes + text (never color alone), advisory copy, "Review grants" link to the
  `#grant-manager` anchor, archived count, and deterministic demo departure records with DM-only
  simulation controls (live departure transport deferred per ADR-014, same seam idiom as the
  existing COLLAB privacy surfaces).
  Tests: `packages/core/tests/ux-perm-session-privacy.test.ts` (default-deny, copy/tone/remediation
  per outcome, no-extra-fields proof, 24 h boundary, bad-clock fail-closed, anonymized sealed
  records, ordering, AC2 empty state); e2e UX-PERM-008 (unconfirmed row + advisory, failed →
  critical + Review grants, all-purged → empty state, panel absent for a player).

## Actor-safety / no-leak evidence

- Every new model is a core DEFAULT-DENY choke point: `resolveContentVisibilityToggle`,
  `resolveSectionVisibilityToggle`, `resolveContentVisibilityBadge`, and `resolveSessionPrivacy`
  return `null` for player/observer/unknown actors — surfaces render their absence (no toggle, no
  badge, no panel; absent, not `aria-hidden`).
- Preview mode is NOT an overlay: the previewed actor id is fed to the same core queries a real
  player session uses, the generic preview actor has zero grants, and
  `permissionsWithPreviewActors` strips grants addressed to reserved ids (adversarial persisted
  data cannot widen a preview). Writes are blocked at the single runtime dispatch choke point.
- Negative e2e assertions on both projects: `not.toContainText('forbidden-plot-XYZZY')` for the
  player view-as list, generic player preview, post-exit restore, and the observer deep link; zero
  `note-visibility-segment-*` / `*visibility-badge*` elements for players; the privacy panel
  carries no `key`/`path` device identifiers and is absent for players.
- Fixed in passing: the notes list previously rendered the raw `item.visibility` string for ALL
  viewers (players included); it now renders the DM-gated badge or nothing.

## Production-bug fixes required by this epic's flows

- `apps/gm/src/routes/+layout.svelte` / `apps/gm/src/lib/gui/NotesWorkbench.svelte`: the rolldown
  production minifier mis-associates the `x && (x.a === y || x.a === z)` / `x && (!y || y.z !== x)`
  condition shapes into null property reads. The pre-existing NotesWorkbench `saveStatus` instance
  threw on every `/knowledge` mount with no prior command and poisoned the surrounding effect
  flush; both sites now use early-return shapes (commented at each site so the pattern isn't
  reintroduced).

## Gates and test results

- `pnpm ux-workpack:validate` — passed.
- `pnpm docs:validate` — passed.
- `pnpm lint` (eslint + boundary + nav-registry + a11y contrast) — passed
  (79 contrast pair checks across 5 themes; zero new eslint suppressions).
- `pnpm typecheck` (core tsc + gm svelte-check) — 0 errors, 0 warnings.
- `pnpm --filter @dndtools/core test` — 191 files, 3060 tests passed (includes the 3 new suites —
  `ux-perm-visibility-status`, `ux-perm-preview-mode`, `ux-perm-session-privacy` — 32 new tests).
- `pnpm --filter @dndtools/gm exec vitest run tests/unit/ux-perm-preview-runtime.test.ts` —
  5 passed.
- Playwright `apps/gm/tests/e2e/perm-visibility-preview-badges.spec.ts` — 10 tests × both projects
  (desktop-chromium + mobile-chromium) = 20 passed.
- FULL Playwright suite on BOTH projects (required: shared shell touched — `+layout.svelte`,
  `styles.css`, NotesWorkbench): 736 total → 691 passed, 39 skipped, 6 failed — all 6 are the
  PRE-EXISTING `a11y-target-size.spec.ts` mobile sweep (its six per-route cases). Verified NOT a
  regression from this epic: the identical six failures (identical violation lists of long-standing
  controls — history buttons, palette triggers, `cc-*` Command Center widgets) reproduce on the
  unmodified `ux/integrate-completed-epics` HEAD with this epic's diff stashed
  (`git stash` → build → run → identical `6 failed`). The sweep is nondeterministic across runs
  (it passed in an earlier full run on this same tree); flagged for the integration owner. The
  known flaky pair (scene-create timer, CHAR-002 mobile) did not fail in the final full run.

## Known gaps / deferred

- Mobile bottom-sheet variant of the visibility control (spec's action-sheet presentation) is
  approximated by the same touch-target-compliant segment group; revisit when a shared bottom-sheet
  primitive exists.
- The `?preview=` URL parameter is set on enter and honoured on cold load, but is not re-appended
  to the address bar after subsequent in-app navigation (preview state itself persists until
  explicit exit; the shareable-link contract holds).
- Specific-player preview is launcher state only; the URL deep link always opens the generic
  zero-grant preview (deliberate: no actor ids in shareable URLs).
- Live departure/purge transport remains deferred (ADR-014); the Session privacy panel renders the
  core model over deterministic demo records with DM-only simulation controls.

## Git evidence

Branch `ux/UX-PERM-visibility-preview-badges-and-privacy-status`; single feature commit
`feat(ux): UX-PERM visibility controls, preview mode, badges, privacy status`.

Final `git status --short` (pre-commit snapshot; everything below is committed together):

```
 M apps/gm/src/lib/canvas-runtime/runtime.svelte.ts
 M apps/gm/src/lib/gui/ContentVisibilityEmbeds.svelte
 M apps/gm/src/lib/gui/NotesWorkbench.svelte
 M apps/gm/src/lib/gui/icons.ts
 M apps/gm/src/routes/+layout.svelte
 M apps/gm/src/routes/settings/+page.svelte
 M apps/gm/src/routes/styles.css
 M docs/planning/v2/ux/epics/UX-PERM-visibility-preview-badges-and-privacy-status.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
 M packages/core/src/index.ts
?? apps/gm/src/lib/gui/ux-perm/
?? apps/gm/tests/e2e/perm-visibility-preview-badges.spec.ts
?? apps/gm/tests/unit/ux-perm-preview-runtime.test.ts
?? docs/planning/v2/ux/epics/UX-PERM-visibility-preview-badges-and-privacy-status.completion.md
?? packages/core/src/queries/preview-mode.ts
?? packages/core/src/queries/session-privacy.ts
?? packages/core/src/queries/visibility-status.ts
?? packages/core/tests/ux-perm-preview-mode.test.ts
?? packages/core/tests/ux-perm-session-privacy.test.ts
?? packages/core/tests/ux-perm-visibility-status.test.ts
```
