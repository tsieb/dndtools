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
 * Motion is a budget, not a default. The flicker is a CSS animation whose duration is derived from
 * the configured intensity, and `prefers-reduced-motion: reduce` turns it off entirely and leaves the
 * flame lit — the information (how much torch is left) is carried by the meter and the words, never
 * by the movement alone.
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
	'  <main class="torch" data-torch>',
	'    <div class="torch-flame" data-flame aria-hidden="true"></div>',
	'    <h1 class="torch-title" data-title>Torchlight</h1>',
	'    <p class="torch-reading" data-reading>Lit</p>',
	'    <div class="torch-meter">',
	'      <div class="torch-meter-fill" data-fill></div>',
	'    </div>',
	'    <script src="./main.js"></script>',
	'  </main>',
	'</body>',
	'</html>',
].join('\n');

const TORCHLIGHT_CSS = [
	'body { margin: 0; background: transparent; color: var(--widget-text, #f2e8d8); }',
	'.torch {',
	'  box-sizing: border-box; min-height: 100%; padding: 14px;',
	'  display: grid; gap: 8px; justify-items: center; align-content: center;',
	'  border-radius: 10px;',
	'  background: radial-gradient(120% 80% at 50% 0%, var(--widget-glow, #3a2412) 0%, var(--widget-surface, #14100c) 70%);',
	'  font: 13px/1.45 system-ui, sans-serif;',
	'}',
	'.torch-flame {',
	'  width: 26px; height: 38px;',
	'  border-radius: 50% 50% 45% 45% / 62% 62% 38% 38%;',
	'  background: linear-gradient(180deg, var(--widget-flame, #ffb347) 0%, var(--widget-ember, #d2461a) 100%);',
	'  box-shadow: 0 0 18px 4px var(--widget-glow, #3a2412);',
	'  transform-origin: 50% 100%;',
	'  animation: torch-flicker var(--torch-period, 1.6s) ease-in-out infinite;',
	'}',
	'@keyframes torch-flicker {',
	'  0%, 100% { transform: scale(1, 1); opacity: 1; }',
	'  35% { transform: scale(0.92, 1.08) rotate(-2deg); opacity: 0.86; }',
	'  70% { transform: scale(1.06, 0.94) rotate(2deg); opacity: 0.95; }',
	'}',
	'@media (prefers-reduced-motion: reduce) {',
	'  .torch-flame { animation: none; }',
	'}',
	'.torch-title { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: 0.02em; }',
	'.torch-reading { margin: 0; font-size: 12px; color: var(--widget-text, #f2e8d8); opacity: 0.8; }',
	'.torch-meter { width: 100%; max-width: 190px; height: 6px; border-radius: 999px; background: rgba(255, 255, 255, 0.16); overflow: hidden; }',
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
	'  var fill = root.querySelector("[data-fill]");',
	'  var title = root.querySelector("[data-title]");',
	'  var reading = root.querySelector("[data-reading]");',
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
	'    var word = WORDS[Math.min(WORDS.length - 1, Math.floor((intensity - 1) / 3))];',
	'    reading.textContent = word + " · " + intensity + " of 10";',
	'  }',
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
				{ name: 'flame', value: '#ffb347', description: 'The top of the flame.' },
				{ name: 'ember', value: '#d2461a', description: 'The base of the flame.' },
				{ name: 'glow', value: '#3a2412', description: 'The light the torch casts.' },
				{ name: 'surface', value: '#14100c', description: 'The card behind the flame.' },
				{ name: 'text', value: '#f2e8d8', description: 'Label colour.' },
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
			defaultSize: { width: 260, height: 220 },
			minSize: { width: 200, height: 180 },
		}),
};
