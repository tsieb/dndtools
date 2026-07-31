import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * `public/prepaint.js` runs before the bundle, so it cannot import anything and cannot be unit
 * tested by calling it. It is scanned instead — the same shape `screen-kit-loading-region.test.tsx`
 * uses — because the defect it encodes is a one-token regression that nothing else can catch.
 *
 * `import.meta.url` resolves against the DOCUMENT url under vitest's jsdom environment, so the path
 * must be built from `process.cwd()` (the app vitest project runs from the repo root).
 */
// Comment lines are stripped: this file's own prose quotes the defective expression verbatim, and a
// scan that matched it would fail on the fixed source.
const SRC = readFileSync(`${process.cwd()}/apps/gm-react/public/prepaint.js`, 'utf8')
	.split('\n')
	.filter((line) => !line.trim().startsWith('//'))
	.join('\n');

describe('prepaint honours an explicit reduce-motion preference', () => {
	it('never lets the OS hint override a stored value', () => {
		// The old line was `pref === 'reduced' || osReduce ? 'reduced' : 'full'`, which DISCARDED a
		// stored 'full' on every reload. A user whose OS asks for reduced motion could turn the
		// Settings switch off, watch it work for the session, and find it back ON next launch — the
		// control lied about its own state, and Settings reads its state straight off this attribute
		// (`document.documentElement.getAttribute('data-motion')`), so the lie is self-reinforcing.
		expect(SRC).not.toMatch(/pref === 'reduced' \|\| osReduce/);
		expect(SRC).toContain("pref === 'full' ? 'full'");
	});

	it('still follows the OS when there is no stored preference', () => {
		// `null` must keep deferring to `prefers-reduced-motion`, so the out-of-the-box default for a
		// motion-sensitive user is unchanged.
		expect(SRC).toMatch(/osReduce \? 'reduced' : 'full'/);
	});

	it('keeps writing the attribute the app reads', () => {
		expect(SRC).toContain("setAttribute('data-motion'");
	});
});
