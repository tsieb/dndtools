# RC-CLD-4.5 run journal

## Scope

Discovery for the marketplace: server-side search and filters (`GET /listings?q&kind&system&license`),
a maintainer-curated featured set, 1–5 ratings with a 280-character note (a review requires an
install record), and a moderation queue of flagged reviews for the maintainer. Owned paths:
`infra/app-api/template.yaml`, `packages/cloud-fns/src/app-api`, `screens/community/Discover.tsx`,
`screens/community/shared.tsx`, `screens/extensions/Plugins.tsx`. The previous attempt assumed
companion paths were included; the central scope gate rejected that assumption. No agents,
dispatcher mutations, push or promotion.

## Decisions

- Storage: new partitions in the existing single `AppTable` (the stack's documented single-table
  design), not new DynamoDB tables. Rating aggregates live in one shared `listing-ratings` partition
  so a search reads every aggregate in one query; the featured set is the `featured` partition.
- Maintainer identity: `MarketplaceMaintainerSubs` template parameter → `MARKETPLACE_MAINTAINER_SUBS`.
  Empty (the default) means no maintainer, so every maintainer route fails closed with 403. Chosen
  over a Cognito group because a `UserPoolGroup` resource would need new deploy-role permissions.
- Client: `cloud/appApi.ts` is outside the claim, so the discovery client lives in `shared.tsx`.
- e2e: the e2e server blanks every cloud coordinate (isolation-guard asserts it), so `shared.tsx`
  gets a DEV-only transport seam (`import.meta.env.DEV`, tree-shaken from production like
  `window.__rt`). The spec answers a `.invalid` host with `page.route`; nothing leaves the machine.

## Progress

- Read handler, template, tests, client, screens, e2e conventions, lint/size gates.
- Backend: `app-api/discovery.ts` (pure rules: query parsing, matching, facets, rating summary,
  maintainer allowlist) + nine routes in `handler.ts`: `GET /listings`, `GET|PUT /listings/featured`,
  `POST /listings/{id}/install`, `GET /listings/{id}/reviews`, `PUT /listings/{id}/review`,
  `POST /listings/{id}/reviews/{rid}/flag`, `GET /moderation/reviews`,
  `POST /moderation/reviews/resolve`. Listing rows now record `systems`/`license` from the validated
  manifest. Aggregate moves ride the same transaction as the review row; the reviewer's own copy is
  the concurrency guard (409 on a raced save). Listing removal and account deletion purge the new
  rows; account export includes ratings and install records.
- Template: `MarketplaceMaintainerSubs` parameter → env, key-layout comment, nine HttpApi events.
- Tests: the fake DynamoDB in `handler.test.ts` now evaluates transaction conditions and applies
  `Update` (SET/ADD); 16 new contract tests cover every route incl. the maintainer-only guard and
  the empty-allowlist fail-closed case; `discovery.test.ts` pins the pure rules.
- UI: `shared.tsx` holds the discovery client, the DEV-only e2e seam, `RatingText`, `FeaturedRow`,
  `ListingRatings`. `Discover.tsx` searches server-side (debounced words + kind/system/licence
  selects), shows the featured row, records the install after a vault install, and hosts the
  rating form. `Plugins.tsx` hides the "Community marketplace · Unavailable" panel wherever the
  marketplace backend exists. EN + ES catalog keys added.
- Ratchet: Discover.tsx dropped one raw style literal → allowance lowered 12 → 11.

## Validation results

- `pnpm --filter @dndtools/cloud-fns typecheck`, `pnpm --filter @dndtools/gm-react typecheck`: passed.
- `pnpm test:cloud`: 37 files, 503 tests passed (app-api dir: 100, incl. the 16 discovery contract
  tests and 8 pure-rule tests).
- `pnpm test:app`: 121 files, 1277 tests passed (`Discover.test.tsx`: 8).
- ESLint on every changed file, `pnpm lint:boundary`, `pnpm format:check:changed` (14 files): passed.
- `tests/unit/{ci-guardrails,infra-retention,file-size-gate}.test.ts`: 17 passed.
- `sam validate --lint -t infra/app-api/template.yaml`: valid.
- Playwright on a free `DNDTOOLS_E2E_PORT`, desktop + mobile: first run 18/20 with
  community-publish, module-file, isolation-guard and starter-widgets alongside; both failures were
  this spec's own ambiguous locator (the note text is in the textarea and the saved review). Scoped
  it to the list item; `community-discover.spec.ts` then passed 8/8.

## Not done / follow-ups

- Nothing deployed. Until `MarketplaceMaintainerSubs` is set on a stage, the featured PUT and both
  moderation routes answer 403 by design, so the featured row stays empty there.
- Featured curation and moderation are endpoint-only (the story specifies endpoints, not UI).
- The full Playwright suite was not run; only the specs above.
- Listings published before this story have no `systems`/`license` facets until republished.
- `infra/verify-app-api.mjs` does not exercise the new routes (outside the claim).

