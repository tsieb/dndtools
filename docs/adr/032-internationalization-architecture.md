# ADR-032: Internationalization Architecture

- Status: Accepted
- Date: 2026-09-04
- Deciders: Engineering
- Consulted: Product, Design, QA
- Supersedes: N/A
- Amends: N/A (new decision; the current i18n layer was never recorded in an ADR)

## Context

`apps/gm-react/src/i18n/index.tsx` localizes the app two ways at once. New code calls `t()`, but the
provider also installs a `MutationObserver` over `document.body` (`index.tsx:252-315`) that walks
every text node and a fixed attribute list, looks each rendered string up in the catalog by its
**English source text**, and rewrites it in place. That bridge exists because the catalog is keyed by
source string (`index.tsx:19-207`), so untouched legacy JSX can be translated without being migrated.

It works, and it is the wrong foundation for a release candidate:

- **Translation by source text has no identity.** "Show" is a button on a scene card and a verb in a
  filter menu; "End" is a session action and a range bound. One catalog entry has to serve both, so
  Spanish is forced into whichever reading collides least. Translators see no context and no screen.
- **The observer rewrites the DOM behind React.** Every added node, character-data change, and
  attribute mutation triggers a catalog lookup over the whole subtree. It needs two `WeakMap`s of
  "what did we render last" (`index.tsx:212-214`) purely to avoid mistaking its own Spanish output
  for a new English source on the next pass. That is a race with React's reconciler that we win by
  bookkeeping, on every screen, forever.
- **It cannot express grammar.** Interpolation is a `{name}` regex (`index.tsx:234-236`). Plurals are
  handled by writing two catalog entries and picking one in the caller — `'Pushed “{title}” to 1
player'` and `'…to {count} players'` (`index.tsx:102-103`) — which is exactly the pattern that
  breaks in languages with more than two plural categories.
- **There is no formatting layer.** `formatDate`/`formatNumber` exist on the context
  (`index.tsx:339-340`) but allocate a fresh `Intl` object per call, and there is no relative time,
  no list formatting, and no distance units, so numbers and dates reach the user as `String(value)`
  from the call site.
- **Nothing enforces coverage.** No lint stops a new hardcoded string; the ES catalog is ~145 entries
  against an app with sixteen workstreams of screens, and the only guard is a placeholder-consistency
  test (`index.test.ts:31-40`).

Roadmap gap G16 (`docs/planning/RC_ROADMAP.md:132`) names this; Epic UX-1 (`:1476-1491`) is the work.
UX-1.2 migrates every screen one decomposed directory at a time, which means the target architecture
has to be decided **before** the STB-2 splits finish, and `src/i18n/*` has a single owner during P1
(`:246`). This ADR is that decision.

## Decision

### 1. Message keys, in a typed catalog module per locale

Strings are addressed by a stable dotted key, never by their English text:

```
apps/gm-react/src/i18n/messages/en.ts   // source of truth, exhaustive
apps/gm-react/src/i18n/messages/es.ts   // Partial<Catalog>; missing keys fall back to en
```

```ts
// en.ts
export const en = {
	'session.goLive.label': 'Go live',
	'session.goLive.blocked.needsScene':
		'Create a scene first — a live session needs an active scene.',
	'sceneCards.pushed': 'Pushed “{title}” to {count, plural, one {# player} other {# players}}',
} as const;
export type MessageKey = keyof typeof en;
```

Key shape is `<area>.<subject>.<role>`: the area matches the owning screen directory produced by the
STB-2 splits (`session`, `sceneCards`, `settings`, `map`, `ds` for shared design-system strings), so
a screen's keys move with the screen and a directory owner can see their whole surface in one grep.

TypeScript modules, not JSON: `MessageKey` is derived from `en.ts`, so `t()` rejects a typo at
compile time and a deleted key fails `pnpm typecheck` at every call site. Catalogs are `import()`ed
lazily per locale, which keeps non-active locales out of the initial chunk and needs no `fetch` — a
requirement under Electron's `file://` origin and the Android shell, where a JSON asset fetch is a
CSP and packaging problem rather than a build one.

Every key exists in `en.ts`. A locale file is a `Partial`, and an absent key renders the English
message; a key absent from `en.ts` too renders the key itself and logs once. Tests and `pnpm dev`
treat a missing `en` key as a thrown error, so the fallback never silently ships.

### 2. `t()` is the only path; the DOM bridge is deleted

`useRenderedLocalization` and its two `WeakMap`s go away with UX-1.1. After that, a string reaches
the user only by passing through `t('key', values)` from `useI18n()`, or through `formatX` (§4). No
component mutates rendered text, and the observer no longer competes with React.

