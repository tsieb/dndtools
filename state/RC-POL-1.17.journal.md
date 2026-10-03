# RC-POL-1.17 — Settings (every category)

Run journal, attempt 1 (base `2450f59c`). Scope: `screens/settings/` (every category),
`app/ConnectedSources.tsx` and `app/connectedSourcesVocab.ts`, plus the companions they need (EN/ES
catalogs, the pseudo catalog, e2e and visual specs, baselines, the raw-style ratchet, FEATURE-GAPS,
DEBT). No path outside the claim (attempt 2 reverted the one edit attempt 1 made). No push,
promotion, dispatcher-state change or additional agent.

## Progress log

- Raw style: 226 inline spacing/radius literals across 31 owned files moved to `T.space.*` /
  `T.radius.*` (ties round up, as RC-POL-1.11 did: 10→`space-3`, 14→`space-4`). The one raw colour,
  the QR image's `#fff` padding, is gone: `qrDataUrl` already draws a four-module white quiet zone.
  Every owned entry left `scripts/eslint-rules/no-raw-style-values.allow.js` (966 → 727 total).
- File size: `app/ConnectedSources.tsx` 885 → 488 (its pull/push controller moved to
  `useConnectedSources` in the owned `connectedSourcesVocab.ts`, 496), `AiProvider.tsx` 547 → 488
  (preset card → `AiPresets.tsx`), `Sync.tsx` 510 → 364 (local backup → `LocalBackup.tsx`).
- Two hard-coded English strings in the push flow moved into the catalog (EN + ES).
- Contrast: an all-theme `color-contrast` probe of `#main-content` on every category found
  parchment tertiary text (4.49:1 on the raised surface) and scholar tertiary-on-tint (4.28:1).
  Text that used `--color-text-tertiary` now uses secondary (86 sites); icons keep the tertiary tint.
  The accent-on-tint pair (4.43:1, DEBT-2026-008) is avoided where the surface owns the markup
  (nav label, Experience/Tools/plan card titles, Plugins pointer); the DS `Seg`, `Avatar` and accent
  `Badge` still paint it.
- Type: 178 inline sizes mapped onto the token scale (≤12px → `--text-xs`, 12.5–13.5px →
  `--text-sm`); the four Cinzel titles under 24px are sans; the plan price is `--text-xl` mono.
- Layout/UX fixes found by screenshot review (desktop + phone): Account/Push notifications had no
  gap and unstyled 16px body; shortcut chips overflowed onto their descriptions; About stat values
  wrapped to four lines and printed the raw profile id ("web"); Permissions printed UUIDs, had an
  unlabelled action column and overflowed the phone; Players printed actor ids and truncated names on
  the phone; Subscription had two gold actions in one region; Vault paragraphs were unstyled 16px and
  "Open Knowledge → Sources" did not open Sources; Sync's comment said Local backup leads (Android
  tap-target reason) but Cloud backup rendered first, and an empty conflicts wrapper doubled a gap;
  Language read "English (English)"; the AI identity picker printed raw role ids.

- Illustrated states: the empty invite list uses `invites-empty`; the profile, device and invite load
  failures are `connection-lost` empty states that keep their Retry. Loading states were already
  skeletons in a labelled `LoadingRegion`.
- Vault's empty-state action is now labelled "Open Knowledge" and opens Knowledge; its body copy
  still names "Knowledge → Sources" as the next step. Attempt 1 instead added a `sources` route
  intent to `screens/knowledge/index.tsx` so the button could open the Sources panel directly; the
  claim fence refused that path, the acceptance criteria do not require it, and attempt 2 reverted it
  to base. HANDOFF (Knowledge owner): a `{ sources: true }` location-state intent beside the existing
  `create` intent would let Settings deep-link the Sources panel.
- Specs updated for copy changes: `cloud-enhanced-honest-limit.spec.ts` (curly quotes in the
  Settings consent label), `ai-proposal-conflict.spec.ts` (typographic apostrophe) and
  `markdown-folder.spec.ts` ("Imported 1 note." is now singular). An early edit to
  `golden-path.spec.ts` was wrong (onboarding has its own straight-quoted label) and was reverted
  before the commit.

## §20.2 Design fidelity

- [x] Composed only from `src/ds` primitives and `screen-kit`; zero raw hex/rgba/px literals (DSN-1.1
      lint clean for this directory). — Zero `dsn/no-raw-style-values` findings in every owned file; all
      31 owned allowances removed from the ratchet. Waiver: fixed element sizes (icon wells, the QR
      image, column minima) are dimensions, not spacing tokens, and the rule does not count them.
