# RC-POL-1.12 — Graph and search polish

## Scope and implementation

- Actor-filtered graph reads, neighborhood indexing and read-only navigation retained.
- Split search, inspector and health presentation out of Graph.tsx; all owned files below 500 lines.
- Tokenized spacing/type, DS search and action controls, 48px minimum targets, illustrated graph/search/repair empties, clear filters, translated viewpoint label and recoverable repair errors.
- Repair now handles thrown dispatch failures, exposes pending status and blocks overlapping fixes and preview writes.
- Tests, snapshots, message catalogs and FEATURE-GAPS are roadmap §0.2 automatic grants. The three deleted raw-style allowance entries are required by the existing ratchet after token migration; no allowance added or gate weakened.
- No Headroom tool is available; exact local gate logs retained under /tmp/graph-\*.log. No dispatcher control state touched.

## Validation ledger

- App typecheck and surface ESLint pass after extraction/token migration.
- Final desktop/mobile graph, repair and polish specs: **48/48 passed**, including both pointer-leave cases.
- Strict axe scenarios pass on both profiles, with an unchanged register. Final pinned **60-image comparison passed 15/15 cases**, without update mode.
- `pnpm check`: exit 0; core 4,902 tests, cloud 521, app 1,584, tooling 196 (490 test files total). All typechecks, system/Android checks, boundary and six quality gates passed. Final focused checks follow the later canvas/hover refinements.

## Embedded §20.2–§20.5 checklist

Every item below is checked or explicitly waived. Waivers describe the actual boundary; they are not claims of unperformed validation.

### 20.2 Design fidelity

- [x] Composed only from `src/ds` primitives and `screen-kit`; zero raw hex/rgba/px literals (DSN-1.1 lint clean for this directory). **Disposition:** WAIVER (composition/geometry only): native canvas buttons retain refs for arrow-key focus because DS Button does not forward them; SVG coordinates, degree-driven diameters and the visually-hidden one-pixel heading are geometry/accessibility constants. All other actions use DS; all 61 raw spacing findings removed; ESLint passes with no allowances for this surface.
- [x] Matches the prototype view for this section (`docs/design/README.md` §4) and the design-package template where one exists; deviations listed with rationale. **Disposition:** WAIVER (exact prototype): no graph template exists in the vendored template inventory. Preserve the established canvas + search/inspector composition. Actual core kinds remain note/story/map/POI rather than invented prototype entities; search remains before inspector to avoid layout shifts.
- [x] One primary action per region in gold; supporting tiles flat/sunken; the primary panel raised with `--shadow-md`. **Disposition:** Checked: canvas keeps shadow-md, support panels are sunken/flat, selected entity has one primary Open action. Scholar uses its prescribed navy accent rather than forcing gold across themes.
- [x] Type hierarchy uses 3–4 sizes; Cinzel only ≥ 24px; numbers in mono. **Disposition:** Checked: body/meta/emphasis token sizes; graph Panel headings explicitly use sans, overriding screen-kit's small Cinzel default. Counts use mono in result/health rows. WAIVER: shared shell title and DS badges retain their shared typography; changing shell/DS contracts is outside this surface.
- [x] Every status color paired with a distinct icon shape; DM-only purple stripe where applicable. **Disposition:** Checked: DS Badge automatically supplies success/warning/error icon shapes; kind legend and rows use distinct semantic icons; full DM health report has purple stripe.
- [x] Renders correctly in all themes and all three tiers; visual snapshots updated and reviewed. **Disposition:** Checked: 60 pinned PNGs: populated graph, selected inspector, no-result graph/search, repair empty; five themes × three tiers. Reviewed contact sheets; inspected rail Scholar at full size. Rail uses compact label density after visual review exposed crowding.
- [x] Motion uses named tokens; nothing animates under `data-motion='reduced'`. **Disposition:** Checked: canvas opacity transition uses duration-fast/easing-standard; token durations collapse under reduced motion; pinned captures use reduced motion.
- [x] Empty, loading, error, and "unavailable because…" states all present and illustrated where the key exists. **Disposition:** Checked: graph-empty/search-none illustrations, repair-empty illustration; repair saving status and error with retry instruction. Disabled player view states its prerequisite. WAIVER: graph queries are synchronous after runtime load; shell owns initial loading/fatal errors. No graph-specific loading/error illustration keys exist; no artificial timer or fake state added.

### 20.3 Interaction and UX