Deleting the bridge is what makes the migration visible instead of invisible: a screen that has not
been migrated shows English until UX-1.2 reaches it, and the lint rule in §5 counts exactly how much
is left. That is the intended trade — an honest, measurable gap beats a bridge that half-translates
every screen and hides which ones were never done.

### 3. ICU message syntax, plural/select subset, backed by `Intl.PluralRules`

Catalog values use ICU message syntax. We implement the subset the app needs in
`apps/gm-react/src/i18n/format.ts` rather than taking a full ICU runtime dependency:

- `{name}` — simple argument.
- `{count, plural, one {# player} other {# players}}` — categories resolved by
  `new Intl.PluralRules(locale).select(count)`, `#` substituting the formatted number. `=0`/`=1`
  exact matches supported; `other` is mandatory.
- `{role, select, dm {…} player {…} other {…}}` — for gendered/role-varying copy.
- `{value, number}`, `{value, date, short}`, `{value, time, short}` — delegate to §4's formatters.

One nesting level is supported and no more; anything needing deeper nesting is a sign the sentence
should be two keys. Parsing happens once per message and is memoized per `(locale, key)`.

The syntax matters beyond correctness: ICU is what Weblate, Crowdin, and Pontoon already understand,
so §7's workflow needs no bespoke format and translators get plural categories their tool knows how
to present. A hand-rolled `{count}` scheme would have made the community workflow the hard part.

### 4. `Intl` formatters, memoized, in `format.ts`

`format.ts` owns cached `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat`, and
`Intl.ListFormat` instances keyed by `(locale, optionsHash)` — constructing these is the expensive
part and the current per-call allocation (`index.tsx:339-340`) is on session and canvas render paths.
The context exposes `formatNumber`, `formatDate`, `formatTime`, `formatRelativeTime`, `formatList`,
and `formatDistance`.

**Distance units come from the active System Package, not from the locale.** A Spanish-speaking table
running 5e still measures in feet, because the rules say feet; a metric package says metres in
English. `formatDistance(value)` reads the unit from the System Package's speed model (ADR-028) and
renders it with `Intl.NumberFormat(locale, { style: 'unit', unit })`, so the _number_ is localized and
the _unit_ is a rules fact. This is the same separation as SYS-2.6's vocabulary placeholders
(`RC_ROADMAP.md:458`): `{gm}` resolves to "Dungeon Master" or "Keeper" from the package, and the
catalog carries the placeholder, not either word.

### 5. An ESLint rule with a shrinking allow-list

A local flat-config rule, `local/no-literal-jsx-text`, lives in `scripts/eslint-rules/` and is wired
into `eslint.config.js` scoped to `apps/gm-react/src/{app,screens,ds}`. It reports JSX text children
and the localizable attribute set (`aria-label`, `aria-description`, `placeholder`, `title`, `alt`)
when the value is a string literal containing a letter. Numbers, punctuation-only strings, and
`data-*`/`className`/`href` values are ignored.

The rule ships as `error` on day one with a file-path allow-list covering everything not yet
migrated, checked in beside the rule. UX-1.2 removes allow-list entries as it migrates directories;
the entry count is the migration's progress bar. Adding a path back to the allow-list is a reviewable
diff, which is the point — a warning nobody reads would not have held.

Deliberately out of scope for the rule: `packages/core` (framework-free by `scripts/boundary-lint.ts`
and never user-facing), tests, and string literals outside JSX. Catching every `const label = '…'` in
a helper needs taint analysis; the JSX boundary catches the strings that actually reach a screen.

### 6. Locale is a device preference, and the core never returns prose

Locale selection stays exactly where it is: an app-owned `localStorage` key (`dndtools:locale`,
`index.tsx:5`) resolved as saved → `navigator.languages` → `en`, mirrored onto
`document.documentElement.lang`. It is **not** a core command and not vault state. Language is a
property of the person holding the device, not of the campaign; two people sharing one vault over
sync must be able to read it in different languages. When DEBT-2026-001's platform-preferences layer
lands it absorbs this key unchanged.

`SUPPORTED_LOCALES` gains `direction: 'ltr' | 'rtl'`, written to `document.documentElement.dir`, so
UX-1.3's RTL work is a styling change (logical properties) rather than a plumbing change.

Correspondingly, `@dndtools/core` never returns a user-visible sentence. Command rejections and
validation failures carry a stable machine code plus structured params; the app maps the code to a
message key. This keeps the boundary lint honest — the core cannot depend on a locale — and means a
rejection reason is translatable instead of being English that leaks through a toast.

### 7. Community translations arrive by pull request, not by package install

`docs/development/LOCALIZATION.md` documents the loop, and two scripts implement it:

