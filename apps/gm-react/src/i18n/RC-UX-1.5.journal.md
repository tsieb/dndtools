# RC-UX-1.5 run journal

- Scope: DEV pseudo catalog, automatic locale discovery, empty French scaffold, responsive coverage and production exclusion. No dispatcher mutations or other agents.
- Catalogs are discovered by filename. The Node translation CLI discovers the same files without importing Vite runtime code. Pseudo catalog lives outside the production glob and is imported behind DEV.
- Generator preserves ICU argument syntax and expands literal segments by 40% rounded up, with accented text and outer brackets.
- Added generation drift, formatting and scaffold tests; added eight-route responsive case for both Playwright profiles.

## Validation and findings

- Initial browser attempts exposed test setup mistakes: the route heading belongs to the shell (outside main) and may be visually hidden. The final case uses the shared route helper and asserts the heading is pseudo-localized before measuring.
- Mobile `/scenes` exposed a 13px overflow from sentence-length unbreakable padding. Generator now breaks padding into short groups while retaining the same 40% character expansion; no layout files changed.
- Targeted eight-route case: desktop-chromium and mobile-chromium both passed (2 tests, 6.3s).
- App i18n tests: 3 files / 38 tests passed, including exact generated-catalog drift, ICU nesting, expansion, French fallback, and DEV loading.
- Translation tooling tests: 8 passed. CLI exported French as 0/5250 keys and English as 5250 keys.
- App typecheck passed. ESLint and formatting passed for changed source files.
- Final app production build passed; checker confirmed pseudo locale, runtime seam and gallery absent from 86 JS assets. Synthetic bundles containing either the locale identifier or pseudo Save text were both rejected.
- Full responsive spec: 82 tests passed across desktop-chromium and mobile-chromium (1.6m).
- Final test review added an explicit translated-body wait, so the shell heading alone cannot satisfy lazy-route readiness. Final targeted rerun passed on both profiles (2 tests, 6.7s).
