# Lamplight landing page

`static/` is the standalone marketing page for lamplight.click. It needs no build step,
JavaScript, remote fonts, or third-party requests. Preview it locally:

```bash
python3 -m http.server 6195 --bind 127.0.0.1 --directory infra/web-hosting/static
```

Open `http://127.0.0.1:6195`. The install button links to the maintained alpha guide, so the
page does not pin an installer version or promise an unpublished RC.

## Hosting boundary

The current SAM stack and deployment workflow serve the React app at the domain root. This
change supplies a reviewable static artifact; it does not change that routing or deploy it.
Publish only the contents of `static/` to the chosen marketing origin. Before replacing the
root page, the operator must choose where the existing web app will live and update its
entry links and authentication callbacks. Do not upload this directory over the app bucket:
the existing deployment sync owns that bucket and can remove unrelated files.

## Screenshots

Run from the repository root after installing workspace dependencies and Playwright Chromium:

```bash
node infra/web-hosting/visual-suite.mjs --refresh
```

The marketing visual suite starts this checkout's Vite server on `127.0.0.1:6194` with cloud
coordinates blanked and external browser requests blocked. Set `DNDTOOLS_MARKETING_PORT` to
an unused port if necessary; `--strictPort` prevents attaching to another checkout.
Each capture uses a fresh browser profile and the app's built-in sample vault. Setup dismisses onboarding, as in the app's e2e helpers, and selects Ruined Keep
through the board dropdown and atlas map button. Captures use Chromium at 1440 × 1000,
English, UTC, and reduced motion. No private vault or generated mockup is used.

`static/screenshots/provenance.json` records the source commit, capture time, browser version,
routes, dimensions, and SHA-256 hashes. README and landing page share these exact PNGs.
Refresh after app changes, inspect both images, and update the README capture date.

Without `--refresh`, captures go to ignored `test-results/marketing/` and leave published images
alone. Both modes check the landing page at 390, 768, and 1440 pixels for horizontal overflow,
loaded images with alt text, and axe accessibility violations, and save full-page review images.
This suite does not replace the app-wide visual regression gate planned in RC-DSN-4.1.
