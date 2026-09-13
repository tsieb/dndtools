# Widgets

Widgets turn the GM Screen and scene canvases into a configurable mission-control surface. They are
a platform primitive: the same declarative model powers the built-in tiles and the sandboxed custom
widgets a DM or the assistant authors. Decision records: [ADR-031](../adr/031-custom-widget-runtime-host.md)
(runtime host, trust review, authoring), [ADR-029](../adr/029-scene-layout-history.md) (layout history),
and [ADR-041](../adr/041-screens-as-the-run-surface.md) (screens as the run surface, flow and canvas
layout policies).

## 1. Model

| Layer          | What it is                                                                                  | Lives in                                                      |
| -------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Definition** | What a widget can do: type, bindings, data queries, commands, config fields, render runtime | `packages/core/src/state/widget-package-state.ts`             |
| **Package**    | A distributable bundle of definitions plus assets, migrations, and a trust review           | `WidgetPackageRecord` in the `widgets` slice                  |
| **Instance**   | A widget placed on a scene: layout, configuration, local state, binding, `disabled` flag    | `Scene.widgets[]` in `packages/core/src/state/scene-state.ts` |

A definition declares `placement.surfaces` (`scene`, `command-center`, `player-view`), sizes and
`resizePolicy`, `requiredBindings` / `optionalBindings` / `dataQueries` / `computedFields`, a
`renderEntrypoint` runtime (`template` | `builtin` | `custom-html-js`), `configFields`, command
descriptors, `capabilitySets` (`manager` | `operator` | `viewer`), and `hostPermissions`.

`computedFields` may carry a formula in the same expression grammar System Packages use, evaluated
over the four aggregate columns of each declared query (`_count`, `_sum`, `_max`, `_active`). A
formula cannot name a row, and a query withheld from the viewer contributes zeroes, so a formula can
never route around the query's audience gate. A formula naming an undeclared query is rejected at
install (`schemas/widget-package.ts`).

## 2. Binding and visibility

A widget binds to an entity by path (`{ source: { entityType, entityId, selector? }, mode,
requiredCapability }`). `resolveWidgetBinding()` (`packages/core/src/queries/binding.ts`) resolves it
against an actor-scoped projection and returns `available`, `unbound`, `missing`, `hidden`,
`conflicted`, or `degraded`. A player binding to a DM-only entity gets `hidden` and never learns
whether it is also missing or conflicted. Leaks are prevented at the resolver, not the renderer.

`isVisibleToViewer()` filters DM-only widgets for the canvas, the scene outline, search, and the
player-view preview overlay.

Two command classes are separated by verb in `permissions/widget-operator-authority.ts`: **operate**
(`start`, `pause`, `roll`, `advance`, …) needs an `operator` grant; **configure** (`set-duration`,
`rename`, `bind`, …) needs `manager`. The DM is always authorized, an observer never, and grants are
checked against `now`.

## 3. Rendering

`WidgetRenderSlot.tsx` (`apps/gm-react/src/app/widgets/`) is the single render path on every
surface. `resolveRenderer()` picks `builtin` | `template` | `custom` | `placeholder` and never
throws; a failing renderer yields `WidgetPlaceholder.tsx` with the diagnostic and
`coreStateAvailable: true`. Template renderers (`app/widgets/templates/`: data table, status list,
tracker, action panel, scene message, chart, stat block, form panel) read `dataQueries` through
`dataEnvironment.ts`, which resolves the eight query sources against actor-filtered core reads and
honours `audience`. Built-in bodies (`app/widgets/builtin/`) cover the system widgets: Map, Audio,
combat, notes, atlas, search, session, tools, player views, and the rest.

### 3.1 Accessibility contract

What every widget owes a keyboard or screen-reader user, and who supplies each part (RC-WID-4.4).

| Obligation           | Builtin bodies and templates (the host)                                                                                                                                                                                                 | Custom `custom-html-js` frames (the package)                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A labelled region    | `WidgetRegion` (`WidgetRenderSlot.tsx`) wraps every branch, placeholder included, in a `<section>` named by the widget's title.                                                                                                         | The same region, plus the iframe `title`. Nothing to do.                                                                                               |
| Keyboard operation   | Every operate control is a real `<button>` (`OpChip`, DS `Button`/`IconButton`) in the Tab order, run by Enter and Space. A soft-disabled control stays focusable and says why. A control that unmounts when pressed hands focus on.    | Native controls or named ARIA widgets; every operate control reachable by Tab; no `tabindex` above 0; no focus taken on load; no `role="application"`. |
| Value changes spoken | The value readout is an `aria-live="polite"` region mounted with the readout: a stat row (`LiveStats`), a count line, the timer's status line, the map summary. A template's readout is `TemplateShell`'s region, its controls outside. | Mount an `aria-live="polite"` region at install, empty, and write changes into it. A region inserted together with its text is routinely not heard.    |
| No colour-only state | An accent tone also carries a shape and a name: `StateMark` (done, pinned, playing), "Now" on the active chart and tracker row, a warning glyph on an urgent timer.                                                                     | Same rule. Honour the contrast state below.                                                                                                            |
| Contrast             | Tokens remap under `forced-colors` (`styles/tokens/colors.css`).                                                                                                                                                                        | `init` sets `--host-forced-colors` (`active` \| `none`) and `--host-high-contrast` (`on` \| `off`) on the frame's root, whatever the package declares. |

