import { buildStarterWidgetPackage, type StarterWidgetEntry } from './shared';

/**
 * Torchlight (RC-WID-1.6) — the one starter that ships CODE, so the sandbox is exercised by
 * something a DM would actually keep on the board rather than by a fixture.
 *
 * It is a mood card: a flame that gutters when the torch is low and burns steady when it is high.
 * Everything it needs is inside the frame — markup, one stylesheet, one plain script talking to
 * `window.dndtoolsWidget` — so it runs in the opaque-origin iframe under `default-src 'none'` with no
 * network, no storage and no host DOM (RC-WID-1.3). It asks for NO host permissions: a card that
 * draws a flame has no business with the clipboard or the filesystem, and the review sheet says so.
 *
 * It is also the showcase for the design-system kit (RC-WID-5.4). The card, the eyebrow title, the
 * reading badge and the pause button are the kit's `kit-card`, `kit-card__title`, `kit-badge` and
 * `kit-button`, so they draw as the DS Card, CardHeader, Badge and Button do in every theme. The
 * package's own stylesheet only draws what the DS has no component for: the flame and the meter.
 *
 * Motion is a budget, not a default. The flicker is a CSS animation whose duration is derived from
 * the configured intensity. It can be paused (WCAG 2.2.2: it runs for as long as the card is on the
 * board), and reduced motion, from the OS or the app's own setting, turns it off entirely and leaves
 * the flame lit. The information (how much torch is left) is carried by the meter and the words,
 * never by the movement alone.
 */

const TORCHLIGHT_HTML = [
	'<!doctype html>',
	'<html lang="en">',
	'<head>',
	'  <meta charset="utf-8" />',
	'  <meta name="viewport" content="width=device-width, initial-scale=1" />',
	'  <link rel="stylesheet" href="./styles.css" />',
	'</head>',
	'<body>',
	'  <main class="torch kit-root kit-card" data-torch>',
	'    <div class="kit-card__header torch-header">',
	'      <h1 class="kit-card__title" data-title>Torchlight</h1>',
	'      <span class="kit-badge kit-badge--accent" data-reading>Lit</span>',
	'    </div>',
	'    <div class="torch-flame" data-flame aria-hidden="true"></div>',
	'    <div class="torch-meter" role="meter" aria-label="Light left" aria-valuemin="1" aria-valuemax="10" aria-valuenow="6" data-meter>',
	'      <div class="torch-meter-fill" data-fill></div>',
	'    </div>',
	'    <button type="button" class="kit-button torch-pause" aria-pressed="false" data-pause>Pause flicker</button>',
	'    <script src="./main.js"></script>',
	'  </main>',
	'</body>',
	'</html>',
].join('\n');

// Tokens only, never the palette: the kit supplies the card, and the host supplies the theme.
const TORCHLIGHT_CSS = [
	'body { margin: 0; background: transparent; }',
	'.torch { display: grid; gap: var(--space-2); justify-items: center; }',
	'.torch-header { justify-self: stretch; margin-bottom: 0; }',
	'.torch-flame {',
	'  width: 26px; height: 38px; margin: var(--space-1) 0;',
	'  border-radius: 50% 50% 45% 45% / 62% 62% 38% 38%;',
	'  background: linear-gradient(180deg, var(--widget-flame, #ffb347) 0%, var(--widget-ember, #d2461a) 100%);',
	'  box-shadow: 0 0 18px 4px color-mix(in srgb, var(--widget-flame, #ffb347) 40%, transparent);',
	'  transform-origin: 50% 100%;',
	'  animation: torch-flicker var(--torch-period, 1.6s) ease-in-out infinite;',
	'}',
	'.torch[data-paused] .torch-flame { animation-play-state: paused; }',
	'@keyframes torch-flicker {',
	'  0%, 100% { transform: scale(1, 1); opacity: 1; }',
	'  35% { transform: scale(0.92, 1.08) rotate(-2deg); opacity: 0.86; }',
	'  70% { transform: scale(1.06, 0.94) rotate(2deg); opacity: 0.95; }',
	'}',
	'@media (prefers-reduced-motion: reduce) {',
	'  .torch-flame { animation: none; }',
	'  .torch-pause { display: none; }',
	'}',
	'[data-motion="reduced"] .torch-pause, [data-motion="none"] .torch-pause { display: none; }',
	'.torch-meter {',
	'  box-sizing: border-box; width: 100%; max-width: 190px; height: 8px; overflow: hidden;',
	'  border-radius: var(--radius-full); border: 1px solid var(--color-border); background: var(--color-surface-sunken);',
	'}',
	'.torch-meter-fill { height: 100%; width: 0%; border-radius: inherit; background: var(--widget-flame, #ffb347); }',
].join('\n');