- [x] Matches the prototype view for this section (`docs/design/README.md` §4) and the design-package
      template where one exists; deviations listed with rationale. — Waiver: no Settings template is
      vendored in the design package and the live prototype is not reachable from this worker; the
      existing category-rail layout (rail on desktop/rail tiers, picker on the phone) is kept rather than
      claiming a comparison that did not happen.
- [x] One primary action per region in gold; supporting tiles flat/sunken; the primary panel raised
      with `--shadow-md`. — Subscription showed two gold "Try preview" buttons; only the recommended
      upgrade is gold now. App updates' download/restart are one exclusive ternary. Each AI & tools panel
      keeps its own single primary (Save key, Download, Ask, Register); the emphasis lint sums them at the
      page component (`Ai.tsx`, below its baseline), but each sits in its own panel region. Selected
      Experience cards stay raised with `--shadow-md`.
- [x] Type hierarchy uses 3–4 sizes; Cinzel only ≥ 24px; numbers in mono. — Owned text now uses
      `--text-xs` / `--text-sm` / `--text-base` / `--text-lg` (and `--text-xl` for the plan price);
      the four sub-24px Cinzel titles are sans. Numbers in mono: About stats, plan prices, translation
      coverage, the "3/3" maturity counts. Waiver: the screen-kit `Panel` title (Cinzel at 14px) is
      shared by every route and outside the claim.
- [x] Every status color paired with a distinct icon shape; DM-only purple stripe where applicable. —
      Status badges keep their DS icons (Healthy, Ready, Private), safety checks pair green/red/grey
      with success/error/info glyphs, sync conflicts carry text labels. Settings renders no DM-only
      content cards, so no purple stripe applies; the push dialog's DM-only warning uses the DS
      `VisibilityChip`.
- [x] Renders correctly in all themes and all three tiers; visual snapshots updated and reviewed. —
      See Verification: the nine `/settings` goldens re-baselined, plus a new five-theme × three-tier
      Vault empty-state crop (`tests/visual/settings-polish.spec.ts`). Every category was also
      screenshot-reviewed on desktop and phone in Tavern, and contrast-scanned in all five themes.
- [x] Motion uses named tokens; nothing animates under `data-motion='reduced'`. — No motion added;
      dialogs and toasts use the DS motion tokens and reduced-motion handling.
- [x] Empty, loading, error, and "unavailable because…" states all present and illustrated where the
      key exists. — See the progress log. Waiver: no illustration key exists for devices, vault sources,
      diagnostics tables or agent connections, so those keep icon empty states; the local-only build's
      "unavailable because" states (Cloud account, invites, recovery key, analytics) are labelled text.

## §20.3 Interaction and UX

- [x] Every action has feedback within 100 ms (optimistic or skeleton) and a completion toast or
      inline state. — Writes toast on completion (grant/revoke with Undo, rename, role change, theme is
      immediate); folder import/export report into a per-row live region; backup/restore disable while
      busy. Waiver: no wall-clock 100 ms assertion on this shared workstation.
- [x] Every destructive action is undoable or confirmed; every confirm names the thing. — Revoke grant
      has Undo; Doc disconnect has Undo; folder disconnect (Settings and Knowledge) confirms by name;
      restore, privacy switch, provider-key forget and local-model delete confirm. The spec asserts the
      folder confirm names "Table notes" in both places.
- [x] Save status visible on auto-persisted surfaces; failures say what to do next. — Appearance and
      Accessibility apply immediately and visibly; failures toast with a next step ("Try again",
      "Check that Ollama is running"). A thrown grant keeps the list unchanged and the retry succeeds
      (spec).
- [x] One clear route back; browser back works; Android Back follows the documented order. — The tab
      is in the URL (`?tab=`, `replace`), so Back leaves Settings. The Vault CTA is labelled for the route it
      actually opens (Knowledge) and its copy names the Sources step. Waiver: physical Android Back is not exercised by Chromium emulation; no handler
      changed.
- [x] No hover-only or gesture-only discovery; touch targets ≥ 44 px (48 dp Android). — Category rows
      use `--touch-target-min`; the roster's rename button now has the same hit area. Waiver: DS `sm`
      buttons and `Seg` options keep the shared density policy (mobile-chromium does not use comfortable
      density), as earlier polish passes recorded.
