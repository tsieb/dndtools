# RC-CLD-4.4 run journal

## Plan

- Extend existing publisher and reader with folder groups, search, themes and opt-in session recaps.
- Add uncached server-rendered public pages, RSS and sitemap using the existing access checks.
- Supply optional custom-domain infrastructure, validate targeted browser/SEO and package gates, commit.

## Ledger

- Existing publishing uses Beacon gate, versioned S3 and stable wiki IDs.
- Client API type declarations are outside ownership; use additive local types and structural request fields.
- No dispatch Headroom tools were initially discovered by name; available dispatch read/search/run tools now used.

## Decisions

- Do not provision DNS or deploy resources. Supply reviewable infrastructure and deployment instructions.
- Keep private wiki data out of indexing and feeds; preserve password reader.
- Journal lives here because LOOP_JOURNAL is a logical task identifier, not a filesystem path.

## Tests and gates

See validation ledger and Report below.

## Report

Implementation and local validation complete; deployment limitations are recorded below.

## Edits made

- `apps/gm-react/src/screens/WikiReader.tsx` — folder groups, content search, semantic themes,
  metadata and links to text reader/RSS; formatted markdown remains in the existing shared pipeline.
- `apps/gm-react/src/screens/community/Wiki.tsx` — public field/body projection, opt-in recaps,
  recap selection restored from owner status, recap-only publication allowed.
- `packages/cloud-fns/src/app-api/handler.ts` — additive folder/kind/recap count, secret stripping,
  anonymous documents through the existing access lookup, password redirect and verified domain map.
- `packages/cloud-fns/src/app-api/wiki-documents.ts` — escaped, script-free text reader,
  search, folder navigation, themes, per-page canonical/meta, public-only RSS and sitemap.
- `infra/web-hosting/template.yaml` and `wiki/custom-domain.yaml` — uncached forwarding and
  operator-provisioned single-wiki custom domain; no cloud deployment performed.
- Component, handler, document, hosting and desktop/mobile browser regressions added.

## Validation ledger

- Initial typecheck exposed detail-view narrowing; fixed after exact diagnostic retrieval.
- Initial Playwright load hit the core barrel's JSON import; document renderer now imports the
  narrow shared markdown module. Exact failure retrieved before correction.
- Dispatch commands do not inherit worker limits from this process. After observing four browser
  workers, subsequent commands explicitly set DNDTOOLS_PW_WORKERS=2 / DNDTOOLS_TEST_WORKERS=3.
- App suite, cloud suite, typecheck, lint and targeted browser specs have passed during development.
- New publisher/reader component checks: 14 passed. Hosting/retention checks: 5 passed.
- Lighthouse 12.8.2: 100 SEO on local production text renderer. Full report:
  `/tmp/wiki-seo-4XEj6C/lighthouse.json`; reproducible script and sanitized score artifact committed.
- Final-tree gates passed below; deployment/DNS/certificate validation remains operator work.

## Final decisions

The formatted reader and its original share links are preserved. The crawlable edition renders
escaped plain text and links back to the selected page in the formatted reader, avoiding a second
markdown interpretation pipeline. Custom-domain claims are an operator-verified infrastructure
workflow, not a self-service hostname form. No unverified domain controls canonical URLs.

## Report

Implemented RC-CLD-4.4 in the owned surfaces, infrastructure and automatically granted tests/catalogs.
Validated: 10 desktop/mobile wiki e2e tests (2 workers), 1,284 app tests, 488 cloud tests,
5 hosting/retention tests, typecheck, quality-gate registry, cloud-function build and Lighthouse SEO 100.
A final new-test boundary error was traced to a viewport stub; the test now mocks the existing
useViewport hook instead of accessing browser viewport APIs. Exact diagnostics were retrieved.
Final lint (0 errors, 15 existing warnings), formatting and all 1,284 app tests passed after that correction. Exact output retrieved before recording success.

The local acceptance artifacts do not establish deployed CloudFront, DNS or certificate health.
Those deployment checks are documented in README.md. No push, promotion or dispatch control changes.