The readouts are `aria-live`, not `role="status"`. The canvas's confirmation channel ("Undone: moved
…") is the one status on a board; twenty tiles each claiming the role would bury it.

What counts as a value is deliberate. It is what changes while the tile sits on the board: the
round, a count, whether a track plays. Authored prose (a note or handout body) is content and is not
announced. The countdown figure is `role="timer"`, readable on demand but never read out twice a
second; the status line under it announces the status and, once, the time left when it turns urgent.
The phone initiative tile announces the turn by its place in the order, because the name is already
in its row and a second copy in the DOM makes every by-name lookup ambiguous.

The contrast variables reach every frame, not only those declaring `host-theme-tokens`, because they
are an accessibility signal and say nothing about the vault. `--host-high-contrast` is `on` for the
app's high-contrast theme or for the OS forcing colours. The OS mode also reaches the frame's own
`@media (forced-colors: active)`; the app theme reaches it only through this variable. Both are set
before the package's scripts run, and the host restarts the frame when either changes
(`ThemeAwareWidgetHost`):

```js
var root = getComputedStyle(document.documentElement);
if (root.getPropertyValue('--host-high-contrast').trim() === 'on') {
	document.body.classList.add('high-contrast'); // drop decorative colour, keep shapes and words
}
```

The host cannot enforce anything inside an opaque origin, so the package column is a contract, not a
check. Evidence for the host column is `custom-widgets.spec.ts` › "widget accessibility contract":
axe on `/board` and `/scene/:id` with every builtin type placed and the table live, on both profiles;
a Tab-only walk that drives every operate command the builtins declare; and the contrast forwarding.

Known gap: the map tile's markers come from the shared `app/map/canvas/MapMarkers.tsx`, which draws
every token and POI as a `<button>` even when the tile passes no select handler. On a phone board they
paint under 24px (axe `target-size`). The e2e binds the tile to a map with no markers; the fix is "no
handler, no control" in that shared renderer.

## 4. The custom-widget host