- [x] The compact tier exposes one primary top-bar action; overflow in a bounded sheet. — Settings adds
      no top-bar action; the phone uses the section picker. Players' role picker now wraps under the name
      on the phone instead of truncating it.
- [x] Copy follows the content fundamentals; strings via `t()`; ES present. — Re-read all 944
      `settings.*` / `sources.*` strings. Changed: device-neutral "Select the pencil", sentence-case
      badges (Connected, Needs sign-in, Selected, Desktop only, Not running…), typographic quotes, a
      plural for imported notes, formatted bytes, readable platform names instead of `web`, role names
      instead of role ids, names instead of UUIDs/actor ids. New keys in EN and ES; pseudo catalog
      regenerated. Waiver: Recent changes still names core command ids in English (`humanizeOp`, an
      existing RC-UX-1.2 handoff), now listed as a FEATURE-GAPS limit.
- [x] Contextual help (HelpTip) beside any non-obvious control; shortcuts in tooltips. — Existing
      HelpTips on privacy mode, recovery key and the tool preference stay; every SetRow carries help
      text. No new shortcut introduced.

## §20.4 Accessibility

- [x] axe clean (desktop + mobile) for this route and its open overlays; register unchanged. —
      `settings-polish.spec.ts` runs the strict tag set (wcag2a/aa, 21aa, 22aa, best-practice) on all 14
      categories, the tier-gated view, the restore confirm, the Cloud-Enhanced consent dialog, the
      provider-destination confirm, Knowledge Sources' lossy-export and disconnect dialogs, and Vault's
      disconnect dialog, on both profiles. Fixed on the way: the unlabelled Permissions action column
      (`empty-table-header`). Waiver: the signed-in cloud dialogs (delete account, forget device, sign out
      everywhere, create/revoke invite, recovery key export/import) need a configured account API the e2e
      build does not have. Separately, an all-theme contrast probe found the parchment pairs listed in
      the progress log; those the DS paints are recorded under DEBT-2026-008.
- [x] Keyboard-only walkthrough of the primary task recorded in the PR; focus visible everywhere. —
      Spec: focus the Theme radiogroup, `:focus-visible` holds, ArrowRight applies Parchment, ArrowLeft
      returns to Tavern. Dialog Cancel/Escape returns focus to the launcher (privacy switch, folder
      disconnect); the restore confirm opens on Cancel.
- [x] Landmarks and headings correct (`<h1>` once, from `SECTION_TITLES`); `nav` labelled. — The shell
      owns the `<h1>`; panels are `<h2>`; the rail is `nav` "Settings navigation". The Plugins pointer no
      longer nests a `complementary` landmark inside the panel.
- [x] Live regions announce operations; no announcement spam. — Knowledge Sources' per-row outcomes
      now sit in always-mounted polite regions (a region inserted with its text is often not announced);
      toasts announce the rest. Empty states are not live regions.
- [x] Screen-reader spot check on one platform noted. — Waiver: no native screen reader is available
      to this worker; role/name assertions and axe stand in, and are not claimed as speech output.
- [x] 200% zoom / large text: no clipping; reachability spec case added if new scroll regions. — Spec:
      at 200% root text, no category overflows `#main-content` on either profile (About's stat grid now
      sizes its columns in rem). No new scroll region.

## §20.5 Core discipline and correctness

- [x] No state mutation outside `runtime.dispatch`; no client-side visibility filtering. — Grants,
      roles, renames, imports and exports dispatch core commands; notes for export come from
      `getContentItemsForActor`. Device preferences (theme, tier, locale) are device-local by contract.
- [x] Preview-as-player: writes rejected read-only and controls hidden/disabled accordingly. — Spec: in
      player preview a grant dispatch is rejected and the grant count is unchanged; About shows "DM only".
- [x] Player projection of this surface verified through an actor read in an e2e. — Spec: a viewer
      grant made in Permissions makes a shared scene visible in the player's `getSceneForActor` read,
      never lifts a DM-only scene, and revoking it restores the hidden read.
- [x] e2e on both profiles covers the primary task and one failure path. — Theme change by keyboard;
      grant/revoke; folder connect/export/disconnect; thrown grant with intact list and successful retry.
- [x] Perf: the surface's budget measured before/after (ENG-1.1); no regression. — Waiver: ENG-1.1
      defines no Settings budget or capture scenario (`docs/development/PERFORMANCE.md`). The split moved
      code between modules without new queries or network calls.
- [x] Docs: FEATURE-GAPS inventory row updated; architecture doc updated if a contract moved. — Row
      lists `settings-polish.spec.ts` and the Recent-changes language limit. No core contract moved.

