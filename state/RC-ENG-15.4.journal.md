# RC-ENG-15.4 — Decision and release evidence

Base: `f168547c4` (task branch `dispatch/dndtools/16149e345ef82b716f55`, equal to `loop/rc`).
Owns: `docs/development/RC_CHECKLIST.md`, `docs/planning/IA_REVIEW.md`.

## Sources read

- RC_ROADMAP Epic ENG-15 and RC-ENG-7.3; IA_REVIEW; ADR-013 (amended 2026-10-24); RC_CHECKLIST.
- `git log` since `43e0ffaa5`: 15.1 ends at `f79675059`, 15.2 at `2c97e96f8`, 15.3 at `f168547c4`;
  `43e0ffaa5` merged into `loop/rc` by `bbbf3ce60`. Review commits `3d8d8e96a`, `2a9c1a81b`,
  `74efcfe28` are on main; `43e0ffaa5` and the story commits are not.
- Dispatcher `tasks.sqlite3`, read-only: 15.1–15.3 `succeeded`, integration heads as above, not
  published.

## Log

- 2026-10-25: `DNDTOOLS_E2E_PORT=5418 pnpm exec playwright test tests/e2e/primary-sections.spec.ts
tests/e2e/table-controls.spec.ts tests/e2e/route-compat.spec.ts --workers=3` (apps/gm-react,
  both profiles): 78 passed, exit 0.
- Playwright MCP browser unavailable (no `/opt/google/chrome`), so the four task checks ran as an
  uncommitted scratch spec (`tests/e2e/zz-eng154-tasks.spec.ts`, deleted) against a local-first
  `vite --port 5417` with the cloud variables blanked. Visible labels only; no `__rt` dispatch.
  - Find an NPC: pass on desktop 1440 and Pixel 5 (Characters › NPCs › Mira the Ferryman).
  - Pinned screen on phone: pass (Screens tab › chooser pin → `/screen/:id`; More lists the pin first).
  - Return from player preview: pass at 1280 and on the phone (back on `/characters`, focus on
    Table controls); **fail at 1440**: Exit preview lands on `#/`.
  - Find billing: pass (Settings › Subscription › Full comparison → `/upgrade`); palette `billing`
    finds nothing, `plans` finds Plans & cloud.
- Probe for the failure (12 runs, both profiles, 1600/1440/1280 × click/cold): `history.state` on
  `/play` has `previewFrom: "/"` after an in-app click at 1440/1600 and the right route after a
  cold load or at 1280. Code sites: `ViewAsControl.tsx` `previewFrom`, `Frame.tsx`
  `PreviewExitBanner`. Cause not established; not fixed (outside this story's paths).
- Docs: RC_CHECKLIST IA box filled (stays unchecked); IA_REVIEW status, acceptance rows, stale
  "not yet accepted" paragraph and a new task-check section. `pnpm gates`: docs check 470 links
  resolved; prettier clean on both files; `pnpm feature-audit` 0 stale; anchor slugs verified.

## Open

- The wide-tier preview-return defect needs an owning story (RC_ROADMAP is not in this claim).
- ENG-7.3 must re-run the three specs and four tasks on the tagged RC commit.