## Scope-gate follow-up (2026-09-11)

- Starting branch was clean at `bf4b7555`, containing the prior implementation above.
- The rejected companion paths remain in that inherited commit. Asked whether their claim can
  be expanded; no authorization has arrived. In particular, restoring the old Discover test
  restores mocks for `listModules`, which the server-search implementation no longer calls.
  Moving UI tests under the Lambda package would also take them out of the standard app and
  browser suites. No test-only production compatibility shim or gate exclusion was added.
- Independently fixed two backend defects within ownership: ratings now use a random revision
  for edit/retraction concurrency and lost-response detection, avoiding timestamp collisions;
  licence facet spelling now resolves deterministically instead of following random listing IDs.
- Regression evidence: the same-timestamp revision test returned 200 instead of 409 before the
  fix. That run also reproduced the licence-facet test failure (`cc-by-4.0` vs `CC-BY-4.0`).
  After fixes: app-api suite 3 files / 100 tests passed; cloud-fns typecheck and ESLint on all
  four changed backend files passed. Prettier formatted those files. Browser tests were not
  rerun during this follow-up; earlier browser results above belong to the previous attempt.
- Remaining blocker: central claim resolution for `apps/gm-react/src/i18n/messages/{en,es}.ts`,
  `apps/gm-react/src/screens/community/Discover.test.tsx`,
  `apps/gm-react/tests/e2e/community-discover.spec.ts`, and
  `scripts/eslint-rules/no-raw-style-values.allow.js`. The branch is not scope-gate-ready.

## Current scheduled follow-up (2026-09-12)

- Resumed clean branch at `14f679e6`; inherited implementation and companion files preserved.
- Headroom tools are not available in this session; using bounded native reads and command output.
- Checking a rating/deletion race: listing existence is read before the rating transaction, so
  deletion can finish before a late rating recreates orphaned review and aggregate rows.
- Regression reproduced: the deleted-listing request returned 200 instead of 409 before the fix.
  Added an atomic listing-existence condition to the rating transaction. Its contract test verifies
  409 and no reviewer copy, public review or aggregate written after the concurrent deletion.
- Current-run verification (native, complete output inspected):
  - `pnpm exec vitest run --config vitest.cloud.config.ts packages/cloud-fns/src/app-api --maxWorkers=1`:
    3 files / 101 tests passed, including endpoint contracts and maintainer guards.
  - `pnpm --filter @dndtools/cloud-fns typecheck`: passed.
  - Targeted ESLint on handler and handler tests, Prettier, `git diff --check`: passed.
  - `community-discover.spec.ts`, one worker, fresh dynamically allocated server port:
    8/8 desktop/mobile tests passed (kind/system search, featured row, install then rate,
    and Extensions panel presence/absence). The browser uses the existing mocked API transport;
    the contract tests exercise the actual handler with fake AWS persistence.
- Current edits are limited to the owned handler/test paths and this required run journal.
  Earlier companion changes remain inherited and untouched; the prior scope-gate concern is
  still unresolved here. No full central gates, deployment, push or promotion were performed.

## App-gate follow-up (2026-09-12)

- Resumed clean rebased task head `a12a1dcc3ca56ea96c48cf964ee56b86666fb5e0`.
- Read the original failed gate log at
  `/home/trinkle/Programming/agent-dispatcher/.state/attempts/bde06cd2-6d07-4f64-b817-a4e71e238337/output.log`.
  App tests: 125 files passed, 1 failed; 1338 tests passed, 1 failed. The sole failure is
  `apps/gm-react/src/app/help/changelog.test.ts:85`: expected `0.3.7`, received `Unreleased`.
- Root cause: base commit `66b7ab7f` adds bullets under `[Unreleased]` in `CHANGELOG.md`.
  `latestRelease` currently returns the first section with bullets, including Unreleased.
  `git diff 66b7ab7f HEAD -- CHANGELOG.md apps/gm-react/src/app/help/changelog.ts
apps/gm-react/src/app/help/changelog.test.ts apps/gm-react/package.json` is empty: all
  inputs to the failure are unchanged from the task base.
- Focused reproduction:
  `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/app/help/changelog.test.ts apps/gm-react/src/screens/community/Discover.test.tsx --maxWorkers=1`.
  Exit 1: same changelog failure, 14 tests passed (including all 8 Discover tests).
- No discovery change can correct this failure. Required follow-up is outside ownership:
  make `latestRelease` skip Unreleased sections even when populated, and add a regression in
  its adjacent tests. Preserve the release-candidate notes and the shipped version.
- Committing this diagnosis only. The app gate remains failed; central operator must route the
  changelog fix or expand ownership before a successful full app gate can be claimed.
  No test suppression, unrelated edits, dispatcher state changes, push or promotion.
