# RC-ENG-8.4 run journal

## Scope

Emphasis and display-face lint. Two design rules become checks in `pnpm lint`: the display face
(Cinzel) below 24px, and more than one accent-filled primary inside one region. Reads inline
styles and DS props, warns against a counted baseline that may only shrink, names file and line.
Acceptance: a fixture test per rule; the baseline committed; the lint wired into `pnpm lint`.
Owned: `scripts/emphasis-lint.ts`, `scripts/emphasis-baseline.json`. The acceptance also needs
`package.json` (the `lint` wiring) and `tests/unit/emphasis-lint.test.ts` (the fixture tests).
No agents, dispatcher mutations, push or promotion.

## Findings from the code

- Cinzel is `--font-display` (typography.css: "switch to --font-display at --text-xl (24px)").
  Screens set it through `font:` shorthands with `var(--font-display)` or screen-kit's `T.disp`,
  and DS files through `fontFamily` + `fontSize`.
- Solid accent fills: DS `Button variant="primary"`, DS `SegmentedControl` (active segment), and
  inline `background: T.acc` / `var(--color-accent)`. `Button`/`IconButton variant="accent"` and
  screen-kit `Seg` are the subtle tint and are not counted.
- Session in Standby: `Seg` in SessionHeader (tint), Go live in StandbyCard (Lifecycle.tsx),
  Build encounter in CombatPanel (CombatTracker.tsx). The three are separate components, so the
  lint resolves component composition across imports; screens mount via `lazy()`.
- Inline `background: T.acc` is mostly nav indicators and progress bars, so inline fills only
  count on `button`/`a`/interactive roles.
- `pnpm lint` runs in ci.yml, release.yml, promote-production.yml and ci-local.ts.

## Progress

- [x] scripts/emphasis-lint.ts written (TypeScript AST, no rendering; ~2.8s over the app).
- [x] Baseline bootstrapped and reviewed: display-face-below-24px 84, multiple-accent-primaries 61
      (34 regions). The Session screen is flagged (StandbyCard's Go live + CombatPanel's Build
      encounter + four more composed panels). Two `<a data-skip-link>` skip links were false
      positives and are now exempt; boundary labels name their role.
- [x] Fixture tests (tests/unit/emphasis-lint.test.ts): 13 passing, 3 display-face, 6 emphasis,
      4 baseline (including the real tree against the committed baseline).
- [x] `lint:emphasis` script + `pnpm lint` wiring (after lint:boundary).
- [x] Gates (local, 2026-09-12): eslint clean on the script and test; prettier applied; full
      `pnpm lint` exit 0 (emphasis step at baseline, 84 / 61); `pnpm test:tooling` 25 files,
      175 tests passed; strict `tsc --noEmit` (bundler resolution, cloud-fns' @types/node)
      exit 0 for the script and test. No tsconfig covers `scripts/` or `tests/unit/`, so
      `pnpm typecheck` never compiles them.
- [x] Commit on the task branch.

## Decisions

- Baseline is per rule per file; a finding weighs 1 (display face) or a region's surplus
  primaries. Shrinking never fails, because the fixing stories (CAN-5.5, SES-6.2, POL) don't own
  the baseline; `--write` refuses to raise.
- Screen-kit `Seg` isn't counted (it's a tint). The story counts "the Standby segment" as one of
  three; adding `Seg` would put every Settings group in scope. One line in PRIMARY_PROPS if the
  owner wants it.

## Gotchas

- The Write tool stored the `UNKNOWN` sentinel as a literal NUL byte, which makes git treat the
  file as binary. Use the `'\u0000'` escape.

## Review correction (2026-09-12)

- Read the original independent review journal and probes for candidate 71bfd0be in artifact
  7477a5c90eb8452bb450ad66140c007c. Headroom tools are unavailable in this run.
- Fixed DS Button inline accent fills, ordered font shorthand/longhand overrides, and whitespace
  around shorthand line-height slashes. Added 12 regression cases including the real Button
  source, positive controls, reverse declaration order, and fixed-size/family exemptions.
- Focused fixtures: 25 passed. Reran the original external probes: all three previously missed
  violations now report file/line; fixed_font stays quiet; both positive controls still report.
- The real-tree baseline test passes without raising or changing the committed baseline.
- Validation complete: full `pnpm lint` exit 0 (baseline remains 84 / 61); full tooling suite
  exit 0 (25 files / 187 tests); strict standalone TypeScript check exit 0; Prettier and
  `git diff --check` pass. Original local logs: `/tmp/rc-eng-8.4-lint.log` and
  `/tmp/rc-eng-8.4-tooling.log`. Central operator gates and independent review remain external.
