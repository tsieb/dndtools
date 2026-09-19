# Wiki v2 hosting

Beacon publishers can include shared session recaps alongside player-visible notes. The
publisher projects folder fields through the core visibility filter. The API strips secret
callouts before storing pages. Publishing replaces the versioned bundle; unpublishing removes
the lookup before deleting the object.

The existing formatted hash reader remains the primary share link and password entry point.
The public reader links to a crawlable plain-text edition at
`/wikis/{wikiId}/reader?page={slug}`. These server-rendered text documents work without JavaScript,
include page-specific title, description, canonical and Open Graph metadata, folder navigation,
search and a light/dark choice. The hash reader uses the app's parchment, tavern and high-contrast
themes. `/rss.xml` syndicates only included recaps; `/sitemap.xml` lists published page URLs.
Unlisted documents are noindex and have no feed or sitemap. Password document requests redirect
to the password reader. Responses and both CloudFront wiki origins disable caching so changing
access or unpublishing does not leave a public copy at the edge.

## Deployment configuration

1. Deploy app-api with the document route. Its `WebOrigin` must be the canonical web origin.
2. Update web-hosting with `WikiApiId` from app-api's `AppApiUrl` or SSM `app-api/api-id`.
   The optional parameter avoids an initial stack dependency cycle. This enables `/wikis/*`
   forwarding with the stage prefix, search parameters and password header. Deploy both stacks
   before releasing the public reader links.
3. Verify public, unlisted, password and unpublished readers through the distribution.

## Optional custom domain

Custom domains are operator-provisioned for Beacon-published wikis. There is no domain-claim
API and entering an arbitrary hostname in a request cannot change canonical URLs.

1. Confirm the wiki belongs to the requesting Beacon account. Obtain domain ownership evidence
   and an issued ACM certificate in us-east-1 covering the hostname.
2. Deploy `custom-domain.yaml` as a separate stack with the wiki ID, hostname, hosted zone,
   certificate ARN, API Gateway domain and stage. It only forwards that wiki's document paths.
3. After verifying DNS and HTTPS, add the wiki ID → hostname entry to app-api's
   `WikiCustomDomains` JSON parameter. This makes canonical, sitemap and feed URLs use the
   verified domain. Remove the entry before retiring or transferring the domain.
4. Check access changes and unpublishing on the custom domain too. The custom domain provides
   no bypass around the API's access checks.

No deployment, DNS changes or certificate issuance are performed by the local test harness.

## Local acceptance checks

Run `pnpm exec tsx infra/web-hosting/wiki/check-seo.ts` for pinned Lighthouse 12.8.2 against
the production document renderer. It fails below SEO 90 and writes `seo-result.json`; its
full Lighthouse report stays in the printed temporary directory. This tests local rendering,
not deployed DNS, certificates or CloudFront. Run the named Playwright `wiki.spec.ts` and
`wiki-v2.spec.ts` specs for desktop/mobile browser checks.