- [x] Every action has feedback within 100 ms (optimistic or skeleton) and a completion toast or inline state. **Disposition:** Checked: pressed selection/facet/view state and result-count status update synchronously; repair sets pending before awaiting dispatch and reports completion through toast or error inline. Timing benchmark records real index-to-render latency separately.
- [x] Every destructive action is undoable or confirmed; every confirm names the thing. **Disposition:** WAIVER (not applicable): no deletion/destructive operation on graph. Repair replaces only the authorized broken link with the user-named target; it does not delete notes or bulk rewrite content.
- [x] Save status visible on auto-persisted surfaces; failures say what to do next. **Disposition:** Checked: repair pending status and durable success toast; thrown/rejected failures retain the row with an explicit retry/reopen instruction. Graph search/selection are transient, not auto-persisted.
- [x] One clear route back; browser back works; Android Back follows the documented order. **Disposition:** Checked: Repair BackBar and entity deep links use router navigation; existing repair Back e2e passes. WAIVER: native Android Back behavior belongs to the unchanged shell and was not device-tested in this browser task; graph introduces no overlay/back-stack handler.
- [x] No hover-only or gesture-only discovery; touch targets ≥ 44 px (48 dp Android). **Disposition:** Checked: node/title accessible labels, persistent keyboard HelpTip, search list and direct buttons; surface controls have 48px minimum targets. Dense canvas geometry can overlap; full actor-visible list and roving focus remain alternative access paths.
- [x] The compact tier exposes one primary top-bar action; overflow in a bounded sheet. **Disposition:** WAIVER (shell-owned): graph introduces no top-bar action or overflow. Shared compact shell retains its charter actions and bounded navigation sheet; graph uses in-flow controls.
- [x] Copy follows the content fundamentals; strings via `t()`; ES present. **Disposition:** Checked: all new labels/status/recovery copy via t(), EN and ES updated; local-markdown source label now localized. Entity titles/tags and external provider names remain data.
- [x] Contextual help (HelpTip) beside any non-obvious control; shortcuts in tooltips. **Disposition:** Checked: persistent HelpTip explains arrows/Enter/Escape and node tooltips identify entity/kind/connection count. WAIVER: shortcuts stay visible in-flow instead of duplicating the same instructions in every tooltip; touch and keyboard both discover them.

### 20.4 Accessibility

- [x] axe clean (desktop + mobile) for this route and its open overlays; register unchanged. **Disposition:** Checked: strict axe with all violations asserted empty in graph, selection, no-results, player view, repair, failed repair, successful toast, and preview; desktop + mobile. No surface-owned modal overlays; no known-violation entries changed.
- [x] Keyboard-only walkthrough of the primary task recorded in the PR; focus visible everywhere. **Disposition:** Checked: keyboard e2e records focus first node → ArrowRight → Enter → Focus neighborhood → End → Enter → Escape; search Escape clears only query. Large-text test tabs from labelled results region to its first result. Global focus ring retained. This journal is the local review record; no PR publication authorized.
- [x] Landmarks and headings correct (`<h1>` once, from `SECTION_TITLES`); `nav` labelled. **Disposition:** Checked: shell supplies the route h1; canvas now supplies an h2 before EmptyState h3; Panel headings and labelled search region pass strict axe including heading-order.
- [x] Live regions announce operations; no announcement spam. **Disposition:** Checked: one result-count status, repair pending status and alert, existing completion toast. EmptyState itself is not a live region; no per-node announcements added.
- [x] Screen-reader spot check on one platform noted. **Disposition:** WAIVER (manual assistive technology): no NVDA/VoiceOver/Orca session is available in this headless environment. Browser accessible names, roles, pressed states, keyboard focus and live-region contracts are exercised; this is not represented as a human screen-reader pass.
- [x] 200% zoom / large text: no clipping; reachability spec case added if new scroll regions. **Disposition:** Checked: desktop/mobile e2e doubles root font size, verifies no horizontal surface clipping, clear/search reachability, and keyboard entry to labelled scrollable results. No new unlabelled scroll region.

### 20.5 Core discipline and correctness

- [x] No state mutation outside `runtime.dispatch`; no client-side visibility filtering. **Disposition:** Checked: actor-scoped core visualization/health/clusters/repair authorization retained. Only durable operation remains runtime.dispatch(content.update-item); local filters control query inputs and canvas focus, never authorization.
- [x] Preview-as-player: writes rejected read-only and controls hidden/disabled accordingly. **Disposition:** Checked: preview e2e enters player preview, asserts direct command rejection and unavailable repair controls. Repair guards runtime.readOnly and disables all fix buttons while pending.
- [x] Player projection of this surface verified through an actor read in an e2e. **Disposition:** Checked: existing graph e2e switches to real registered player actor, proves DM-only canary absent and general health bands; preview regression also rejects writes.
- [x] e2e on both profiles covers the primary task and one failure path. **Disposition:** Checked: existing primary search/open/repair e2e plus new deterministic storage failure → retry → accepted repair on both profiles.
- [x] Perf: the surface's budget measured before/after (ENG-1.1); no regression. **Disposition:** Checked: fresh original-revision and final-source captures, seven batches of five updates each; repository measureCapture/compareToBaseline grade recorded below. WAIVER: the supported capture uses a 200-note local fixture, not the registry's 10,000-record slim device; no full-dataset performance claim.
- [x] Docs: FEATURE-GAPS inventory row updated; architecture doc updated if a contract moved. **Disposition:** Checked: FEATURE-GAPS row documents density/focus/search/repair improvements and remaining label-only search/dense-canvas constraint. No architecture contract moved.