- `pnpm i18n:export` writes `i18n/export/<locale>.json` — flat ICU key/value, plus a `description`
  and the source file:line for each key — the format Weblate and Crowdin ingest directly.
- `pnpm i18n:import` reads a translated JSON back and regenerates `messages/<locale>.ts`, sorted and
  Prettier-formatted, so the diff a reviewer sees is only the strings that changed.

`pnpm i18n:check` gates both directions: every `en` key has a description, every locale's
placeholders and plural categories match its `en` source (generalizing the existing test at
`index.test.ts:31-40`), no orphan keys, and no key unused in the app. Settings › Language shows a
per-locale coverage percentage from the same data, so a partially translated locale is honest about
being partial rather than silently mixing languages.

Translations **do not** arrive through the widget/system package install pipeline. An installed
package may not register locale data or override an app message key. A package that could rewrite
"DM only" or a confirmation prompt could turn a trusted control into a lie, which is the same threat
ADR-031 fences off for widget markup; catalogs staying in-repo means every string a user is asked to
trust was reviewed. Packages localize their _own_ declared strings, in their own manifest, rendered
inside their own surface.

## Consequences

### Positive

- Translators get stable keys with context and screen provenance instead of ambiguous English text,
  and plural rules their tooling already models.
- React owns the DOM again. No observer, no re-entrancy bookkeeping, no per-mutation catalog walk on
  the session and canvas render paths.
- A missing translation is a typecheck error or a lint error, not a silently English screen.
- The lint allow-list makes "how much of the app is localized" a number rather than an estimate,
  which is what lets UX-1.2 land as one PR per directory without losing track.
- Locale-correct numbers, dates, relative times, and lists become available everywhere at once, from
  one memoized layer, instead of `String(value)` at each call site.
- RTL becomes a styling problem because `dir` is already plumbed.

### Negative

- One-time churn across every screen: ~145 Spanish entries have to be re-keyed and every English
  string re-addressed. UX-1.2 sequences this per decomposed directory (`RC_ROADMAP.md:1748`), but it
  touches nearly every screen file eventually.
- Screens not yet migrated show English to a Spanish user, where the bridge previously translated
  some of them. This is a visible regression for the duration of UX-1.2, accepted in §2.
- We maintain a small ICU parser. It is roughly 150 lines with its own tests, and it will grow if a
  future locale needs `selectordinal`.
- Two files must move together for any new string: the component and `en.ts`. Reviewers have to
  notice a key added without a description.
- Lazy locale chunks add an await on the first render after a language switch; the provider renders
  the English catalog synchronously until the chunk resolves.

## Rejected Alternatives

| Alternative                                            | Why Rejected                                                                                                                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep the MutationObserver bridge alongside `t()`       | It is the source of the ambiguity, the React race, and the missing grammar. Keeping it means never being able to tell which screens are actually done.                      |
| `react-i18next` / `FormatJS` / `Lingui`                | Each brings a provider, a plugin chain, and a message-extraction build step for features we use a fraction of. The app needs plural/select and `Intl`; that is `format.ts`. |
| Keep source strings as keys, add context suffixes      | `'Show\|sceneCard'` keeps the fragility (an English copy edit silently orphans every translation) and reads badly in both the code and the translator's tool.               |
| JSON catalogs                                          | No `MessageKey` union, so a typo is a runtime fallback instead of a compile error, and loading them needs `fetch` under `file://` and the Android shell.                    |
| Locale as a durable core setting synced with the vault | Language belongs to a device and a person, not to a campaign; two players sharing a synced vault must be able to read it in different languages.                            |
| Locale packs installed as community packages           | An installed package that can rewrite trusted chrome copy can lie about permissions and visibility. Same threat ADR-031 fences off for widget markup.                       |
| Warn-level lint rule with no allow-list                | A warning nobody has to clear will not survive sixteen workstreams of screen work; the allow-list is what makes progress reviewable.                                        |

## Migration Impact

Sequenced as Epic UX-1 (`RC_ROADMAP.md:1476-1491`); `src/i18n/*` has one owner throughout P1.

1. **UX-1.1** adds `messages/en.ts`, `messages/es.ts`, and `format.ts`; rewrites `index.tsx` to key
   lookup with the ICU subset and the memoized `Intl` layer; deletes `useRenderedLocalization` and
   the two `WeakMap`s; ports the existing ~145 Spanish entries to keys, including collapsing the two
   hand-written plural entries (`index.tsx:102-103`) into one `plural` message. `index.test.ts` keeps
   its placeholder-consistency test, generalized to plural categories, and gains ICU-parser cases.
2. **UX-1.2** lands the lint rule at `error` with a full allow-list, then removes allow-list entries
   one decomposed screen directory at a time, coordinated with the STB-2 owner for that directory.
   Acceptance is the allow-list at zero and ES coverage ≥ 95%.
