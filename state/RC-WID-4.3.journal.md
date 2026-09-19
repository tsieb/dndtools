# RC-WID-4.3 run journal — widget bindings inspector

- Started from `07305d5d` on the task branch; tree clean.
- Scope: the three owned files (`BindingInspector.tsx` new, `Inspector.tsx` mount, `shared.ts` type),
  plus two boundary crossings the story cannot avoid: additive EN/ES catalog keys
  (`sceneEditor.binding.*`, required by the `i18n/no-literal-jsx-text` gate) and a new e2e spec
  `tests/e2e/binding-inspector.spec.ts` (the acceptance is an e2e). No other file changed.
- The Inspector has no tabs today, so "Binding tab" is mounted as a `Section` like its siblings,
  after Settings. It renders only for a widget whose definition declares a binding slot (the same
  `bindingSlot` rule `TileBindDialog` uses), so notes, dice and timers are unchanged.
- Search runs over the DM's own actor-filtered reads (maps, characters, content items), each result
  with its visibility chip, so DM-only NPCs are offered to the DM and nothing a raw read would add.
- Mode writes the binding's `mode`; `requiredCapability` follows it (read/observe → viewer, operate →
  operator, manage → manager). The core's `scene.configure-widget` stays the judge of who may bind.
- Resolver state is computed twice with the core's own resolver against the preview's data
  environment (`previewDataEnvironment`): as the DM, and as the core's generic zero-grant preview
  player (`PREVIEW_PLAYER_ACTOR_ID`, the actor the "Any player" preview reads as). Map bindings get
  the map read, as the overlay does; `degraded` comes from the DM's `getSceneForActor` payload (host
  permissions are audience-independent). A missing binding shows `unbound` even for an optional slot
  (the resolver would say `available`), with copy saying the widget draws without it.
- Fail-closed copy (widget brief §3): a player's `hidden` row says players are never told whether the
  target still exists or has a conflict; only the DM's panel names the reason (DM only / shared with
  specific players / field DM only).
- Finding: every demo-seed PC is `shared` with its owner, so to the generic player a bound PC is
  `hidden (not-shared)`. That is correct fail-closed behaviour and the second e2e asserts it.
- Validation: app `tsc --noEmit` exit 0; spec typechecked standalone exit 0; ESLint on sceneEditor/,
  the catalogs and the spec exit 0; raw-style count, boundary and emphasis lints pass (no baseline
  raised); Vitest i18n + sceneEditor 38/38. E2E: new spec 4/4 plus player-preview + note-depth, 12/12
  on desktop-chromium and mobile-chromium; regression sweep canvas, widget-builder, flow-layout,
  responsive 218/218 on both profiles. Not run: the full suite (the operator owns the gates).

## Operator repair — 2026-09-19

- Moved the mistakenly source-located journal into the explicitly allowed `state/` path.
- The existing implementation, catalogs, and acceptance spec are preserved per the operator brief.
- Dispatch Headroom tools are unavailable in this session; validation uses native exact command output.
- Next: commit the relocation, rebase onto current local `loop/rc`, and rerun validation.

## Report — operator repair completed

- Relocation committed, then both task commits rebased cleanly onto local `loop/rc`
  `c8a2c291463c39e0f1deeff83cc64027ce3bcf59`; rebased implementation is `8229deb3`.
- No journal remains under `apps/gm-react/src/`. Candidate paths are the three owned sources,
  EN/ES catalogs, the acceptance spec, and this allowed state journal. Roadmap §0.2 grants
  catalogs and e2e specs automatically; these are not outstanding ownership exceptions.
- Fresh post-rebase gates (all exit 0): `pnpm typecheck`, `pnpm lint`, `pnpm gates`,
  `pnpm build`, `pnpm feature-audit`, and `pnpm format:fix:changed --base loop/rc`.
  Formatting changed no files. Lint reports warnings but no errors; build reports bundle-size
  warnings. Feature audit: 0 stale limits and 0/23 screens need wiring review.
- `pnpm test:app`: 140 files, 1,527 tests passed. Focused i18n/sceneEditor tests: 38 passed.
- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/binding-inspector.spec.ts tests/e2e/player-preview.spec.ts tests/e2e/note-depth.spec.ts --project=desktop-chromium --project=mobile-chromium`:
  12 passed, including the hidden-NPC acceptance on both profiles. The assertion checks
  `data-state=hidden` in the inspector and `data-tone=hidden` in the actual player preview.
- `git diff --check loop/rc...HEAD` passed. Only this report was added after the code gates;
  final formatting and whitespace verification run before committing it.
- No implementation change was needed after the rebase. No push, promotion, new loop, or
  dispatcher control-state edit performed. Central operator gates and independent review remain
  the next integration steps.
