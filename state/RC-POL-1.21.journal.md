# RC-POL-1.21 — Wiki reader polish

## Scope and findings

Owned screen: `apps/gm-react/src/screens/WikiReader.tsx`. Ancillary changes are confined to
its EN/ES metadata copy, tests/fixtures, visual baselines, style ratchet, and FEATURE-GAPS row.
No dispatcher state, agents, push, promotion, or loop launch. Headroom tools are unavailable in
this session; diagnostics below come from original local tool output.

The starting screen exceeded 500 lines, used three theme choices and undersized Cinzel, lacked
notice headings, and offered only offline error coverage in Playwright. Existing keyboard focus,
password retry announcements, sanitized markdown, and public URL contracts must remain intact.

## Embedded §20.2–§20.5 checklist

Checked items include explicit, scoped waivers below; a waiver is not a claim that a test ran.

### §20.2 Design fidelity

- [x] DS controls/cards/empties and token values; strict raw-style lint is clean. Waive shell
      screen-kit composition for this account-less document; semantic HTML supplies landmarks and
      prose. The existing one-pixel header divider is a structural hairline, permitted by DS lint.
- [x] Prototype/template: waived exact prototype comparison; the §4 mapping has no public wiki
      reader template. Preserve standalone reader navigation, adopting shipped DS primitives.
- [x] One primary action per region; supporting navigation sunken, notice card raised. Waive
      a raised article panel: an unframed reading measure avoids nesting a card around published prose.
- [x] 3–4 type sizes, Cinzel at least 24px, numeric metadata in mono.
- [x] Status icon shapes; DM stripe waived: public server-projected reader has no DM controls.
- [x] All five themes × desktop/rail/phone screenshots updated and reviewed.
- [x] Named motion tokens and reduced-motion behavior.
- [x] Empty/loading/error/unavailable present; publish-empty, knowledge-empty and search-none
      drawings used. Loading/error/unavailable have icon shapes; their illustration keys do not exist.

### §20.3 Interaction and UX

- [x] Immediate feedback and inline completion on fetch, retry, search, theme and navigation.
- [x] Destructive actions waived: this surface has none.
- [x] Save status waived: reader has no persisted edits. Load failures offer Try again.
- [x] Route back: native browser/Android navigation retained. No artificial app home link for an
      account-less visitor. Article choices are in-page selection, not separate routes.
- [x] No hover/gesture-only controls; navigation, inputs, buttons and document links have 48px
      targets. Inline links in published prose use the shared renderer and the inline-text exception.
- [x] Compact top-bar/overflow sheet waived: no toolbar or secondary action menu on this reader.
- [x] Voice reread; translated EN/ES metadata and shared theme labels.
- [x] HelpTip waived: Search wiki, Reader theme and password labels are self-explanatory; no shortcuts.

### §20.4 Accessibility

- [x] axe clean on desktop/mobile for notices, ready, password and error; no overlays exist.
- [x] Keyboard reading walkthrough and focus assertions recorded below.
- [x] One h1 for notices/wiki title, labelled nav and main. SECTION_TITLES waived for dynamic
      public document title outside the application shell.
- [x] Loading/search/error announcements; heading focus on article selection.
- [x] Screen-reader audio spot check waived: no screen reader is available in the headless runner.
      Automated accessibility/keyboard checks are evidence only for their stated coverage.
- [x] 200% text and mobile reachability; no new scroll regions.

### §20.5 Core discipline and correctness

- [x] No domain writes or client visibility filtering: input/search/theme are transient UI state;
      getPublicWiki supplies the server-projected bundle and shared markdown hides Secret callouts.
- [x] Preview-as-player writes waived: public reader exposes no writes or authenticated runtime.
- [x] Actor projection: existing wiki compose e2e checks DM-only canary exclusion; fixture reader
      tests do not claim to exercise cloud authorization.
- [x] Primary task and failure path e2e pass on both profiles.
- [x] Performance budget waived: ENG-1.1 registry has no public-reader scenario. No new network
      calls or dependencies; shared illustration/button code is already in the DS bundle.
- [x] FEATURE-GAPS row updated; architecture changes waived: no API/runtime contract moved.

## Implementation and validation

- Existing WikiReader component tests: 15 passed (original `/tmp/wiki-unit.log`).
- Browser fixture intercepts served cloud configuration and synthetic local API only; it does not
  add a production test seam or contact live services.

- Theme choice starts from the current application palette (parchment fallback), with all five
  presets selectable in the reader. Metadata now uses translated EN/ES text; API failures use
  local message keys instead of unlocalized server text. Password failure has an associated
  description and warning shape. The shared sanitizer and public document URL resolution remain.
- Consolidated notice cards and paragraph styles, removed duplicated empty copy and long historical
  comments, and retained the behavior rationale beside focus/password guards. Screen: **499 lines**.
- Strict raw-style ESLint: **0 errors, 0 warnings**; removed the reader's 21-entry allowance.
- `pnpm gates`: exit 0; **no WikiReader file-size warning**. Existing unrelated size warnings remain.
- `pnpm --filter @dndtools/gm-react typecheck`: exit 0. Targeted ESLint and Prettier: exit 0.
- `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/screens/WikiReader.test.tsx`:
  **15 passed**, exit 0. URL, repeated password failure, initial focus and retry contracts preserved.
- Accessibility discovery: parchment tertiary text on the page background measured **4.01:1**.
  Changed small copy to the secondary token, including a scoped EmptyState description override.
  Axe now scans settled themes: DS palette transitions otherwise produce an intermediate contrast
  frame. Reduced motion uses the app's global **0.001ms** transition override, not literal zero.
- Keyboard walkthrough (both profiles): Tab to skip link → Enter focuses main → Shift+Tab reaches
  the last page choice → Enter changes article and focuses its heading. Search reports no matches;
  all five palettes are scanned; 200% root text retains page-width reachability. No overlays exist.
- Pinned Playwright image, update: **99 passed** (90 new cases: six states × five themes × three
  tiers, plus nine existing wiki goldens). All six contact sheets (15 captures each) inspected:
  readable theme differences, stacked phone layout, complete notice cards and no clipped controls.
- Strict pinned compare: `CONTAINER_ENGINE=docker apps/gm-react/tests/visual/run-in-container.sh
--update-snapshots=none --retries=0 -g wiki --workers=2`: **99 passed**, exit 0.
- Baseline budget: **225 files, 14,858.8 KiB / 32,768 KiB**, exit 0; no per-file cap failures.
- No prototype service or screen-reader audio session was available. Those waivers are explicit
  above. This is local candidate evidence; central independent review and delivery remain separate.
- Final functional command: `pnpm --filter @dndtools/gm-react exec playwright test
tests/e2e/wiki-reader-polish.spec.ts tests/e2e/wiki.spec.ts tests/e2e/a11y-axe-gate.spec.ts
-g wiki --workers=2 --repeat-each=2`: **36 passed**, exit 0 (48.2s). This includes both
  desktop/mobile profiles, all-five-theme ready/empty/loading axe scans, password/error/missing
  notices, keyboard-only reading, reduced motion, large text, and the compose DM-only canary.
- Two earlier runs overlapped the container renderer and saw a blank initial mobile page. The
  isolated mobile diagnostic passed; both full repetitions without concurrent rendering passed.
  Concurrent Vite startup/cache contention is a hypothesis, not a diagnosed application fault.
  Browser error diagnostics remain in the test; no retry or automatic reload masks a failure.
