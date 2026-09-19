# RC-WID-5.4 — The design-system kit inside the sandbox

Security review: see [Security review](#security-review) below (run 2026-09-12 with `/security-review`
against the working tree before commit).

## What changed

- `apps/gm-react/public/widget-kit.css` (new, kit v1). Classes for button, icon button, card (+ header
  and eyebrow title), badge, chip, list row, input/textarea, select, stat, plus `kit-root` body text.
  Also the app focus ring at zero specificity, the standard/comfortable/compact density sets, and the
  motion collapse (duration tokens to 0ms plus the blanket animation/transition stop). Colours,
  shadows and fonts come from forwarded theme tokens. The theme-invariant scale is declared in the
  kit and must equal `styles/tokens/`.
- `SandboxHost.tsx`. For packages that declare `host-theme-tokens`: fetches the kit once per page
  from the app origin, checks its `--kit-version`, and sends it in `init` as `kit { version, css }`.
  It also forwards `KIT_THEME_TOKENS` and a `hostDocument { theme, density, motion, colorScheme,
rootFontSize }`, and watches the host `<html>` so a theme, density or motion switch re-themes a
  running frame through a new `theme` message. On a failed or mismatched fetch the frame initialises
  without the kit.
- `widget-host.html`. Applies the host look (token names must start with `--`; attribute values,
  colour scheme and font size are pattern-checked), installs the kit before the package stylesheet,
  and handles `theme`. The CSP meta is unchanged.
- `renderer-isolation.ts`: comment only. Records why the CSP was not widened.
- `docs/architecture/WIDGETS.md`: §4.1 with delivery, forwarding, the class contract table,
  versioning and limits. Also a `theme` row in the protocol table, a "where to look" row and the
  e2e spec name.
- Tests: `widgetKit.test.ts` (drift and contract guard) and `tests/e2e/widget-kit.spec.ts`
  (acceptance).

## Decision: the widget CSP did not change

The story allows the CSP to change "only to admit that one same-origin stylesheet". A `<link>` from
the frame would need an external source in `style-src`. Allowing the entire app origin would
admit other stylesheets. A path-restricted source is possible, but a stylesheet URL with a query
string is still a request the frame makes without going through the host's `outbound` gate. It would also
have required editing `apps/gm-react/electron/main.cjs`, which serves the same policy as a header and
is outside this task's paths. So the host fetches the kit and passes the text, and the existing
`style-src 'unsafe-inline'` admits it. `WIDGET_SANDBOX_CSP`, the meta tag and the Electron header are
byte-identical to before, and `hostBridge.test.ts` still asserts all three agree.

## Torchlight scope — resolved by operator brief (2026-09-18)

`packages/core/src/state/starter-widgets/torchlight.ts` is now explicitly owned by this task.
The previous candidate's path-fence failure is resolved by the operator's expanded claim; no
runtime rewrite is needed. The existing changes are retained because Torchlight is the only
code-shipping starter and the acceptance explicitly requires restyling that showcase. There are
no further Torchlight edits in the 2026-09-19 follow-up.

Justification for the retained edits: the kit
card, eyebrow title and reading badge (warning when guttering, accent otherwise) and a Pause flicker
button (`aria-pressed`, WCAG 2.2.2), hidden under reduced motion, demonstrate the DS contract
and provide an accessible control for continuous animation. The meter is now `role="meter"`
with `aria-valuenow`. Palette literals were dropped in favour of tokens, and the glow is derived
from the flame token, so the `glow`, `surface` and `text` style tokens are gone. Default size went
from 260×220 to 260×240 and min height from 180 to 200 to fit the button.

## Validation

- App vitest, `widgetKit.test.ts` + `hostBridge.test.ts`: 2 files / 38 tests passed
  (`/tmp/rc-wid54-vitest-app.log`).
- Core vitest, `starter-widget-library.test.ts` + `security-renderer-isolation.test.ts`: 2 files /
  41 tests passed (`/tmp/rc-wid54-vitest-core.log`).
