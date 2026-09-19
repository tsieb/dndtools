# CI visual repair, 2026-09-19

Base: `16dd3e7ef62ae2d8dbd8f4eff97d6a02a645044c` (`loop/rc`).
Branch: `external/codex/ci-visual-repair-0919`.

The published candidate repeats stale visual baselines. The preceding CI run
35465939818 failed 18 board/scene comparisons. The current candidate additionally
changes Settings > Appearance through RC-DSN-1.2, which adds Scholar, Dungeon,
and System choices and descriptive text. This moves the following controls.

A fresh locked dependency install and full pinned-container reproduction on the
base produced 27 failures and 108 passes: board, scene editor, and settings,
across tavern/parchment/high-contrast and desktop/rail/phone. The visual test
configuration still covers those three themes; this repair does not expand it.

The 18 board/scene PNGs reuse existing recovery commit
`cdbca165abbb64171bde98428eb79a6f1fa6e173`. That repair captures the intentional
RC-ENG-8.2 map and character bindings (Ruined Keep and Brother Calloway), replacing
missing-map/unbound-character fixtures. Nine Settings PNGs were regenerated with
`CI=1 apps/gm-react/tests/visual/run-in-container.sh -g '/settings' --update-snapshots=changed --workers=2 --reporter=line`.
Reviewed actual/diff images and responsive Settings layouts against the source
changes. No runtime source, test assertion, screenshot tolerance or CI protection
changes are included.

Validation:

- Full pinned-container comparison with `CI=1`, `--update-snapshots=none`,
  `--workers=2`, and `--reporter=line`: 135 passed, exit 0, no failures or retries.
- PNG budget: 135 files, 12880.9 KiB / 32768.0 KiB, exit 0.
- `git diff --check`: passed. Only 27 PNGs and this journal changed.
- The dispatcher now runs this pinned visual comparison as an integration and
  promotion gate. Its full regression suite passed (153 tests, three skipped).

This commit still requires normal dispatcher review/integration and a fresh
GitHub CI run. No remote publication or main promotion is claimed.