## Verification (on `c724f230` + `da199c8a`, base `2450f59c`; `loop/rc` unchanged)

Raw logs stay outside the tree in `/tmp/pol117-*.log`. Two background runs were cut off when the
worker session ended (a 958-test e2e sweep at 395 and a full visual run at 24); both were re-run in
foreground chunks below rather than counted.

- New `settings-polish.spec.ts`, both profiles: first runs failed on the spec's own mistakes (mobile
  category switching, a race on the lossy-export dialog, the consent dialog being an `alertdialog`,
  a DM-only scene in the projection test) and on one real defect, About overflowing by 17px at 200%
  text on the phone (fixed: rem column minimum, wrapping values). Now green with the rest of chunk 1.
- E2E, desktop-chromium + mobile-chromium, `--workers=3 --retries=1`:
  - settings-polish, settings, settings-tiers, permissions, co-dm, push-notifications,
    cloud-enhanced-honest-limit, backup-restore, sync, markdown-folder: **78 passed**.
  - ai-assistant, ai-audit-browser, ai-batch-review, ai-local-models, ai-proposal-conflict,
    ai-proposal-preview, a11y-axe-gate, route-titles, help-tips, themes, golden-path, upgrade:
    **194 passed, 6 skipped** (existing per-profile skips).
  - knowledge, knowledge-filters, knowledge-polish, knowledge-reading-width, knowledge-templates,
    local-vaults, demo-vault, storage-integrity, shortcuts, command-palette: **138 passed, 2 skipped**.
  - responsive, widget-generate, dice-tray, canvas, knowledge-reading-width: **268 passed**.
- Visual, the gate's own command split by tier (`run-in-container.sh --update-snapshots=none
--workers=2 --project=…`): desktop **156 passed**, rail **156 passed**, phone **156 passed**.
  Re-baselined in the container with `-g settings --update-snapshots=changed` (9 goldens changed,
  15 new crops), reviewed as contact sheets, then losslessly re-deflated (decoded rows asserted
  identical; 1,410,792 → 1,352,474 B). `check-baseline-budget.mjs`: **643 files, 32,180.4 KiB of
  32,768.0 KiB** (base 31,985.6).
- `pnpm gates`: exit 0; 30 file-size warnings, **none for an owned file** (owned maximum 496 lines,
  `connectedSourcesVocab.ts`; then `ConnectedSources.tsx` and `AiProvider.tsx` at 488).
- `pnpm lint` (raw-style count, ESLint, boundary, emphasis, contrast): exit 0, 0 errors.
- `pnpm typecheck`, `pnpm build` (incl. `check-prod-bundle`), `pnpm feature-audit` (42 limits,
  0 stale), `pnpm format:check:changed --base loop/rc`: all exit 0.
- `pnpm test:app --maxWorkers=3`: **161 files, 1,767 tests passed** (includes the pseudo-catalog,
  i18n argument and token-reference checks).

### Reproduction

```sh
cd apps/gm-react
DNDTOOLS_E2E_PORT=5392 npx playwright test tests/e2e/settings-polish.spec.ts --workers=3
cd ../.. && bash apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --workers=2
node apps/gm-react/tests/visual/check-baseline-budget.mjs
pnpm gates && pnpm lint && pnpm typecheck && pnpm test:app --maxWorkers=3
```

These are local results; the central operator's wrapper gates and independent review are separate.

## Attempt 2 — claim fence

Gate feedback: the candidate changed `apps/gm-react/src/screens/knowledge/index.tsx`, outside the
claim. It is not required by any acceptance criterion, so it is reverted to `2450f59c`. Inside the
claim: `settings.vault.openSources` reads "Open Knowledge" / "Abrir Conocimiento" (pseudo catalog
regenerated), Vault's two Knowledge buttons navigate to `/knowledge` without the dropped intent, and
`settings-polish.spec.ts` follows the honest path (Open Knowledge → the page's own Sources toggle).
The 15 vault empty-state crops carry the button label, so they were regenerated in the container,
reviewed and re-deflated (222,214 → 213,577 B).

- `settings-polish`, `knowledge-polish`, `knowledge` e2e, both profiles: **76 passed**.
- Visual `-g settings --update-snapshots=none`: **24 passed**; budget **643 files, 32,166.6 KiB**.
- `pnpm gates`: exit 0, no file-size warning for an owned file. Vitest `src/i18n` +
  `screens/settings`: 77 passed. ESLint and Prettier on the changed files: clean.