- `tsc --noEmit` for gm-react and core: exit 0 (`/tmp/rc-wid54-types-{app,core}.log`).
- ESLint on the changed TS/TSX files: exit 0. Prettier check on all changed files: clean.
  `git diff --check`: clean.
- `pnpm test:tooling`: 24 files / 162 tests passed (`/tmp/rc-wid54-tooling.log`).
- Playwright on isolated port 15731, desktop-chromium + mobile-chromium, `widget-kit.spec.ts`,
  `starter-widgets.spec.ts`, `custom-widgets.spec.ts`: 12 passed, 0 failed
  (`/tmp/rc-wid54-e2e-3.log`).
  - The acceptance test reads the DS Button (secondary, md), Card (flat, md) and Badge (accent)
    computed styles from the `#/__ds` gallery in tavern, parchment and high-contrast × comfortable
    and compact. The kit button, card and badge inside the running Torchlight frame must compute
    to the same values after a live re-theme. The comparison covers padding, border, radius,
    background, colour, shadow, font family/size/weight/line height, min and actual height, and
    the `:focus-visible` ring. It also asserts the kit arrived as `<style data-widget-kit="1">`
    with no `<link>` in the frame, and that the sandbox attribute is still `allow-scripts`.
  - The second test pauses the flicker, then flips the host to `data-motion="none"`. The frame
    mirrors it, the flame rests (`animation-iteration-count: 1`) and the pause control hides.
- Two failures along the way, both fixed: (1) rem lengths were 13/16 of the DS because the guest
  document sets `html { font: 13px … }`, so the host now forwards its root font size; (2) the DS
  reference focus ring was read without `:focus-visible` because gallery selects count as pointer
  use, so the reference is now reached by keyboard. Logs `/tmp/rc-wid54-e2e-{1,2}.log`.
- Not run: the full Playwright suite, `pnpm lint` in full, the app build. Left to the central gates.

Known limit: the frame can't load the app's self-hosted Inter (`font-src data:`), so kit text
renders in the next face of the `--font-sans` stack. Computed values match; glyph shapes may not.
Documented in WIDGETS.md §4.1.

## Security review

`/security-review`, 2026-09-12. Scope: the RC-WID-5.4 working-tree changes listed above. The
command's generated diff was against `main` and also carried the unrelated `loop/rc` commits already
reviewed under their own stories; those were not re-reviewed. The review was done inline rather than
with the command's sub-tasks, because this task does not authorise spawning agents.

**Findings: none at or above the report threshold (confidence ≥ 8).**

Checked and dismissed:

- **Message trust in the guest.** `applyHostLook`/`install` run only for messages whose
  `event.source` is `parent`. A sibling frame or the widget cannot forge a `theme`/`init`. Package
  code shares the guest realm but can only restyle its own document, which it could already do.
- **Values written into the frame.** Token names must start with `--` and are applied through
  `style.setProperty`. Attributes, `color-scheme` and `font-size` are pattern-checked or dropped.
  Even a hostile value cannot load anything, because the frame's `img-src`/`font-src` are `data:`
  only and `connect-src` is `'none'`.
- **Kit text injected as `<style>`.** It comes from a fixed same-origin URL with no user input
  (`new URL('widget-kit.css?v=1', document.baseURI)`) and is inserted via `textContent`. Tampering
  requires control of the app origin. `widgetKit.test.ts` asserts it has no `url()`, `@import` or
  `image-set()`.
- **CSP.** Unchanged, and asserted three ways (core constant, meta tag, Electron header) plus
  `style-src` pinned to `'unsafe-inline'`.
- **Data exposure.** The frame now learns the theme name, density, motion setting, colour scheme,
  root font size and more theme colour values. None of it is campaign or user data, and the frame
  has no network channel of its own to send it anywhere.
- **`postMessage(…, '*')` for `theme`.** Same targeting as the existing `render` messages, which
  carry far more sensitive, actor-filtered data. Nothing new and nothing sensitive added.

## Revalidation and scope recovery — 2026-09-19

Starting candidate: `2187dd18a96f6d5588d4b3c96b5c51d309456686`, already committed on the current
task branch, with a clean working tree. The implementation, existing acceptance tests and class
contract were retained. Headroom tools were not available; validation used original command output.

