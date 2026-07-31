import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isWidgetResizable } from './board-helpers';

/**
 * The scene canvas and the scene Inspector both offer to change a widget's size, and they used to
 * disagree about which widgets may be resized. `SceneBoardCanvas` paints a padlock, renders no resize
 * handle and swallows Shift+Arrow for `system`-tier instances — which is EVERY widget the app ships,
 * since `packages/core/src/state/widget-package-state.ts` mints all of the built-ins through one
 * `systemWidget()` factory. The Inspector's S/M/L buttons had no such gate, and
 * `commands/widget.ts handleResizeWidget` has no tier gate either, so they really did resize. The DM
 * was told the widget was locked and then discovered by accident that it was not.
 *
 * `isWidgetResizable` is now the single predicate both surfaces ask.
 */
describe('one predicate decides whether a widget can be resized', () => {
	it('locks system-tier widgets', () => {
		expect(isWidgetResizable({ tier: 'system' })).toBe(false);
	});

	it('leaves every other tier resizable', () => {
		for (const tier of ['template', 'custom', 'ai'] as const) {
			expect(isWidgetResizable({ tier })).toBe(true);
		}
	});
});

describe('both size affordances ask the same predicate', () => {
	// A structural scan, because the two surfaces are far apart and the failure mode is precisely
	// that one of them stops asking. `import.meta.url` resolves against the DOCUMENT url under
	// vitest's jsdom environment, so build the path from process.cwd() (the app project runs from
	// the repo root).
	const read = (rel: string) =>
		readFileSync(join(process.cwd(), 'apps/gm-react/src', rel), 'utf8')
			.split('\n')
			.filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
			.join('\n');

	it('the canvas derives `resizable` from it', () => {
		const src = read('app/SceneBoardCanvas.tsx');
		expect(src).toMatch(/isWidgetResizable\(w\)/);
		// And the old inline duplicate is gone, so the rule cannot drift in one place only.
		expect(src).not.toMatch(/w\.tier !== 'system'/);
	});

	it('the Inspector gates its Size buttons on it', () => {
		const src = read('screens/SceneEditor.tsx');
		expect(src).toMatch(/const resizable = isWidgetResizable\(widget\)/);
		expect(src).toMatch(/\{resizable \?/);
	});
});