3. **UX-1.3** adds `direction` to `SUPPORTED_LOCALES` and the RTL smoke case.
4. **UX-1.4** adds the export/import scripts, `pnpm i18n:check`, `LOCALIZATION.md`, and the coverage
   badge.
5. **SYS-2.6** supplies `{gm}`-style vocabulary placeholders from the active System Package; those
   keys are ordinary catalog keys whose values contain package-resolved arguments.

No persisted shape changes and no `schemaVersion` bump: the locale preference is `localStorage`, not
vault state, and its key and format are unchanged. Core error codes replacing English rejection
strings is additive per command and lands with the workstream that owns each command.

## Rollback Plan

- **Trigger:** the migration stalls with most screens un-migrated and the visible English regression
  is unacceptable before RC-1.
- **Steps:** the bridge is one self-contained hook (`index.tsx:252-315`) plus two module-scope
  `WeakMap`s. Restoring it from history and calling it from `I18nProvider` re-enables source-text
  translation over whatever has not been migrated; migrated screens are unaffected because their keys
  render final text the observer will not find in a source-keyed catalog. This needs a temporary
  source-keyed side catalog for the un-migrated remainder, kept in the revert commit and deleted with
  it.
- **Partial rollback:** demote `local/no-literal-jsx-text` to `warn` to unblock a release without
  giving up the key architecture.
- **Data recovery:** none — no persisted data is involved.
- **Risk:** the two mechanisms coexisting is the state this ADR exists to end; a rollback must carry
  a dated re-migration plan or it becomes permanent.

## Implementation Status

**UX-1.1 landed (2026-09-05).** `messages/en.ts` (161 keys, `as const`, exporting `MessageKey`),
`messages/es.ts` (146 keys, `Partial<Record<MessageKey, string>>`, 90.7% coverage), and `format.ts`
(memoized `Intl.NumberFormat`/`DateTimeFormat`/`RelativeTimeFormat`/`ListFormat`/`PluralRules`, the
ICU subset, `formatDistance`) are in. `useRenderedLocalization` and its two `WeakMap`s are deleted.
The Spanish catalog builds as its own 8.11 kB chunk, loaded by `loadCatalog()` on first use, so §1's
lazy-locale requirement is met and verified in `pnpm build` output. The two hand-written plural
entries are collapsed into `projection.pushed`.

Two deviations from the decision above, both deliberate:

- **A missing key renders the key, it does not throw.** §1 said dev and test should throw. The
  `MessageKey` union already makes an unknown key a compile error, so a runtime throw can only fire
  behind a cast — and a thrown error in the dev server or an e2e run would take a whole screen down
  to report a typo the compiler already caught. `index.test.ts` asserts the fallback chain instead
  (locale → English source → key), and asserts no Spanish key is an orphan.
- **`formatDistance(locale, feet, system)` takes the unit system as an argument.** §4 has it read
  the active System Package's speed model. That model is SYS lane work and does not exist yet, so
  the parameter defaults to `'imperial'` and the call sites pass it once SYS-2.6 lands. The
  invariant §4 actually cares about holds: the locale never decides the unit.

UX-1.1 also re-keyed the 116 existing `t()` call sites, because a typed `t()` cannot coexist with
source-string arguments. Those five screen files render byte-identical English — every `en` value is
the old source string verbatim. The rest of the app is unmigrated and shows English under `es`,
which is §2's accepted trade; `es.ts` keeps translations for keys whose call sites UX-1.2 has yet to
reach, so that migration is a re-pointing rather than a re-translation.

## Verification and Evidence

- Catalogs and API: `apps/gm-react/src/i18n/messages/en.ts`, `messages/es.ts`,
  `apps/gm-react/src/i18n/index.tsx`, `apps/gm-react/src/i18n/format.ts`.
- Tests: `apps/gm-react/src/i18n/index.test.ts` (placeholder and plural-category consistency across
  every locale; missing-key fallback; ICU parse cases), `format.test.ts` (plural selection per locale,
  memoization, distance units from the System Package).
- Lint: `scripts/eslint-rules/no-literal-jsx-text.js` and its allow-list; wired in `eslint.config.js`
  and run by `pnpm lint`.
- Workflow: `pnpm i18n:export`, `pnpm i18n:import`, `pnpm i18n:check`,
  `docs/development/LOCALIZATION.md`.
- E2E: the RTL case in `apps/gm-react/tests/e2e/responsive.spec.ts`, and a language-switch case
  asserting a plural message and a formatted date change with the locale.
- Related: ADR-028 (System Package supplies vocabulary and distance units), ADR-031 (package-supplied
  content is not trusted chrome copy), ADR-018 (React app is the primary surface).
