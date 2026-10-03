# RC-POL-1.17 — Settings (every category)

Run journal, attempt 1 (base `2450f59c`). Scope: `screens/settings/` (every category),
`app/ConnectedSources.tsx` and `app/connectedSourcesVocab.ts`, plus the companions they need (EN/ES
catalogs, the pseudo catalog, e2e and visual specs, baselines, the raw-style ratchet, FEATURE-GAPS,
DEBT). One edit outside the claim, flagged below. No push, promotion, dispatcher-state change or
additional agent.

## Progress log

- Raw style: 226 inline spacing/radius literals across 31 owned files moved to `T.space.*` /
  `T.radius.*` (ties round up, as RC-POL-1.11 did: 10→`space-3`, 14→`space-4`). The one raw colour,
  the QR image's `#fff` padding, is gone: `qrDataUrl` already draws a four-module white quiet zone.
  Every owned entry left `scripts/eslint-rules/no-raw-style-values.allow.js` (966 → 727 total).
- File size: `app/ConnectedSources.tsx` 885 → 481 (its pull/push controller moved to
  `useConnectedSources` in the owned `connectedSourcesVocab.ts`, 496), `AiProvider.tsx` 547 → 486
  (preset card → `AiPresets.tsx`), `Sync.tsx` 510 → 365 (local backup → `LocalBackup.tsx`).
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
- **Outside the claim (flag for the operator):** `screens/knowledge/index.tsx` gained a four-line
  `sources` route intent so Settings → Vault's "Open Knowledge → Sources" / "Manage in Knowledge"
  open the Sources panel they name. That file belongs to RC-POL-1.11 (landed); the edit is additive
  and mirrors the existing `create` intent.
- Specs updated for copy changes: `cloud-enhanced-honest-limit.spec.ts` (curly quotes in the
  Settings consent label) and `ai-proposal-conflict.spec.ts` (typographic apostrophe).

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
      is in the URL (`?tab=`, `replace`), so Back leaves Settings. The Vault CTA now lands on the Sources
      panel it names. Waiver: physical Android Back is not exercised by Chromium emulation; no handler
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
