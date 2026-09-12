# RC-CAN-3.5 run journal

## Implementation

- Headroom tools were unavailable; validation uses native, uncompressed command output.
- Tab uses the core's metadata reading order in the DOM. Explicit frame stacking indices preserve
  paint order. Stale/duplicate metadata IDs are filtered and newly mounted tiles remain reachable.
- Arrows choose the nearest tile centre in the requested half-plane, with metadata order breaking
  ties. Space selects move mode; selected edit tiles nudge, with Shift+arrows retaining resize.
- Enter selects and focuses the first content control, or the named content region for static tiles.
  Escape returns to the frame. Widget controls and text inputs retain their own key handling.
- A activates the host's translated Add toggle from an editing canvas, including an empty board.
  This retains each host's panel state and focus-return behavior. Delete uses host-owned undoable
  removal; a removed focused frame hands focus to a surviving frame or the empty canvas.
- Added frame keyboard descriptions and registered separate Enter, Space and A shortcuts.
- Required adjacent integration: TileActionMenu's Move/Resize previously synthesized Enter. Changed
  those two calls to Space (and expanded the helper's key union) to preserve frame focus now that
  Enter enters content. Its existing menu regression test exposed and verifies this dependency.
- Companion tests cover nearest-neighbour geometry and ties, a pointer-free three-note workflow with
  axe, and real core pin/dock/group/z metadata followed through actual Tab presses.
- No agents, dispatcher mutations, push or promotion.

## Validation

- App suite: 123 files / 1283 tests passed. The script's `--` argument caused a full app run rather
  than only the three requested files. After adding the tie case and frame descriptions, explicitly
  scoped Vitest: 3 files / 78 tests passed.
- App TypeScript and ESLint over changed source/tests: exit 0.
- Quality gates: 6 passed. The initial file-size failure (816 lines) was fixed by replacing obsolete
  canvas overview prose with a concise current overview; canvas is now 797 lines.
- Canvas browser suite plus three-tile axe workflow: 82 passed on desktop and mobile, exit 0.
  Initial workflow locator errors were corrected against the rendered accessible names. Spatial
  assertions now derive tile positions instead of assuming metadata order equals insertion order.
  The menu Move focus regression was fixed by the Space integration described above.
- Final keyboard spec (three-tile axe workflow plus metadata Tab order): 4/4 passed across desktop
  and mobile, exit 0. `format:check:changed --base loop/rc` and `git diff --check`: clean.
- Operator retains full repository gates and independent review; no full-app browser suite or build
  is claimed here.
