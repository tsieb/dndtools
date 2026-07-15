# ADR-024: Procedural Map Generation Suite and Editor Rebuild

- Status: Accepted
- Date: 2026-07-14
- Deciders: Engineering
- Consulted: Product, Design, Security
- Supersedes: N/A
- Amends: N/A
- Relates-to: ADR-014 (the engine-free geometry-renderer decision this ADR upholds), ADR-019
  (content-addressed asset bytes), ADR-009 (performance budgets)

## Context

The map tool shipped a toy generator — a `≤24×24` cell loop that scattered random rectangles into three
"kinds" (terrain / settlement / dungeon) — and an editor that surfaced almost none of even that: five
tools (select / pan / POI / token / fog), no undo stack, no keyboard shortcuts, no paint tools, no grid,
and thirteen already-built core map commands with zero UI. The ask was to make the map tool genuinely
capable: a broad procedural-generation suite, a professional editor, and interoperability, with UX as the
first-order concern.

Three questions needed deciding before building: **what generation model** (given a strict determinism
and sync contract), **how far to push the renderer** (ADR-014 forbids a pixel engine), and **whether to
interoperate** with other VTTs.

## Decision

### 1. The persisted map model stays pure normalized-vector; grids are scratch-only

The core map model is normalized-space (0..1) polygons/polylines. That is not a limitation to work around
— it is the decisive advantage. TinyKeep dungeons, BSP, Voronoi worlds, city wards, L-system roads, and
river networks are all natively vector. The raster algorithms (cellular-automata caves, noise heightmaps)
use a `CellGrid` **as an in-generator scratch buffer only** and exit to vectors through a single
marching-squares → Douglas-Peucker → Chaikin pipeline (`packages/core/src/geometry/`). No cell grid is
ever persisted, synced, or placed in the op log. Per-cell durable data is explicitly out of scope; it is
incompatible with the op-value-carries-the-delta model below and with the whole-slice JSON snapshot.

Generators are **declarative** (`packages/core/src/generation/`): each publishes its parameters as data
(`ParamSpec[]`) and the editor renders its entire UI — picker, knobs, presets, advanced disclosure — from
that data, so a new generator is a pure-core change with zero UI code. Thirteen generators ship across the
scale ladder (dungeon ×3, cave ×3, city, village, region, hexcrawl, world, scatter ×2).

Determinism (the Contract 2 requirement) is preserved by **per-subsystem RNG streams**
(`createRngStreams` / `deriveStream`): a generator draws only from named sub-streams of the root seed, so
the same `{generatorId, seed, params}` reproduces byte-identical output on every device, and nudging one
subsystem's parameters does not reshuffle the others. This cannot be retrofitted over a single threaded
RNG, so it goes in at the foundation.

### 2. The feature model is extended ADDITIVELY, without a schema-version bump

`MapFeature` gains new kinds (`polygon`, `door`, `light`, `water`, `text`, `prop`) and an optional flat
`props` record. The extension is deliberately additive and does **not** bump `MAP_STATE_SCHEMA_VERSION`,
because cloud-backup restore gates on exact `schemaVersion` equality (`coreStore.ts`) — a bump would make
every existing backup unrestorable. The normalizer backfills a missing `props` to absent, so a v1 map
round-trips to identical JSON (and thus identical content hash).

### 3. Durable ops carry the DELTA, not the layer

New incremental commands (`map.add-features` / `map.update-features` / `map.remove-features`) append ops
that carry only the changed features. `map.generate` records `{generatorId, generatorVersion, seed,
params}` — not the geometry — so a generation that produces 12,000 features is a ~200-byte op that a
replaying device re-runs deterministically. `generatorVersion` is recorded so a replay against a changed
algorithm is detected rather than silently divergent. This retires the pre-existing scaling failure where
every layer-metadata op serialized the entire layer content, now that generators routinely emit thousands
of features.

### 4. Undo/redo is local and non-durable

Core exports pure inverse builders (`buildMapInverse`); the editor keeps the stack app-side. Undo history
must never sync (a co-DM undoing your brush stroke from across the table is not a feature) and must never
enter the op log.

### 5. The renderer stays engine-free (ADR-014 upheld), with viewport culling

We do **not** add a pixel engine. `MapCanvas` remains the shared engine-free SVG + DOM renderer, which
keeps hit-testing and the accessibility tree free — the properties that make the WCAG 2.5.7 keyboard
drag-alternatives and the roving-tabindex canvas contract achievable at all. Density is handled by
viewport culling and by the generators capping their own output. A canvas-2d "bake" layer for dense
static content (terrain/biome fills) under the interactive SVG remains available as a future optimization
if a specific map exceeds the culled SVG budget; it would not change the vector model and so needs no
further ADR. This upholds ADR-014's processing/display decoupling rather than superseding it.

### 6. Ship Universal VTT (`.dd2vtt`) export

Walls, doors, and lights are auto-derived from floor geometry (`deriveAll` — the boundary of the
floor-polygon union is the wall set, nearly free in a vector model and a hard vision problem in a raster
one). That output maps almost 1:1 onto the UVTT schema, so one exporter (`exportUvtt`) targets Foundry,
Fantasy Grounds, Arkenforge, MapTool, and Above VTT at once. Coordinates convert from normalized to grid
squares (`square = normalized × mapSizeInSquares`). Maps made here are not trapped here.

### 7. Editor IA: the professional creative-app layout

The editor adopts the layout every serious editor converges on, with an explicit rule for where each
parameter lives: a **tool-options bar** for verb parameters (what the next stroke does; persists per
tool), a **right-dock Inspector** for noun parameters (the selected object/layer; empty selection shows
map/scene properties), **modals only** for confirms/import/export, and the **canvas HUD** for spatial
parameters only. The tool rail is organized as Foundry organizes scene controls — layer groups that
expand sub-tool columns — and **generation is a tool that previews onto the canvas**, not a modal or a
separate tab. A command palette (`⌘K`) and single-key shortcuts absorb unbounded capability without
growing the chrome, and teach the keymap passively by showing each shortcut.

## Consequences

- **Positive:** a broad, deterministic, sync-safe generation suite; VTT interoperability; an editor that
  scales to dozens of tools and hundreds of knobs without overwhelming a novice; a renderer whose
  a11y/hit-testing stay free; op-log growth decoupled from generated content size.
- **Negative / accepted:** the SVG renderer has a density ceiling (mitigated by culling + output caps, not
  eliminated); some paint operations are vector-shaped rather than raster (Fill is per-region, Erase
  removes whole features); a river vs lake is distinguished by style token, not point count. `props` is a
  flat primitive record by design, not an open object graph, to keep it serializable and unable to smuggle
  arbitrary payloads into durable state.
- **Follow-up:** the canvas-2d bake layer if a real map exceeds the culled SVG budget; a graph view of a
  dungeon's room graph; live-drag sea-level as an `applies: 'immediate'` generation knob once the renderer
  can re-threshold without a full re-run.
