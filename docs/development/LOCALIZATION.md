# Localization

Scope: the primary React GM app (`apps/gm-react`, `@dndtools/gm-react`). Covers the message-key
catalog architecture (ADR-032 — RC-UX-1.1), and the community translation workflow this doc adds
(RC-UX-1.4): how a locale's catalog leaves the repo for a translation platform and comes back.

## 1) Catalog architecture (context)

- `apps/gm-react/src/i18n/messages/en.ts` is the source of truth and the compile-time key space
  (`MessageKey = keyof typeof en`). Every user-visible string is a flat key, `<area>.<subject>.<role>`.
- Every other locale — `apps/gm-react/src/i18n/messages/<code>.ts` — is `Partial<Record<MessageKey, string>>`.
  An untranslated key renders its English source rather than a blank or a bare identifier
  (`translate()` in `src/i18n/index.tsx`), so a partly translated locale degrades honestly.
- A locale's share of the key space translated is `catalogCoverage(locale)` (`src/i18n/index.tsx`);
  Settings › Language shows it as the status badge described in §3.

## 2) The export/import round trip

`scripts/i18n-catalog.ts` converts between the TypeScript catalogs above and the flat monolingual
JSON shape both **Weblate** and **Crowdin** ingest for a "JSON file" translation component, so a
community translator works entirely on the platform and never touches TypeScript or opens a PR.

```
tsx scripts/i18n-catalog.ts export [--dir i18n-export] [--locale es]
tsx scripts/i18n-catalog.ts import --locale es [--dir i18n-export]
```

- **Export** writes `<dir>/en.json` (every key, English value — the source string translators
  translate from) and one `<dir>/<locale>.json` per translatable locale, containing only the keys
  that locale has already translated. Uploading `en.json` as the platform's source/base file and
  `<locale>.json` as that locale's existing translation state seeds a new Weblate/Crowdin project
  (or resets one) from the repo.
- **Import** takes a locale's exported JSON back from the platform (after translators have edited
  it there) and regenerates `apps/gm-react/src/i18n/messages/<locale>.ts`:
  - a key the upload has that `en.ts` no longer declares is a **hard error** — a removed string
    never leaks back into the app through a stale translation platform export;
  - a key `en.ts` still declares but the upload omits is **dropped** from the generated file — a
    translator (or the platform) deleting a row deletes the translation, the catalog does not
    silently keep the last-known value;
  - the generated file keeps `en.ts`'s key ORDER, so a routine sync's diff stays reviewable instead
    of reordering every line.
- The generated `<locale>.ts` carries a banner pointing back at this doc: hand-editing it is
  overwritten by the next import, so a fix belongs in the platform (or in `en.ts` if the source
  string itself is wrong).
- Adding a new locale: add it to `SUPPORTED_LOCALES` in `src/i18n/index.tsx` (RC-UX-1.1's file) and
  the dynamic `loadCatalog` import list, then run `export --locale <code>` once to seed an empty
  starting point for the platform.

Round-trip coverage lives in `tests/unit/i18n-catalog.test.ts` (`pnpm test:tooling`): it exercises
the pure export/build functions with the real `en`/`es` catalogs and asserts a key set survives
export → import unchanged, that an unknown key is rejected, and that a dropped key does not survive.

## 3) Locale status in Settings

Settings › Language (`apps/gm-react/src/screens/settings/Language.tsx`) shows each locale's
`catalogCoverage()` next to its name (e.g. "Español · 100% translated"), so a DM picking a
community-maintained locale can see up front how complete it is rather than discovering gaps one
English fallback string at a time.

## 4) Suggested platform setup (Weblate or Crowdin)

1. Create a project with one JSON-file component per locale, "monolingual" mode (source strings
   come from a separate base file, not embedded per-locale).
2. Upload `i18n-export/en.json` as the base/source file.
3. Upload each `i18n-export/<locale>.json` as that locale's existing translations, if any.
4. Translators work in the platform UI. Periodically (or via the platform's export webhook/API),
   download the updated `<locale>.json` and run the `import` command above, then send the
   regenerated `messages/<locale>.ts` through the normal PR/gate flow like any other code change —
   the import is a generator, not a bypass of review or `pnpm typecheck`.
