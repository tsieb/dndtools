# RC-ENG-8.14 run journal

## Scope

D-1 of the RC-ENG-8.3 audit: an image import ended with "Image recorded", but the open editor
showed no image and the "isn't on this device" chip until the map was reopened. Acceptance: the
Atlas import spec asserts the image renders in the open editor straight after Done, with no
missing-image chip, on both profiles. No agents, dispatcher mutations, push or promotion.

## Cause

`useImportMap.commit()` dispatched `map.import-asset` first and called `putAssetBytes` only after
it was accepted. The accepted command put the new asset id into state, `useMapEditorShell` picked
it as the raster, and `useAssetObjectUrl` resolved it once against an empty store, missed, and
never retried.

## Fix

- `src/app/map/useImportMap.ts`: bytes are stored BEFORE the dispatch. The store is
  content-addressed (`assetId(hashAssetBytes(bytes))`, the same id the core computes), the same
  order the audio import uses. A byte-store failure is still non-fatal and is reported on the
  result step as before. If the commit is refused or throws, bytes this import newly wrote are
  deleted (best-effort). Bytes that were already present (`hasAssetBytes` before the write) are
  never deleted, because another map or library entry may use them.
- `src/platform/assetUrl.ts`: unchanged. With the order fixed, the first resolution hits.

## Evidence

- `tests/e2e/atlas.spec.ts` (raster import wizard test): after Done, the dialog closes, the
  editor canvas (`role=application`) holds exactly one `<image href="blob:…">` whose blob size
  equals the fixture's size, and the missing-image chip is absent.
- Before the fix (`HEAD` useImportMap.ts, new spec): FAILED on desktop-chromium and
  mobile-chromium, `expect(raster).toHaveCount(1)` received 0.
- After the fix: whole `atlas.spec.ts`, both profiles, 23 passed, 1 skipped (the spec's existing
  conditional skip).
- `pnpm run typecheck` clean; eslint and prettier clean on both changed files;
  `src/app/importHub/registry.test.ts` 2 passed.
