# Localization

Architecture: [ADR-032](../adr/032-internationalization-architecture.md). This is the operational
reference for the catalogs and the community translation round trip.

## 1. Catalogs

- `apps/gm-react/src/i18n/messages/en.ts` is the source of truth and the compile-time key space
  (`MessageKey = keyof typeof en`). Keys are `<area>.<subject>.<role>`; values use the ICU subset
  (`{name}`, `plural`, `select`, `number`, `date`, `time`) implemented in `src/i18n/format.ts`.
- Every other locale (`messages/<code>.ts`) is `Partial<Record<MessageKey, string>>`; an
  untranslated key renders its English source, never a blank or a bare identifier.
  `catalogCoverage(locale)` reports the translated share and Settings › Language shows it.
- `t()` from `useI18n()` is the only path a string reaches the user by; the
  `local/no-literal-jsx-text` ESLint rule ratchets an allow-list of files with remaining literals.
- Spanish is held at or above 95% of the English key space by `src/i18n/index.test.ts`; a migration
  adds its Spanish entry in the same commit.
- Locale is a device preference (`localStorage`, mirrored onto `<html lang dir>`), not vault state.
  The core never returns prose; rejections carry machine codes the app maps to keys. Distance units
  come from the active System Package, not the locale.

## 2. Export and import

`scripts/i18n-catalog.ts` converts between the TypeScript catalogs and the flat monolingual JSON
that Weblate and Crowdin ingest, so a translator never touches TypeScript.

```
tsx scripts/i18n-catalog.ts export [--dir i18n-export] [--locale es]
tsx scripts/i18n-catalog.ts import --locale es [--dir i18n-export]
```

- **Export** writes `<dir>/en.json` (every key, the source string) and one `<dir>/<locale>.json`
  per locale containing only the keys it has translated.
- **Import** regenerates `messages/<locale>.ts` from a platform export: a key `en.ts` no longer
  declares is a hard error; a key the upload omits is dropped; key order follows `en.ts` so the
  diff stays reviewable. The generated file carries a banner pointing here; hand edits are
  overwritten by the next import.
- New locale: add it to `SUPPORTED_LOCALES` in `src/i18n/index.tsx` and the `loadCatalog` import
  list, then run `export --locale <code>` once to seed the platform.

`tests/unit/i18n-catalog.test.ts` (`pnpm test:tooling`) round-trips the real catalogs and asserts an
unknown key is rejected and a dropped key does not survive.

## 3. Platform setup

Create a project with one monolingual JSON component per locale, upload `en.json` as the base
file and each `<locale>.json` as that locale's existing state, let translators work in the UI, then
periodically download and run `import`, sending the regenerated module through the normal PR gates
like any other code change.
