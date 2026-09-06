import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural guards for two feedback defects that cannot be reproduced from the outside.
 *
 * - A REPEATED IDENTICAL FAILURE. `/board` and `/scene/:id` render their rejection text inside a
 *   `role="alert"`, which announces on INSERTION — and `setError(sameString)` is an `Object.is`
 *   bail-out, so React re-rendered nothing and the second, third and fourth identical failure were
 *   silent. Reaching it needs a persist failure (an IndexedDB quota error), which no e2e profile can
 *   provoke, so the guard is on the shape: clear the message BEFORE the attempt.
 * - A BAD DICE ROLL IS NOT A SYSTEM FAILURE. In `/play` the `error` toast status is what selects
 *   `role="alert" aria-live="assertive"` AND excludes the message from the persistent polite region,
 *   so "Natural 1 — critical miss" interrupted a screen reader mid-sentence wearing the red failure
 *   skin. It needs an actual natural 1 to observe.
 *
 * `import.meta.url` resolves against the DOCUMENT url under vitest's jsdom, so build every path from
 * `process.cwd()` (the app project runs from the repo root) instead.
 */

const SRC = join(process.cwd(), 'apps', 'gm-react', 'src');

/** Source with `//` comment lines stripped — otherwise an explanatory comment matches the scan. */
function code(...segments: string[]): string {
	return readFileSync(join(SRC, ...segments), 'utf8')
		.split('\n')
		.filter((line) => !line.trim().startsWith('//'))
		.join('\n');
}

describe('a repeated identical failure re-announces', () => {
	// RC-STB-2.6 split SceneEditor.tsx into screens/sceneEditor/; the dispatch helper lives in its
	// index. Paths, not bare file names, so a later split re-points here rather than silently passing.
	for (const screen of ['Board.tsx', 'sceneEditor/index.tsx']) {
		it(`${screen}'s dispatch helper clears its alert before the attempt`, () => {
			const source = code('screens', screen);
			const helper = /async function dispatch\([\s\S]*?\n\t\}\n/.exec(source)?.[0];
			expect(helper, `no dispatch helper found in ${screen}`).toBeTruthy();
			// The very first statement of the body resets the live region, so the failure path always
			// removes and re-inserts the alert node rather than writing an identical string into it.
			const body = helper!.slice(helper!.indexOf('{') + 1).trimStart();
			expect(body.startsWith('setError(null);')).toBe(true);
			// …and the failure paths still set it.
			expect(helper).toMatch(/setError\(PERSIST_FAILED\)/);
			expect(helper).toMatch(/setError\(widgetRejectionMessage/);
		});
	}
});

describe('/play announces a bad roll politely', () => {
	// RC-STB-2.2 split PlayerView.tsx into screens/play/: the roll toasts are raised by the frame and
	// the tone table lives in the folder's shared vocabulary. Paths, not bare file names, so a later
	// split re-points here rather than silently passing.
	const source = code('screens', 'play', 'Frame.tsx');
	const shared = code('screens', 'play', 'shared.tsx');

	it('does not raise a critical miss as an assertive error', () => {
		const critMiss = /toast\('Natural 1[^)]*\)/.exec(source)?.[0];
		expect(critMiss, 'the critical-miss toast is gone — re-point this guard').toBeTruthy();
		expect(critMiss).not.toMatch(/'error'/);
		expect(critMiss).toMatch(/'warning'/);
	});

	it('has a warning tone to raise it with', () => {
		// `TOAST_TONE[status] || TOAST_TONE.neutral` degrades an unknown status to a plain grey card
		// silently, so the tone table has to actually carry the key the caller asks for.
		const table = /const TOAST_TONE[\s\S]*?\n\};/.exec(shared)?.[0] ?? '';
		expect(table).toMatch(/\bwarning: \{/);
		expect(table).toMatch(/--color-status-warning-border/);
	});
});