`custom-html-js` widgets render in an iframe with `sandbox="allow-scripts"` and no
`allow-same-origin` (`app/widgets/SandboxHost.tsx`): an opaque origin with no cookies, storage, host
DOM, or way to name the host's origin in a fetch. The frame loads the served document
`apps/gm-react/public/widget-host.html`, which carries its own `WIDGET_SANDBOX_CSP`
(`packages/core/src/security/renderer-isolation.ts`, asserted identical in the document's `<meta>`
and the packaged shell's response header). Package assets arrive over `postMessage` in an `init`
message; `srcdoc` was rejected because a local-scheme document inherits the embedder's CSP.

The protocol (`app/widgets/hostBridge.ts`) mirrors `security/widget-host-api.ts` one to one:

| Direction     | Message                                     | Backed by                                            |
| ------------- | ------------------------------------------- | ---------------------------------------------------- |
| widget → host | `ready { hostApiVersion }`                  | `resolveCustomWidgetRuntimePolicy` version check     |
| host → widget | `render`, `configChanged`, `bindingChanged` | actor-filtered binding and query results only        |
| widget → host | `dispatch(commandDescriptor)`               | `widget.dispatch-command` + operator-authority check |
| widget → host | `requestPermission(kind)`                   | `resolveHostCapability` against the approved grant   |
| widget → host | `outbound(request)`                         | `evaluateWidgetOutboundRequest` (SEC-011)            |
| widget → host | `resize { height }`                         | clamped frame height (iframe only)                   |
| host → widget | `theme { themeVariables, hostDocument }`    | the host's live look; themed packages only (§4.1)    |

The core decides, the host relays: `hostBridge.ts` never answers a permission or outbound request
from its own logic. Inbound messages are validated and attributed to an instance id; unknown kinds,
version mismatches, and foreign frames are dropped and audited. A frame that throws, hangs, or
violates policy is torn down through `isolateWidgetFailure`; siblings and core state survive.

The **worker sandbox** (`app/widgets/WorkerHost.ts`) speaks the same protocol minus `resize`, plus a
`result` message whose payload is whitelisted by `normalizeWorkerResult` and drawn through the
template kind the entrypoint declares. Every exchange is on a clock (8s to `ready`, 3s per render); a
missed deadline calls `terminate()`. The hosted CSP admits `worker-src 'self' blob:`; the packaged
Electron shell's `buildCsp()` does not yet, so a worker there fails closed with "Background widgets
do not run on this build yet."

### 4.1 The design-system kit

A package that declares the `host-theme-tokens` style capability gets the design-system kit
(`apps/gm-react/public/widget-kit.css`, RC-WID-5.4): classes that draw the DS Button, IconButton,
Card, Badge, Chip, ListItem, Input, Select and Stat from the host's own theme tokens. A package
without the capability gets neither the kit nor the tokens. The Torchlight starter is the reference
user, and `widget-kit.spec.ts` checks its kit card, badge and button against the DS components
rendered by the gallery, in all three themes and both densities.

**Delivery.** The kit is served beside `widget-host.html`, but the frame never requests it. The host
fetches it once per page (`loadWidgetKit` in `SandboxHost.tsx`) and sends the text in `init` as
`kit { version, css }`. The host prepends `@font-face` rules containing data URLs for the same
vendored latin WOFF2 faces and weights as `styles/tokens/fonts.css` (Inter 400–800, Cinzel 400–900,
JetBrains Mono 400–700). Vite embeds those assets in both development and production; no guest
font request leaves the frame, and the existing `font-src data:` policy is unchanged. These faces
follow the app's `font-display: swap`; wait for `document.fonts.ready` before comparing rendered text.
The guest installs it ahead of the package's stylesheet, so a package rule
beats a kit rule of equal specificity. `WIDGET_SANDBOX_CSP` does not change. A `<link>` would need
an external style source. Even restricting that source to the kit's path would allow a query
string on the stylesheet URL, giving the frame a request that bypasses the `outbound` gate
(`renderer-isolation.ts`). If the fetch fails or the served file declares a different version, the
frame is initialised without the kit.

**What the host forwards.** `init` and every later `theme` message carry `themeVariables`: the
bridge's forwarded tokens, the Style step's tokens, and `KIT_THEME_TOKENS` (the colours, shadows and
mono face the kit draws with). They also carry `hostDocument { theme, density, motion, colorScheme,
rootFontSize }`, which the guest mirrors onto the frame's `<html>` as `data-theme`, `data-density`,
`data-motion`, `color-scheme` and `font-size`. The host watches its own `<html>`, so switching theme,
density or Reduce motion re-themes a running frame without a reload. The theme-invariant scale
(`--space-*`, `--radius-*`, `--text-*`, `--font-weight-*`, `--leading-*`, `--tracking-*`,
`--duration-*`, `--easing-*`, `--focus-ring-*`, `--density-*`) is declared by the kit itself, along
with the two density sets and the motion collapse. `widgetKit.test.ts` holds all of it equal to
`styles/tokens/`. Package CSS can use any of these tokens.

**Class contract (kit v1).** A modifier goes with its base class. Colours come only from tokens.

| Component   | Markup                                                                                                                                | Modifiers and states                                                                                                           | DS counterpart       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Body text   | `class="kit-root"` on a container                                                                                                     | —                                                                                                                              | app body typography  |
| Button      | `<button class="kit-button">` (or an `<a>`), optional leading/trailing `<svg>`                                                        | `--primary`, `--secondary` (default), `--ghost`, `--danger`, `--accent`; `--sm`, `--lg`; `:disabled` or `aria-disabled="true"` | `Button`             |
| Icon button | `<button class="kit-icon-button" aria-label="…"><svg>…</svg></button>`                                                                | `--ghost` (default), `--outline`, `--accent`; `--sm`, `--lg`                                                                   | `IconButton`         |
| Card        | `.kit-card`; header row `.kit-card__header` holding a `.kit-card__title` eyebrow                                                      | `--sunken`, `--flat` (default), `--raised`, `--overlay`; `--accent`; `--pad-none`, `--pad-sm`, `--pad-lg`; `--interactive`     | `Card`, `CardHeader` |
| Badge       | `<span class="kit-badge">`, optional `<svg>`                                                                                          | `--success`, `--warning`, `--error`, `--info`, `--accent`, `--neutral` (default)                                               | `Badge`              |
| Chip        | `.kit-chip`; a `<button class="kit-chip" aria-pressed>` for a filter; `.kit-chip__remove` for the close button                        | `--neutral` (default), `--accent`, `--danger`, `--info`; `--selected` or `aria-pressed="true"` (neutral tone)                  | `Chip`               |
| List row    | `<ul class="kit-list">` of `<li class="kit-list-row">`; an interactive row holds `<button class="kit-list-row__action" aria-pressed>` | `--selected` or `aria-selected="true"`; a disabled action dims its row                                                         | `ListItem`           |
| Input       | `<input class="kit-input">`, `<textarea class="kit-input">`                                                                           | `--invalid` or `aria-invalid="true"`; focus ring on `:focus`                                                                   | `Input`, `Textarea`  |
| Select      | `<div class="kit-select"><select>…</select></div>`; the wrapper draws the chevron                                                     | `--invalid` on the wrapper, or `aria-invalid="true"` on the select                                                             | `Select`             |
| Stat        | `.kit-stat` holding `.kit-stat__label`, `.kit-stat__figure` (`.kit-stat__value`, `.kit-stat__unit`) and `.kit-stat__delta`            | `.kit-stat--accent`; `.kit-stat__delta--up`, `--down`                                                                          | `Stat`               |

Two baselines apply to the whole frame at zero specificity: the app's `:focus-visible` ring, and
`box-sizing: border-box` on kit elements. Under `data-motion="reduced"` or `"none"`, every animation
and transition in the frame stops on its resting frame, the package's own included.

**Versioning.** `--kit-version` in the stylesheet and `WIDGET_KIT_VERSION` in `SandboxHost.tsx`
move together. Renaming or removing a class or modifier, or changing what one means, is breaking and
bumps both. Adding a class is not breaking.

**What the kit does not do.** It ships no icons; draw a Lucide glyph as inline SVG at a 2px stroke in
`currentColor`. It ships no behaviour: an `aria-disabled` button must ignore its own clicks, and a
`role="button"` chip needs its own keyboard handler. The kit supplies the app's latin fonts; glyphs
absent from those fonts use the same device fallback stack as the app. A package that overrides typography owns the resulting look.

## 5. Trust review

`widget.package.review` (`packages/core/src/commands/widget-package.ts`) is the single writer of
`WidgetPackageRecord.trust`. Every permission the package requests carries an explicit
`approved` | `denied` decision; anything absent stays denied; an upgrade that requests a new
permission resets the package to `unreviewed`. When `buildWidgetPackageReviewSummary`
(`queries/widget-package-review.ts`) recommends `deny-until-fixed`, the DM must acknowledge it before
`trusted` is recorded. Review is separate from `widget.package.enable`. The approved set is exactly
the `HostCapabilityGrant.approvedPermissions` the host passes to `resolveHostCapability`, so a denied
capability is absent at the gate, not merely hidden.

Installed packages start `unreviewed` with every permission denied. System packages shipped in code
are pre-trusted.

## 6. Authoring

- **Manual builder** (`apps/gm-react/src/app/widgetBuilder/`, Extensions › Plugins): a stepper
  (identity → layout → data → config → commands → style → advanced → review) with a live preview
  through the same render resolver. It produces `template` definitions; `custom-html-js` is only
  reachable through the explicit Advanced step, where code, requested permissions, and the SEC-011
  destination picker live with the review summary recomputed live.
- **AI builder**: `widget.package.propose` is a staged MCP write tool (`mcp/tool-registry.ts`,
  `commandType: 'widget.package.install'`). Its input schema has no code, permissions, or network
  fields, so a model cannot author `custom-html-js`. Approval installs the package `unreviewed`;
  trust is a second, separate review. Provenance records `authoring.source = 'generated'` and a
  `promptHash` fingerprint, never the prompt. The schema was trimmed to what a model must invent,
  because a large tool schema degraded tool choice across every other tool (measured against
  `scripts/ai-agent-smoke.ts`).

## 7. Canvas and layout history

`app/SceneBoardCanvas.tsx` is the shared engine for `/board` and `/scene/:id`. Every pointer
operation serializes to the same core command as its keyboard equivalent (WCAG 2.5.7). Layout undo
and reversible destroy are documented in [`SCENE_HISTORY.md`](SCENE_HISTORY.md).

[ADR-041](../adr/041-screens-as-the-run-surface.md) accepts this engine as the `canvas` layout policy
of a screen and adds `flow`, a responsive column grid of auto-height tiles whose visual, DOM and
focus order is the layout order, as the default for hub screens. Both policies use the same widget
instances, the same render resolver and the same core mutation path; flow is not implemented yet
(CAN-7.7).

## 8. Where to look

| Concern                                  | Location                                                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definitions, packages, system widgets    | `packages/core/src/state/widget-package-state.ts`                                                                                                             |
| Instances and scene visibility           | `packages/core/src/state/scene-state.ts`                                                                                                                      |
| Binding resolution                       | `packages/core/src/queries/binding.ts`                                                                                                                        |
| Library discovery                        | `packages/core/src/queries/widget-library.ts`                                                                                                                 |
| Operator authority                       | `packages/core/src/permissions/widget-operator-authority.ts`                                                                                                  |
| Sandbox policy, host API, exfiltration   | `packages/core/src/security/{custom-widget-runtime,widget-host-api,widget-exfiltration}.ts`                                                                   |
| Review command and summary               | `packages/core/src/commands/widget-package.ts`, `queries/widget-package-review.ts`                                                                            |
| Render path, templates, data environment | `apps/gm-react/src/app/widgets/`                                                                                                                              |
| Iframe and worker hosts, bridge          | `apps/gm-react/src/app/widgets/{SandboxHost.tsx,WorkerHost.ts,hostBridge.ts}`                                                                                 |
| Design-system kit for custom widgets     | `apps/gm-react/public/widget-kit.css`, `apps/gm-react/src/app/widgets/widgetKit.test.ts`                                                                      |
| Builder                                  | `apps/gm-react/src/app/widgetBuilder/`, `screens/extensions/WidgetBuilder.tsx`                                                                                |
| E2E                                      | `custom-widgets.spec.ts`, `widget-builder.spec.ts`, `widget-trust-review.spec.ts`, `widget-generate.spec.ts`, `starter-widgets.spec.ts`, `widget-kit.spec.ts` |

## 9. Widget gallery

`WidgetFrame.tsx` owns the gallery card chrome (`WidgetLibraryCard`), including identity,
unavailability reasons and the accessible selection control. The control overlays the whole card,
and the card clips overflow, so the control draws its focus ring inside the card edge with a
negative `outline-offset` (WCAG 2.4.7). The gallery supplies its inert miniature as children and
owns discovery, filtering and placement. Card test ids (`gallery-card-<type>`,
`gallery-entry-<type>`) are keyed on widget type, which assumes types are unique across installed
packages.

`AddWidgetGallery` is shared by the GM Screen (`Board`) and scene editor. Phones use the design
system bottom `Sheet`; wider viewports use a non-modal side panel. Each library card carries its
accent, icon, name, description and miniature. Search matches name, description, category, type and
package name; category filters combine with search. Unsupported entries remain visible after the
available entries, with an accessible reason and no add action.

### Rendering and placement

The gallery reads `listWidgetLibrary` with the runtime profile and `includeUnavailable: true`.
Declared templates render through the same pure template components used by `WidgetRenderSlot`,
with synthetic sample rows and default configuration. These samples never enter campaign state.
Legacy bodies without a declared template use `WidgetRenderSlot`. Custom-code packages show a
labelled silhouette; browsing does not start their iframe or worker. Miniatures mount near the
viewport and are inert and hidden from accessibility navigation; card names and descriptions
remain accessible separately.

An empty scene offers “Start from a template”. “Generate with assistant” opens the existing draft
workflow; “Build your own” opens the widget builder. Neither installs a package just by opening it.
Selecting a library card calls the host's core add command at the first free slot: top to bottom,
then left to right, with the board's 24px margin/gutter and 264px column step. The GM Screen uses its
fixed right bound; scenes also admit their existing horizontal extent. Oversized tiles still place
at the margin below any conflicting tiles. A scene on the `flow` layout policy (ADR-041) has no free
coordinates to search, so its next slot is the end of the reading order: `flowKeyBetween(last,
null)` over `flowOrder`, one flow row below the last tile. After a successful add and panel dismissal, the new tile
receives focus through the existing canvas focus handler. Failed adds keep the gallery open.

Gallery-specific English and Spanish copy is colocated in the owned component and uses the shared
locale and message formatter. Existing title/empty-state strings remain in the shared catalogs.

### Browser acceptance

The executable Playwright fixture below checks Board and SceneEditor in both desktop-chromium and
mobile-chromium: panel modality, populated template miniatures, unsupported profile reason and
blocked placement, search, categories, empty header, generation/build entry points, non-overlapping
placement, tile focus and a visible keyboard focus ring on a card. It also runs axe over the open gallery's interactive content.

Test paths are outside RC-CAN-4.1 ownership, so this fixture is kept here and extracted temporarily.
From the repository root, run:

````sh
python3 - <<'PYTEST'
from pathlib import Path
import os
import subprocess
text = Path('docs/architecture/WIDGETS.md').read_text()
spec = text.split('```typescript\n', 1)[1].split('\n```', 1)[0]
path = Path('apps/gm-react/tests/e2e/rc-can-gallery-acceptance.spec.ts')
with path.open('x') as output:
    output.write(spec + '\n')
try:
    result = subprocess.run([
        'pnpm', '--filter', '@dndtools/gm-react', 'exec', 'playwright', 'test',
        'tests/e2e/rc-can-gallery-acceptance.spec.ts',
        '--project=desktop-chromium', '--project=mobile-chromium',
    ], env={**os.environ, 'DNDTOOLS_E2E_PORT': '15549', 'DNDTOOLS_PW_WORKERS': '2'})
finally:
    path.unlink()
raise SystemExit(result.returncode)
PYTEST
````

The scene library retains its existing `scene-add-widget-panel` test hook on the card list.
The phone sheet exposes Done in its footer so layout editing can finish while the toolbar is
covered. Existing canvas and widget-builder browser tests run unchanged. The keyboard specs from
RC-CAN-3.5/3.6 (`canvas-keyboard.spec.ts`, `canvas-arrange.spec.ts`) now pick the Note card by its
`gallery-entry-note` test id. They wait for the gallery itself, because the phone Sheet hides the
toolbar toggle. They also expect first-open-slot placement (one row) instead of the old diagonal
cascade.

```typescript
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

/**
 * RC-CAN-4.1 — the Add-widget gallery on `/board` and `/scene/:id`, run on both Playwright
 * projects. The phone project gets the DS Sheet, the desktop project the side panel; everything
 * else (live miniatures, search, category filter, dimmed profile-unsupported entries, the empty
 * scene's template header, the generate/build entries, placing into the first open slot and
 * focusing the new tile) is asserted identically on both.
 */

const DESKTOP_ONLY_ID = 'e2e.gallery-desk-lantern';
const DESKTOP_ONLY_TYPE = 'gallery-desk-lantern';

/** A package whose only widget declares the desktop profile. The browser runtime is `web`. */
const DESKTOP_ONLY_PACKAGE = (() => {
	const base = `widgets/${DESKTOP_ONLY_TYPE}`;
	return {
		id: DESKTOP_ONLY_ID,
		version: '1.0.0',
		displayName: 'Desk Lantern',
		widgets: [
			{
				type: DESKTOP_ONLY_TYPE,
				version: '1.0.0',
				displayName: 'Desk Lantern',
				author: 'workspace',
				description: 'Only runs in the desktop app.',
				placement: { surfaces: ['scene'], libraryListed: true },
				renderEntrypoint: {
					runtime: 'custom-html-js',
					sandbox: 'iframe',
					assetPath: `${base}/index.html`,
					hostApiVersion: 1,
				},
				style: {
					isolation: 'iframe-document',
					stylesheetAssetPaths: [`${base}/styles.css`],
					capabilities: ['css-variables', 'host-theme-tokens'],
					tokens: [],
				},
				supportedProfiles: ['desktop'],
				defaultSize: { width: 240, height: 160 },
				minSize: { width: 200, height: 120 },
				resizePolicy: 'free',
				requiredBindings: [],
				optionalBindings: [],
				configurationSchema: { type: 'object', additionalProperties: true },
				capabilitySets: ['manager', 'operator', 'viewer'],
				commands: [],
				events: [],
				hostPermissions: [],
			},
		],
		migrations: [],
		assets: [
			{
				path: `${base}/index.html`,
				kind: 'html',
				entrypoint: true,
				content:
					'<!doctype html><html><head><link rel="stylesheet" href="./styles.css" /></head><body><p>Lantern</p><script src="./main.js"></script></body></html>',
			},
			{ path: `${base}/styles.css`, kind: 'css', content: 'p { margin: 0; }' },
			{ path: `${base}/main.js`, kind: 'javascript', content: '' },
		],
		portabilityWarnings: [],
	};
})();

async function installDesktopOnly(page: Page): Promise<void> {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const installed = await dispatch(page, {
		type: 'widget.package.install',
		actorId,
		payload: { package: DESKTOP_ONLY_PACKAGE },
	});
	expect(installed.status, JSON.stringify(installed.rejection)).toBe('accepted');
	const enabled = await dispatch(page, {
		type: 'widget.package.enable',
		actorId,
		payload: { packageId: DESKTOP_ONLY_ID },
	});
	expect(enabled.status, JSON.stringify(enabled.rejection)).toBe('accepted');
}

type Layout = { id: string; x: number; y: number; w: number; h: number };

function layouts(page: Page, sceneId: string): Promise<Layout[]> {
	return page.evaluate(
		(id) =>
			(
				window.__rt!.state.scenes.scenes[id]?.widgets as unknown as
					| Array<{ id: string; layout: { x: number; y: number; w: number; h: number } }>
					| undefined
			)?.map((w) => ({ id: w.id, ...w.layout })) ?? [],
		sceneId,
	);
}

const overlaps = (a: Layout, b: Layout) =>
	a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Pick the first addable card and return the new tile's layout once the core has it. */
async function placeFirst(page: Page, sceneId: string): Promise<Layout> {
	const before = new Set((await layouts(page, sceneId)).map((w) => w.id));
	await page
		.getByTestId('add-widget-gallery')
		.locator('[data-testid^="gallery-entry-"]:not([aria-disabled="true"])')
		.first()
		.click();
	await expect.poll(async () => (await layouts(page, sceneId)).length).toBe(before.size + 1);
	return (await layouts(page, sceneId)).find((w) => !before.has(w.id))!;
}

test.describe('add-widget gallery (RC-CAN-4.1)', () => {
	test('the GM Screen gallery previews, filters, dims unsupported entries and places a tile in the first open slot', async ({
		page,
	}, testInfo) => {
		const phone = testInfo.project.name === 'mobile-chromium';
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		const homeSceneId = (await (
			await page.waitForFunction(
				() => {
					const rt = window.__rt!;
					const id = rt.state.commandCenter.homeSceneId;
					return id && (rt.state.scenes.scenes[id]?.widgets.length ?? 0) > 0 ? id : null;
				},
				null,
				{ timeout: 10_000 },
			)
		).jsonValue()) as string;
		await installDesktopOnly(page);

		await page.getByRole('button', { name: 'Edit layout' }).click();
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		const gallery = page.getByTestId('add-widget-gallery');
		await expect(gallery).toBeVisible();
		// Phone: a modal DS Sheet. Desktop: a side panel that leaves the board in view.
		await expect(page.getByRole('dialog', { name: 'Add widget' })).toHaveCount(phone ? 1 : 0);
		// The home board already has tiles, so there is no "start from a template" header.
		await expect(gallery.getByTestId('gallery-start-header')).toHaveCount(0);

		// A keyboard-focused card shows its focus ring (WCAG 2.4.7): the card clips overflow, so
		// the ring must be drawn inside it. Previews are masked so only the chrome is compared.
		const firstCard = gallery
			.locator('[data-testid^="gallery-card-"]')
			.filter({ has: page.locator('[data-testid^="gallery-entry-"]:not([aria-disabled="true"])') })
			.first();
		const firstEntry = firstCard.locator('[data-testid^="gallery-entry-"]');
		const cardShot = () =>
			firstCard.screenshot({ mask: [firstCard.locator('[data-preview]')], animations: 'disabled' });
		const unfocused = await cardShot();
		await firstEntry.focus();
		await page.keyboard.press('Shift+Tab');
		await page.keyboard.press('Tab');
		await expect(firstEntry).toBeFocused();
		expect(await firstEntry.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
		const ring = await firstEntry.evaluate((el) => {
			const s = getComputedStyle(el);
			return {
				style: s.outlineStyle,
				reach: parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset),
			};
		});
		expect(ring.style).toBe('solid');
		expect(ring.reach).toBeLessThanOrEqual(0);
		expect(unfocused.equals(await cardShot())).toBe(false);
		await firstEntry.blur();

		// Cards carry a rendered miniature drawn by the widget render path, not just a name.
		const live = gallery.locator('[data-preview="live"]').first();
		await expect(live).toBeVisible();
		await expect
			.poll(() => live.evaluate((el) => el.textContent?.trim().length ?? 0))
			.toBeGreaterThan(0);
		await expect(live).toHaveAttribute('inert', '');
		// The preview uses the declared template and populated sample rows, even before binding.
		await gallery.getByRole('searchbox').fill('initiative');
		const sample = gallery.getByTestId('gallery-card-initiative-tracker');
		await expect(sample.locator('[data-testid="widget-template-status-list"]')).toBeVisible();
		await expect(sample).toContainText('Scout');
		await gallery.getByRole('searchbox').fill('');

		// The desktop-only widget is listed, dimmed, with the core's reason, and cannot be added.
		const lanternCard = gallery.getByTestId(`gallery-card-${DESKTOP_ONLY_TYPE}`);
		const lantern = gallery.getByTestId(`gallery-entry-${DESKTOP_ONLY_TYPE}`);
		await expect(lanternCard).toContainText('Not available on the web profile.');
		await expect(lantern).toHaveAttribute('aria-disabled', 'true');
		const countBefore = (await layouts(page, homeSceneId)).length;
		await lantern.click({ force: true });
		await expect(gallery).toBeVisible();
		expect((await layouts(page, homeSceneId)).length).toBe(countBefore);

		// Search narrows the list; a miss says so.
		const search = gallery.getByRole('searchbox', { name: 'Search widgets' });
		await search.fill('no-such-widget-anywhere');
		await expect(gallery.getByText('No widgets match that search.')).toBeVisible();
		await expect(gallery.locator('[data-testid^="gallery-entry-"]')).toHaveCount(0);
		await search.fill('lantern');
		await expect(gallery.locator('[data-testid^="gallery-entry-"]')).toHaveCount(1);
		await search.fill('');

		// The category filter shows only that category's cards.
		const categories = gallery.getByRole('group', { name: 'Filter by category' });
		const chip = categories.getByRole('button').nth(1);
		const category = (await chip.textContent())!.trim();
		await chip.click();
		await expect(chip).toHaveAttribute('aria-pressed', 'true');
		const shown = await gallery
			.locator('[data-testid^="gallery-entry-"]')
			.evaluateAll((els) => els.map((el) => el.getAttribute('data-category')));
		expect(shown.length).toBeGreaterThan(0);
		expect(new Set(shown)).toEqual(new Set([category]));
		await categories.getByRole('button', { name: 'All', exact: true }).click();

		// Picking a card places it in an open spot on the board's columns and focuses the new tile.
		const placed = await placeFirst(page, homeSceneId);
		await expect(gallery).toHaveCount(0);
		await expect(page.getByTestId(`widget-${placed.id}`)).toBeFocused();
		const others = (await layouts(page, homeSceneId)).filter((w) => w.id !== placed.id);
		for (const other of others) expect(overlaps(placed, other), other.id).toBe(false);
		await expect(page.getByTestId('board-layout-banner')).toHaveCount(0);
	});

	test('the scene editor gallery offers a template header on an empty scene, plus generate and build entries', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		const sceneName = `Gallery Scene ${Date.now()}`;
		const created = await dispatch(page, {
			type: 'scene.create',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: { name: sceneName, description: '', visibility: 'dm-only', tags: [] },
		});
		expect(created.status).toBe('accepted');
		const sceneId = (await page.evaluate(
			(name) =>
				Object.values(window.__rt!.state.scenes.scenes).find((s) => s.name === name)?.id ?? null,
			sceneName,
		))!;
		expect(sceneId).toBeTruthy();

		await gotoRoute(page, `/scene/${sceneId}`);
		await page.getByRole('button', { name: 'Edit layout' }).click();
		const addToggle = page.getByRole('button', { name: 'Add', exact: true });
		await addToggle.click();
		const gallery = page.getByTestId('add-widget-gallery');
		await expect(gallery).toBeVisible();
		await expect(gallery.getByTestId('gallery-start-header')).toContainText(
			'Start from a template',
		);
		await expect(gallery.getByRole('button', { name: 'Generate with assistant' })).toBeVisible();
		await expect(gallery.getByRole('button', { name: 'Build your own' })).toBeVisible();

		// The open gallery passes axe. The miniatures are `inert` + `aria-hidden` previews of other
		// widgets' bodies, which their own specs cover, so they are excluded here.
		const results = await new AxeBuilder({ page })
			.include('[data-testid="add-widget-gallery"]')
			.exclude('[data-preview]')
			.analyze();
		expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

		const first = await placeFirst(page, sceneId);
		expect({ x: first.x, y: first.y }).toEqual({ x: 24, y: 24 });
		await expect(gallery).toHaveCount(0);
		await expect(page.getByTestId(`widget-${first.id}`)).toBeFocused();

		// The scene is no longer empty, so the header is gone; the second tile clears the first.
		await addToggle.click();
		await expect(gallery).toBeVisible();
		await expect(gallery.getByTestId('gallery-start-header')).toHaveCount(0);
		const second = await placeFirst(page, sceneId);
		expect(overlaps(first, second)).toBe(false);
		await expect(page.getByTestId(`widget-${second.id}`)).toBeFocused();

		// Generation opens the assistant dialog without installing anything.
		await addToggle.click();
		await gallery.getByRole('button', { name: 'Generate with assistant' }).click();
		await expect(gallery).toHaveCount(0);
		const generator = page.getByRole('dialog');
		await expect(generator).toBeVisible();
		await generator.getByRole('button', { name: 'Close', exact: true }).first().click();
		expect((await layouts(page, sceneId)).length).toBe(2);

		// "Build your own" closes the gallery and opens the widget builder on a blank widget.
		await addToggle.click();
		await gallery.getByRole('button', { name: 'Build your own' }).click();
		await expect(gallery).toHaveCount(0);
		await expect(page.getByRole('dialog', { name: /Widget builder/ })).toBeVisible();
	});

	test('a flow scene appends gallery picks to the end of its reading order and focuses them', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		const sceneName = `Gallery Flow ${Date.now()}`;
		const created = await dispatch(page, {
			type: 'scene.create',
			actorId,
			payload: { name: sceneName, description: '', visibility: 'dm-only', tags: [] },
		});
		expect(created.status).toBe('accepted');
		const sceneId = (await page.evaluate(
			(name) =>
				Object.values(window.__rt!.state.scenes.scenes).find((s) => s.name === name)?.id ?? null,
			sceneName,
		))!;
		expect(sceneId).toBeTruthy();
		// The same command the editor's layout picker dispatches.
		const policy = await dispatch(page, {
			type: 'scene.set-layout-policy',
			actorId,
			payload: { sceneId, layoutPolicy: 'flow' },
		});
		expect(policy.status, JSON.stringify(policy.rejection)).toBe('accepted');

		await gotoRoute(page, `/scene/${sceneId}`);
		await page.getByRole('button', { name: 'Edit layout' }).click();
		const addToggle = page.getByRole('button', { name: 'Add', exact: true });
		const gallery = page.getByTestId('add-widget-gallery');
		await addToggle.click();
		await expect(gallery.getByTestId('scene-add-widget-panel')).toBeVisible();
		const first = await placeFirst(page, sceneId);
		expect({ x: first.x, y: first.y }).toEqual({ x: 0, y: 0 });
		await expect(page.getByTestId('scene-board-flow')).toBeVisible();
		await expect(page.getByTestId(`widget-${first.id}`)).toBeFocused();

		// The second pick lands one flow row below the first: last in reading, DOM and focus order.
		await addToggle.click();
		const second = await placeFirst(page, sceneId);
		expect({ x: second.x, y: second.y }).toEqual({ x: 0, y: 240 });
		await expect(page.getByTestId(`widget-${second.id}`)).toBeFocused();
		const order = await page
			.getByTestId('scene-board-flow')
			.locator('[data-testid^="widget-"][role="group"]')
			.evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('data-testid')));
		expect(order).toEqual([`widget-${first.id}`, `widget-${second.id}`]);
	});
});
```
