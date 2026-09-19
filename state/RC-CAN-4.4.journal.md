# RC-CAN-4.4 — Scene templates picker with thumbnails

Base: `07305d5d` (loop/rc tip at task start). RC-CAN-4.3 (`ded275a1`) is NOT on this base; its palette
"Apply template" row is expected to target this story's `scene.apply-template`.

## Log

- Surveyed core: `command-center.apply-preset` only targets the home scene; `scene.instantiate-template`
  creates a NEW scene. No command instantiates a layout into an arbitrary existing scene → add
  `scene.apply-template`.
- Core (`S` story): `scene.apply-template` (`scene-meta.ts` handler, DM-only). Source is one of
  `builtin` (code-defined, `BUILTIN_SCENE_TEMPLATES` in `command-center-state.ts`), `preset` (a saved
  Command Center preset) or `scene` (a scene with `templateMeta.isTemplate`). All three reduce to the
  preset snapshot shape and go through `instantiateLayoutSnapshot`, extracted from the preset
  materializer in `command-center.ts` (apply-preset / restore-auto-save behaviour unchanged).
  APPENDS: an empty scene gets the layout as authored + the template's background; a non-empty scene
  keeps its tiles and background and the template lands one gutter below, z/focus order lifted.
  Refuses a template that would place nothing (`template-empty`), a non-template scene source, a
  missing preset/scene; new rejection codes `template-not-found`, `template-empty`.
- Companion paths used (manifest `companion_paths`): `schemas/commands.ts`, `commands/types.ts`,
  `commands/dispatch.ts`, `core/src/index.ts`, `i18n/messages/{en,es}.ts`, new e2e + unit test.
- UI: `app/canvas/TemplatePicker.tsx` (Dialog desktop / Sheet phone). Built-ins carry a generated
  schematic miniature (`data-preview="generated"`); saved presets + template scenes carry a miniature
  drawn live from their stored layouts (`data-preview="live"`). Entry points: empty-state row on
  `/scene/:id` and `/board` (the canvas's own empty message is `pointer-events:none`, so the offer is a
  row above the canvas), and the gallery's "Start from a template" header (only while empty) via the new
  `onTemplates` prop. After apply the host enters edit mode; Board also snapshots a safe point.
- Palette moment: NOT wired here. RC-CAN-4.3 (`ded275a1`, not yet on this base) owns
  `CommandPalette.tsx` / `command-actions.ts` and its commit message says "Apply template on a plain
  scene waits for RC-CAN-4.4's scene.apply-template" — the follow-up is for whichever lands second to
  point that row at `scene.apply-template`. Not crossing into 4.3's owned files to avoid a conflict.

## Verification (this worktree, base `07305d5d`)

- `packages/core` vitest: 279 files / 4886 tests passed (new `tests/scene-apply-template.test.ts`: 8).
- App vitest (`vitest.app.config.ts`): 138 files / 1516 tests passed.
- `tsc --noEmit` core + gm-react: clean. `pnpm lint`: exit 0 (emphasis counts under baseline; the
  Board/SceneEditor emphasis warnings predate this change). Prettier `--check` on every changed file:
  clean (`format:check:changed --base origin/loop/rc` said "no supported files changed" pre-commit —
  not treated as evidence).
- e2e `scene-templates.spec.ts`: 4/4 (desktop + mobile) — applies Combat scene to a fresh scene from
  the empty state (5 tiles, op `scene.apply-template`, survives reload) and a saved preset from the
  gallery header.
- Regression e2e: scene-templates, canvas, canvas-keyboard, canvas-arrange, widget-builder,
  note-depth, command-palette, flow-layout, responsive, a11y-axe-gate → 320 passed (5.5m).
- Screenshots (desktop dialog, phone sheet, applied scene) checked by eye.

## Retry — quality gate (attempt `f08ab310`, head `55edc35d`)

- Failure: `pnpm gates` → `[file-size-exceeded] AddWidgetGallery.tsx is 806 lines, over the 800-line
hard limit (RC-STB-2.7)`. Base was 786; the header entry added ~20 lines.
- Fix: the gallery now takes a generic `startAction?: React.ReactNode` header slot (+4 lines, 790) and
  exports its existing `CreateEntry`. The entry itself, `TemplateStartEntry`, and its EN/ES copy moved
  to `TemplatePicker.tsx`; Board and SceneEditor pass it into `startAction`. Behaviour and test ids
  unchanged. Line counts: gallery 790, TemplatePicker 540, Board 763, sceneEditor/index 736.
- Re-verified: `pnpm gates` exit 0 (quality-gate + docs checks passed); `pnpm lint` exit 0; gm-react
  `tsc --noEmit` clean; app vitest 138 files / 1521 tests passed; e2e scene-templates, canvas,
  widget-builder, note-depth, canvas-keyboard → 112 passed (desktop + mobile).