## Findings during verification

- Initial existing browser suite: 36/38 passed; two desktop tests timed out in runtime startup before their bodies. A later combined stable-source run passed 46/46; final post-review rerun is recorded below.
- Initial strict axe scan found `heading-order` in the new empty canvas. Added a level-two canvas heading before EmptyState's level-three title; the violation register stays untouched.
- Attempting the shared Button on canvas nodes produced React's exact warning: `Function components cannot be given refs`. The existing Button does not forward refs. Retain native node buttons for roving keyboard focus; all other actions use DS Button. This is a scoped design-composition waiver, not a shared DS API change.
- First pinned visual pass produced 45 graph images (five themes, three tiers, populated/selected/empty). Expanded to 60 with Repair; regenerated after the last UI changes. Final comparison is recorded below.

## Performance evidence

- `pnpm perf:capture --only graph-indexing --notes 200 --port 6097 --out /tmp/graph-perf-before-quiet.json` at original `2d9f566d`, in an isolated detached temporary checkout; then the same command with port 6098 on the final task source. Both exit 0, seven batches × five updates.
- Earlier runs overlapped browser/visual checks and were discarded from the comparison because load differed. The retained pair ran sequentially without another validation command from this task.
- Repository `measureCapture` reports median batch durations **112.0 ms before, 125.3 ms after**, both below the 500 ms graph-indexing budget. `compareToBaseline` with its unchanged 20% tolerance grades **steady** (+11.875%); no baseline tolerance or budget changed. The 13.3 ms shift is also within the existing 25 ms resolution floor.
- `polish-perf.json` retains sanitized exact samples, repetition arrays, host class, timestamps and computed comparison. Both captures actually used **200 notes** on a local desktop; the registry's 10,000-record dataset remains explicitly waived, not claimed as measured.

## Final acceptance evidence (2026-09-20)

- `DNDTOOLS_E2E_PORT=6099 DNDTOOLS_PW_WORKERS=2 pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/graph.spec.ts tests/e2e/graph-repair.spec.ts tests/e2e/graph-polish.spec.ts --project=desktop-chromium --project=mobile-chromium`: **exit 0; 48 passed (46.8s)**. Exact output `/tmp/graph-complete-e2e.log`.
- This includes strict axe checks (no ignored violations) for route/selected/empty/player/repair/error/success-toast/preview states; repair storage failure and successful retry; keyboard traversal; 200% text; player canary; preview command rejection; selected-row pointer leave. Graph has no own dialog/sheet overlays to waive from the axe scan.
- `DNDTOOLS_PW_WORKERS=2 apps/gm-react/tests/visual/run-in-container.sh graph-polish.spec.ts`: **exit 0; 15 passed (29.6s)**, all **60 screenshots compared without update mode** in the pinned v1.61.1 Noble image. Exact output `/tmp/graph-complete-visual.log`. Graph, selected inspector, no-results and repair states cover Tavern, Parchment, Scholar, Dungeon, High Contrast on desktop/rail/phone. Contact sheets and full-size rail inspected; no clipped control or unreadable rail label accepted.
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs`: exit 0; entire repository 195 PNGs, 20,551.4 KiB of 32,768 KiB.
- Final `pnpm --filter @dndtools/gm-react typecheck`, surface/test ESLint, `pnpm gates`: **exit 0**. Exact logs `/tmp/graph-ready-type.log`, `/tmp/graph-ready-lint.log`, `/tmp/graph-ready-gates.log`. All six gates pass. Unrelated legacy size warnings remain elsewhere; **zero warnings for Graph.tsx or graph/**. Largest owned source: Graph.tsx, 430 lines; every owned file including evidence below 500.
- `pnpm check`: exit 0, 4,902 core + 521 cloud + 1,584 app + 196 tooling tests, plus required checks. It preceded final presentation-only refinements; final typecheck, lint, graph browser checks, snapshots and quality gates above cover those refinements.
- `pnpm format:fix:changed` and `git diff --check`: exit 0. Raw-style allowance changes only remove the three migrated surface entries and recompute the list total; no new exception.
- The temporary original-revision performance checkout was removed. No push, promotion, new loop, or dispatcher-state edit. Local commit is the handoff artifact; central gates and independent review remain with the operator.

### Final review notes

- Pointer-leave regression initially sampled an in-progress CSS transition and failed one desktop assertion. The final test inspects the inline destination color, so neither a transient interpolated color nor immediate success before a transition can hide a lost selected state. Final 48/48 includes the corrected assertion.
- Manual screen-reader/native Android and the full 10,000-record device budget are the explicit waivers above; none are represented as completed tests.
