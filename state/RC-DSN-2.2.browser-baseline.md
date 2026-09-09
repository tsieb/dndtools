# RC-DSN-2.2 browser acceptance baseline

Historical comparison at `8c11737f`. The subsequent gate-repair changes address these
inherited failures; see the latest section of `RC-DSN-2.2.journal.md` for validation.

The implementation is commit `064d3e123208c146c2e12be0898db89148e55f73`.
Its parent is `75c76bd1` (before any missing-primitives changes).

The central full browser run reported **8 failed, 11 skipped, 1,041 passed**.
Typecheck, lint, app tests, build and requirements audit passed in that same gate.
The original browser diagnostic is attempt
`e2546ec3-4056-4e58-be87-4e7570b0bca4/output.log`.

## Reproduction

Run the following from either revision, with an unused port:

```sh
DNDTOOLS_E2E_PORT=15475 pnpm --filter @dndtools/gm-react exec playwright test \
  tests/e2e/android-quick-map.spec.ts \
  tests/e2e/equipment.spec.ts \
  tests/e2e/responsive.spec.ts \
  tests/e2e/combat-tile.spec.ts \
  tests/e2e/a11y-axe-gate.spec.ts \
  --grep 'supports live-session edits|authority: the PC owner|Android routes consume|tapping the hit points|a11y axe gate: /board$' \
  --workers=2
```

The parent was checked out in `/tmp/rc-dsn-baseline-454e7d42`, with dependency
symlinks pointing to the existing installation. Its Vite development-server
allow-list was extended to that dependency directory so the exact same font
assets load. No product or test source was changed in the parent checkout.
It used port 15476. The first parent run without the allow-list adjustment is
not used as the final comparison because Vite refused the symlinked fonts.

| Check                                        | Task commit | Parent commit | Original failure                                                                                 |
| -------------------------------------------- | ----------- | ------------- | ------------------------------------------------------------------------------------------------ |
| Quick-map live edits, desktop and mobile     | Fail        | Fail          | `android-quick-map.spec.ts:231`: token displacement remains 0; expected greater than 0.02        |
| Equipment owner preview, desktop and mobile  | Fail        | Fail          | `equipment.spec.ts:252`: expected one Item field, found none                                     |
| Board axe, mobile                            | Fail        | Fail          | `a11y-axe-gate.spec.ts:169`: target-size violation on Hide combat overlay                        |
| Combat HP keypad, mobile                     | Fail        | Fail          | `combat-tile.spec.ts:117`: another element intercepts the click until timeout                    |
| Android safe-area bounds, desktop and mobile | Pass        | Pass          | The full gate reported four undersized map controls; this does not reproduce in the targeted run |
| Board axe, desktop                           | Pass        | Pass          | No failure                                                                                       |
| Compact combat tile, desktop                 | Skipped     | Skipped       | Existing phone-only test                                                                         |

Both targeted runs finish with **6 failed, 1 skipped, 3 passed**. Logs retained
locally at `/tmp/rc-dsn-repro.log` and `/tmp/rc-dsn-baseline-verified.log`.

The equipment expectation also conflicts with the existing explicit read-only
preview condition at `apps/gm-react/src/screens/player/index.tsx:160`:
`canManageInventory: (isDm || isOwner) && !readOnlyPreview`.
That code predates this task and was not changed by it.

## Disposition

Browser acceptance is **not passed**. The reproducible failures predate the task;
the two remaining full-suite failures need suite-order investigation. No test
assertions were relaxed, tests skipped, or unrelated product behavior changed to
make the missing-primitives task appear green. The central operator has the
baseline evidence to triage the broad gate separately. The eleven primitives,
screen integrations, tests and docs remain in `064d3e12`.