This follow-up corrects the CSP rationale in the owned stylesheet comment, core policy comment
and WIDGETS.md. CSP supports path restrictions; the reason to keep host-delivered CSS is that even
a path restriction allows query-bearing requests outside the outbound gate. See the
[W3C URL matching algorithm](https://www.w3.org/TR/CSP3/#match-url-to-source-expression).
No executable behavior, CSP directive, Torchlight asset or test was changed. Journal updates are
required task evidence. No dispatcher control state was edited.

### Current validation

- App: `pnpm exec vitest run --config vitest.app.config.ts
apps/gm-react/src/app/widgets/widgetKit.test.ts
apps/gm-react/src/app/widgets/hostBridge.test.ts`: **38 passed**, 2 files.
  Original output: `/tmp/rc-wid54-current-app.log`.
- Core: `pnpm --filter @dndtools/core exec vitest run
tests/starter-widget-library.test.ts tests/security-renderer-isolation.test.ts`:
  **41 passed**, 2 files. Original output: `/tmp/rc-wid54-current-core.log`.
- Browser: `DNDTOOLS_E2E_PORT=15734 pnpm --filter @dndtools/gm-react exec playwright test
tests/e2e/widget-kit.spec.ts tests/e2e/starter-widgets.spec.ts
tests/e2e/custom-widgets.spec.ts --workers=1`: **12 passed**, desktop and mobile Chromium.
  Original output: `/tmp/rc-wid54-current-e2e.log`. This includes live DS computed-style snapshots
  for Button, Card and Badge in tavern, parchment and high-contrast, comfortable and compact,
  focus-ring parity, motion collapse, starter installation and sandbox failure isolation.

- `pnpm --filter @dndtools/gm-react exec tsc --noEmit` and the corresponding core command:
  both exit 0. Logs: `/tmp/rc-wid54-current-types-app.log`, `/tmp/rc-wid54-current-types-core.log`.
- Focused ESLint on SandboxHost, renderer-isolation and Torchlight: clean. Prettier check on
  all six owned paths and this journal: clean. `git diff --check`: clean.

### Current security review follow-up

The retained [`/security-review` report](#security-review) records the previous candidate's review.
No `/security-review` tool or repository command is exposed in this session; this follow-up is a
manual source review, not a claim to have rerun that command or the operator's independent review.

Reviewed the current guest `install`/`applyHostLook` and message source check, the host's fixed kit
fetch and version check, capability-gated token forwarding, stylesheet request guards, Torchlight
assets, and core/meta/Electron CSP consistency tests. No new executable changes or new security
findings. The guest still receives styles through `textContent` and remains `allow-scripts` only;
kit CSS contains no URL/import/image-set requests. Corrected the inaccurate claim that a CSP source
cannot name a file. The policy itself remains unchanged, and the focused security tests pass.

The documented font limitation remains: computed DS styles match, but the sandbox cannot fetch
self-hosted Inter, so this is not a pixel-identical glyph snapshot claim. Full repository gates,
independent review and publication remain the central operator's responsibility.

## Integration rebase recovery — 2026-09-19

Gate feedback requested reconciliation with `a66f3475acfef4e5cbe975aca120b6c99235f5e5`.
Rebased the task's two commits onto that exact integration commit. The only conflict was
`docs/architecture/WIDGETS.md`: the kit's expanded section 8 table overlapped the integration
branch's appended section 9 gallery documentation and embedded browser fixture.

Resolved by keeping the kit table (including stylesheet and acceptance-test links) followed by
the complete integration gallery section. The integration ADR-041 introduction and layout-policy
paragraphs remain. Exact-content assertions confirm the gallery section/fixture is byte-identical
to integration, the section 4.1 class contract is byte-identical to the pre-rebase candidate, and
both ADR-041 additions remain. `git range-diff` shows only the expected documentation context
change in the implementation commit; the follow-up patch is unchanged. The rebased commits are
`9307b508` and `4d1078e1`. No runtime, Torchlight, or test edits were needed for this recovery.
The existing [security-review report](#security-review) still covers the unchanged kit code.

Validation against the rebased tree (original output read directly; no Headroom tools available):

- Focused app Vitest: **38 passed** (`/tmp/rc-wid54-rebase-app.log`).
- Focused core Vitest: **41 passed** (`/tmp/rc-wid54-rebase-core.log`).
- Playwright: `DNDTOOLS_E2E_PORT=15734 pnpm --filter @dndtools/gm-react exec playwright test
tests/e2e/widget-kit.spec.ts tests/e2e/starter-widgets.spec.ts
tests/e2e/custom-widgets.spec.ts --workers=1`: **16 passed**, desktop and mobile Chromium
  (`/tmp/rc-wid54-rebase-e2e.log`). Integration adds four resize checks to the prior twelve.
  The three-theme DS Button/Card/Badge comparisons, focus rings and motion tests still pass.
- App `tsc --noEmit`: exit 0 (`/tmp/rc-wid54-rebase-types.log`).
- Prettier check on the reconciled document and journal, and `git diff --check`: clean.

The target integration commit is now an ancestor of the candidate. Only the task branch was
rebased; nothing was pushed or promoted and no dispatcher control state was changed.

## Rendered font parity recovery — 2026-09-19

This supersedes the font limitation recorded above. Review of candidate `e30621fc` correctly
identified missing Inter faces despite matching computed CSS. Headroom and `/security-review`
commands are not exposed in this session; original local output was read directly.

Scope: only `SandboxHost.tsx`, `WIDGETS.md`, and this required journal changed. No additional
Torchlight edits were needed. The host now prepends vendored WOFF2 data-URL font faces to the
version-checked kit text. The family/weight inventory exactly follows `styles/tokens/fonts.css`,
including Cinzel and JetBrains Mono so the other forwarded font tokens resolve too. Vite's explicit
`?inline` imports embed the bytes in development and production, independent of asset base paths.
The guest still receives only the capability-gated kit via `init`. Font display remains `swap`.
The public stylesheet and class-contract version remain unchanged; this fixes resource delivery.

### Validation of rendered output

- External Playwright probe: **1 passed**, comparing identical `Pause flicker` content in clones
  of the actual gallery DS and installed Torchlight Button/Card/Badge in all three themes at
  comfortable density. Waits for `document.fonts.ready`, asserts a loaded Inter 400/600 face,
  compares actual element/text dimensions, and captures all nine screenshot pairs.
  Button text is **96px** and intrinsic width **130px** in both documents, in every theme.
  Card text is **94px**, intrinsic width **128px**; Badge text **76px**, width **94px**.
- Pixel comparison: all nine text interiors are identical. Badges are pixel-identical throughout.
  Rounded-edge rasterisation differs on Button (21–40 pixels, max channel delta 2/255) and Card
  (41 pixels, max delta 4/255). All pairs pass a maximum per-channel tolerance of 4/255.
  The probe removes transformed scene ancestors for consistent frame screenshot coordinates;
  an initial screenshot run without that normalization captured the wrong tavern region.
- Negative control: removing only guest `@font-face` rules fails the loaded-face assertion and
  reproduces the original **93.6875px** DOM text / **127.6875px** button width.
  This explicitly guards against the old computed-style-only false positive.
- Existing widget-kit, starter-widget and custom-widget browser suites: **16 passed**, desktop
  and mobile Chromium, including all three themes at comfortable and compact density.
- Focused app tests: **38 passed**. Focused core tests: **41 passed**.
- App TypeScript, focused ESLint, Prettier, `git diff --check`: passed.
- Production app build and production bundle guard: passed. Existing large-chunk warnings remain.

Original artifacts: `/tmp/rc-wid54-font-proof/{parity.log,negative.log,pixels.log,ds-*.png,kit-*.png}`;
other logs `/tmp/rc-wid54-font-{app,core,types,e2e,build}.log`. The external probe is preserved below
so its regression assertions remain reproducible without editing unowned test paths. The full
operator gates and independent review are still separate from these focused checks.

### Security review follow-up: embedded font delivery

This manual follow-up extends the retained [`/security-review` report](#security-review); it does
not claim an unavailable command or independent reviewer ran again. No new findings.

Reviewed the fixed dependency imports, generated font-face CSS, capability gate, kit version/failure
handling, guest style insertion, parent-window message check and existing core/meta/Electron CSP.
Font sources and family/weight descriptors are build-time constants, with no widget-provided URL,
remote fetch, stylesheet traversal, or host data. Only vendored latin WOFF2 bytes cross the boundary;
`textContent` insertion cannot turn them into markup. The guest uses already-permitted `data:` font
loads. `connect-src 'none'`, inline-only `style-src`, `font-src data:`, and `allow-scripts` without
`allow-same-origin` are unchanged. Existing consistency/security tests pass. No dispatcher state,
publication, promotion or additional agent work occurred.

### Reproducible external regression probe

Build a temporary spec by taking `apps/gm-react/tests/e2e/widget-kit.spec.ts` up to (excluding)
`test.describe(`, replace its `./_helpers` import with the absolute repository helper path, then
append the TypeScript below. This reuses the checked-in starter installation and DS references.
Set the temporary directory's `package.json` to `{"type":"module"}` and symlink its `node_modules`
to `apps/gm-react/node_modules`. Its Playwright config imports the repository config and overrides
`testDir` to that temporary directory, `webServer.cwd` to `apps/gm-react`, and `projects` to
`[{name: 'desktop-chromium', use: {viewport: {width: 1280, height: 800}}}]`.
Run from the app using `DNDTOOLS_E2E_PORT=15738 pnpm exec playwright test --config <temporary-config>
--workers=1`. `WIDGET_FONT_NEGATIVE=1` repeats the run with guest font faces removed and must fail.
The screenshot output directory is `/tmp/rc-wid54-font-proof` (create it first).

```ts
async function capture(target: Locator, name: string) {
	await target.evaluate(async (element) => {
		const clone = element.cloneNode(false) as HTMLElement;
		clone.removeAttribute('data-pause');
		clone.removeAttribute('data-reading');
		clone.removeAttribute('data-torch');
		clone.textContent = 'Pause flicker';
		Object.assign(clone.style, {
			position: 'fixed',
			left: '0px',
			top: '0px',
			margin: '0px',
			width: 'max-content',
			zIndex: '2147483647',
			transform: 'none',
			transition: 'none',
		});
		const backing = document.createElement('div');
		Object.assign(backing.style, {
			position: 'fixed',
			inset: '0',
			background: 'white',
			zIndex: '2147483646',
		});
		document.body.append(backing, clone);
		clone.id = 'font-proof';
		backing.id = 'font-proof-backing';
		await document.fonts.ready;
	});

	if (process.env.WIDGET_FONT_NEGATIVE === '1') {
		await target.evaluate(async () => {
			const kit = document.querySelector('style[data-widget-kit]');
			if (kit) kit.textContent = kit.textContent!.replace(/@font-face\s*\{[^}]*\}/g, '');
			await document.fonts.ready;
		});
	}
	// Locate within the same document as the supplied locator (including opaque sandbox frames).
	const metrics = await target.evaluate(() => {
		const el = document.querySelector('#font-proof')!;
		const style = getComputedStyle(el);
		const range = document.createRange();
		range.selectNodeContents(el);
		return {
			width: el.getBoundingClientRect().width,
			height: el.getBoundingClientRect().height,
			textWidth: range.getBoundingClientRect().width,
			fonts: [...document.fonts]
				.filter((f) => f.family.replace(/['"]/g, '') === 'Inter' && f.status === 'loaded')
				.map((f) => f.weight)
				.sort(),
			font: [style.fontFamily, style.fontSize, style.fontWeight, style.lineHeight],
		};
	});
	const handle = await target.evaluateHandle(() => document.querySelector('#font-proof')!);
	if (process.env.WIDGET_FONT_NEGATIVE !== '1')
		await handle
			.asElement()!
			.screenshot({ path: `/tmp/rc-wid54-font-proof/${name}.png`, animations: 'disabled' });
	await target.evaluate(() => {
		document.querySelector('#font-proof')!.remove();
		document.querySelector('#font-proof-backing')!.remove();
	});
	return metrics;
}
test('rendered font and component parity across themes', async ({ page }) => {
	test.setTimeout(120000);
	const sceneId = await placeTorchlight(page);
	const snapshots: Record<string, Awaited<ReturnType<typeof capture>>> = {};
	await page.goto('/#/__ds');
	await page.locator('[data-ds-gallery]').waitFor();
	for (const ref of REFERENCES) {
		await page.getByLabel('Component', { exact: true }).selectOption(ref.component);
		for (const [prop, value] of Object.entries(ref.props))
			await page.getByLabel(`Prop ${prop}`, { exact: true }).selectOption({ label: value });
		for (const theme of THEMES) {
			await page.getByLabel('Theme', { exact: true }).selectOption(theme);
			await page.getByLabel('Density', { exact: true }).selectOption('comfortable');
			await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'none'));
			snapshots[`${theme}-${ref.component}`] = await capture(
				page.locator(ref.specimen).first(),
				`ds-${theme}-${ref.component}`,
			);
		}
	}
	await gotoRoute(page, `/scene/${sceneId}`);
	const frame = page.locator('iframe[data-widget-sandbox="torchlight"]');
	await expect(frame).toBeVisible();
	await frame.evaluate((el) =>
		Object.assign((el as HTMLElement).style, {
			position: 'fixed',
			left: '0px',
			top: '0px',
			width: '600px',
			height: '400px',
			zIndex: '2147483647',
		}),
	);
	const inside = page.frameLocator('iframe[data-widget-sandbox="torchlight"]');
	await expect(inside.locator('style[data-widget-kit="1"]')).toHaveCount(1);
	await frame.evaluate((el) => {
		for (let ancestor = el.parentElement; ancestor; ancestor = ancestor.parentElement) {
			ancestor.style.setProperty('transform', 'none', 'important');
			ancestor.style.setProperty('contain', 'none', 'important');
			ancestor.style.setProperty('overflow', 'visible', 'important');
		}
	});
	await page.waitForTimeout(1000);
	for (const theme of THEMES) {
		await setHostLook(page, theme, 'comfortable', 'full');
		await expect(inside.locator('html')).toHaveAttribute('data-theme', theme);
		for (const ref of REFERENCES) {
			const actual = await capture(inside.locator(ref.kit), `kit-${theme}-${ref.component}`);
			const expected = snapshots[`${theme}-${ref.component}`];
			console.log(theme, ref.component, JSON.stringify({ actual, expected }));
			expect(actual.fonts).toContain(ref.component === 'Card' ? '400' : '600');
			expect({ ...actual, fonts: undefined }).toEqual({ ...expected, fonts: undefined });
		}
	}
});
```

Pixel assertions (Python 3 plus ImageMagick), run after the positive browser probe:

```python
from pathlib import Path
import subprocess

for ds in sorted(Path('/tmp/rc-wid54-font-proof').glob('ds-*.png')):
    kit = ds.with_name(ds.name.replace('ds-', 'kit-', 1))
    a = subprocess.check_output(['magick', str(ds), '-depth', '8', 'rgba:-'])
    b = subprocess.check_output(['magick', str(kit), '-depth', '8', 'rgba:-'])
    size = subprocess.check_output(['identify', '-format', '%w %h', str(ds)])
    assert size == subprocess.check_output(['identify', '-format', '%w %h', str(kit)])
    width, height = map(int, size.split())
    assert len(a) == len(b)
    delta = max(abs(x - y) for x, y in zip(a, b))
    assert delta <= 4, (ds.name, delta)
    for y in range(8, height - 8):
        for x in range(8, width - 8):
            i = (y * width + x) * 4
            assert a[i:i + 4] == b[i:i + 4], (ds.name, x, y)
    print(f'{ds.name}: matched; max channel delta {delta}/255; identical text interior')
```