// Plain script, deliberately: the sandbox document appends package code as a real <script>, and a
// module would need the host's export shim for a widget that exports nothing. Everything it can
// reach is `window.dndtoolsWidget` — messages to the host, not capabilities.
const TORCHLIGHT_JS = [
	'(function () {',
	'  var api = window.dndtoolsWidget;',
	'  var root = document.querySelector("[data-torch]");',
	'  if (!api || !root) return;',
	'  var flame = root.querySelector("[data-flame]");',
	'  var meter = root.querySelector("[data-meter]");',
	'  var fill = root.querySelector("[data-fill]");',
	'  var title = root.querySelector("[data-title]");',
	'  var reading = root.querySelector("[data-reading]");',
	'  var pause = root.querySelector("[data-pause]");',
	'  var WORDS = ["Guttering", "Low", "Burning", "Blazing"];',
	'  function draw(configuration) {',
	'    var config = configuration || {};',
	'    var intensity = Number(config.intensity);',
	'    if (!isFinite(intensity)) intensity = 6;',
	'    intensity = Math.max(1, Math.min(10, Math.round(intensity)));',
	'    var name = typeof config.title === "string" && config.title.trim() ? config.title.trim() : "Torchlight";',
	'    title.textContent = name;',
	'    // A brighter torch settles: the period lengthens as the flame steadies.',
	'    flame.style.setProperty("--torch-period", (0.75 + intensity * 0.11).toFixed(2) + "s");',
	'    fill.style.width = intensity * 10 + "%";',
	'    meter.setAttribute("aria-valuenow", String(intensity));',
	'    var tier = Math.min(WORDS.length - 1, Math.floor((intensity - 1) / 3));',
	'    reading.textContent = WORDS[tier] + " · " + intensity + " of 10";',
	'    // A guttering torch is a warning; anything brighter reads in the accent, as app badges do.',
	'    reading.className = "kit-badge " + (tier === 0 ? "kit-badge--warning" : "kit-badge--accent");',
	'  }',
	'  pause.addEventListener("click", function () {',
	'    var paused = pause.getAttribute("aria-pressed") !== "true";',
	'    pause.setAttribute("aria-pressed", String(paused));',
	'    if (paused) root.setAttribute("data-paused", "");',
	'    else root.removeAttribute("data-paused");',
	'  });',
	'  api.onRender(function (props) {',
	'    draw((props || {}).configuration);',
	'  });',
	'  api.onConfigChanged(function (configuration) {',
	'    draw(configuration);',
	'  });',
	'  draw(null);',
	'})();',
].join('\n');

export const TORCHLIGHT_STARTER: StarterWidgetEntry = {
	packageId: 'starter.torchlight',
	widgetType: 'torchlight',
	name: 'Torchlight',
	description: 'A flickering torch card that dims as the light burns down.',
	shipsCode: true,
	build: () =>
		buildStarterWidgetPackage({
			packageId: 'starter.torchlight',
			widgetType: 'torchlight',
			displayName: 'Torchlight',
			description: 'A flickering torch card that dims as the light burns down.',
			category: 'Reference',
			html: TORCHLIGHT_HTML,
			css: TORCHLIGHT_CSS,
			javascript: TORCHLIGHT_JS,
			styleCapabilities: ['css-variables', 'custom-stylesheet', 'animation', 'host-theme-tokens'],
			styleTokens: [
				{ name: 'flame', value: '#ffb347', description: 'The top of the flame, and its glow.' },
				{ name: 'ember', value: '#d2461a', description: 'The base of the flame.' },
			],
			configFields: [
				{
					key: 'title',
					label: 'Torch name',
					control: 'text',
					group: 'content',
					default: 'Torchlight',
				},
				{
					key: 'intensity',
					label: 'Light left',
					control: 'number',
					group: 'content',
					default: 6,
					min: 1,
					max: 10,
					step: 1,
					help: 'Guttering at one, blazing at ten.',
				},
			],
			hostPermissions: [],
			defaultSize: { width: 260, height: 240 },
			minSize: { width: 200, height: 200 },
		}),
};
