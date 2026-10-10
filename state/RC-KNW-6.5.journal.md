# RC-KNW-6.5 — Graph labels that can be read, and a phone layout that lists first

## Session 1 — 2026-10-10

Started on `dispatch/dndtools/5c7f4b0950263a279524` at `87e1c891` (RC-KNW-6.2 on top) with a clean
tree. No Headroom tools are exposed in this session; command output went to `/tmp/rc-knw65/*.log`
and was read directly.

Inputs read: RC_ROADMAP / friction review `knowledge.md` (KNW-15, 16, 17), the manifest fence
(`owns` + `companion_paths` + `journal_paths`), the RC-UX-3.5 maturity-signal API
(`isMaturitySignalReached('graph', state)`, threshold 3 links), every e2e/visual spec that drives
`/graph`.

### What was wrong (measured before changing anything)

- `graph.css` `.graph-surface button { overflow-wrap: anywhere }` reached the node buttons, whose
  label lived inside a 48–70px circle → mid-word breaks.
- In the demo vault at 1440 the live-session panel squeezes the canvas to ~500×350px beside the
  20rem rail; 19 names cannot fit there at any placement.
- Phone nodes showed an icon unless ≤12 nodes or focused/hovered (`showNodeLabel`).
- An empty vault rendered the toolbar, an empty canvas, Filter, Dormant arcs and Health.

### What shipped

- **Labels** (`Graph.tsx`, `graph.css`): one label layer after all node buttons (inside a button the
  label shared the button's stacking context and later circles painted over it). Each label sits
  below its node on a `--color-surface` halo, words wrap whole (`overflow-wrap: break-word`), two
  lines max (`line-clamp`), `aria-hidden`; the button's existing `title` and `aria-label` carry the
  full title. The diameter is `nodeDiameter(degree)` (48–72px), independent of the name.
- **Collision pass** (`presentation.ts` `placeLabels` + `useLabelPlacement`): measures each label in
  its home slot, then greedily places them (selection first, then by degree) over a ring of ~40
  candidate slots (below, slid sideways, beside, above, one row further out), scoring overlap with
  placed labels and on-canvas controls (×4), the canvas edge (×2), other nodes (×1); ties go to the
  slot nearest the node. Offsets are written to the CSS `translate` property, which React never
  sets. Re-runs on label-set change, canvas resize and `document.fonts.ready`.
- **Room for names**: the rail stacks under the canvas below 61.25rem of surface (was 39.25rem), so
  the canvas spans the page whenever beside-the-rail would leave it under ~40rem; the rail tier
  now names nodes like the desktop (threshold 24, not 12).
- **Phone** (`Graph.tsx`, `Search.tsx`): the results list is the primary view; a "Show map" /
  "Hide map" toggle (`aria-expanded`, `aria-controls` while open) opens the canvas above the list
  at 4:5. Selection, its neighbours, and the focused node are named on the map.
- **Empty vault**: one EmptyState with **New note** (→ `/knowledge` with the existing
  `{ create: true }` intent, opens the composer) and **Import notes** (→ `/knowledge`; see open
  items). A visually-hidden h2 keeps the heading order h1 → h2 → h3 (axe `heading-order`).
- **Signal gating**: below the RC-UX-3.5 graph signal, the filter box/chips/"Refine in Notes",
  the cluster hulls + Clusters toggle and the Dormant arcs panel do not mount; the results list
  stays (titled "On the graph") so every node remains reachable by name.
- i18n: 6 new `graph.*` keys in `en.ts` + `es.ts`; `qps-ploc.ts` regenerated
  (`tsx scripts/i18n-catalog.ts pseudo`).

### Tests

- New `tests/e2e/graph-readable.spec.ts`:
  - 1440 desktop, demo vault (`openDemoVault`, 19 nodes, live session panel open): every node is
    labelled; label rects pairwise non-overlapping (polled until the pass settles); no label runs
    past two lines; no word draws on two lines (Range client rects); title/aria-label carry the
    full title; still clean after selecting a node; axe clean.
  - Diameter equal for equal degree, ≥48px.
  - Phone profile (seeded vault): map closed by default, every one of the N rows (N = status
    total; ⊇ every live content title) is reached by name and toggles selection; the opened map
    names the selection; labels don't overlap; axe clean in both states. (The demo vault's phone
    `phone-session-strip` fails axe `region` — a shell finding outside this claim, so the phone
    test uses the seeded vault.)
  - Empty vault (both profiles): New note + Import notes, no Filter/Dormant/Clusters/Health/Show
    map; axe clean; New note opens the composer.
  - Below the signal (2 notes, 1 link): list present, no filter/clusters/arcs; axe clean.
- New `src/screens/graph/labels.test.ts`: `placeLabels` on plain boxes.
- `graph-polish.spec.ts`: one selector edit (the large-text target is the first of the canvas /
  results regions' node targets, so the phone checks its list row); results rows gained
  `data-testid="graph-result"` for it.
- `graph.spec.ts`: a `showCanvas(page)` helper opens the map on a phone before the four tests of
  the canvas itself (keyboard walk, seeded edges, hulls, edge geometry).
- Visual: `graph--*` and `graph-empty--*` re-baselined on all three tiers in the pinned container
  (`graph-selected`/`graph-repair` stayed within tolerance), re-deflated (IDAT at zlib 9; raw bytes
  asserted equal): budget 36,239.1 → 37,205.7 KiB of 37,888 KiB. A strict container compare of the
  committed PNGs passed 15/15.

Commands run (all exit 0):

```
DNDTOOLS_E2E_PORT=60209 npx playwright test tests/e2e/graph-readable.spec.ts --repeat-each=3 \
  tests/e2e/graph.spec.ts tests/e2e/graph-polish.spec.ts tests/e2e/graph-repair.spec.ts   # 165 passed
DNDTOOLS_E2E_PORT=60209 npx playwright test a11y-axe-gate knowledge-filters knowledge-start-from \
  maturity-signals feature-spotlight ux-audit responsive                                   # 271 passed
apps/gm-react/tests/visual/run-in-container.sh -g "graph polish" --update-snapshots=none  # 15 passed
DNDTOOLS_E2E_PORT=60209 npx playwright test responsive a11y-axe-gate               # after the rail-label change: 223 passed
pnpm lint            # exit 0, no Graph findings from lint:emphasis
pnpm --filter @dndtools/gm-react typecheck
pnpm test:app        # 180 files, 2231 tests
```

### Open items

- **Import from the empty state lands on Notes, not on the open importer.** Knowledge only honours
  `{ create | search | savedSearchId }` intents; an `{ import: true }` intent belongs in
  `screens/knowledge/index.tsx`, outside this claim. Follow-up: add the intent there and pass it from
  `Graph.tsx`.
- The demo vault's phone shell (`phone-session-strip`) fails axe `region` (best-practice); not this
  screen's code.
