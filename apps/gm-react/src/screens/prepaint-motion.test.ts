import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `public/prepaint.js` runs before the bundle, so it cannot import anything and cannot be unit
 * tested by calling it. It is scanned instead — the same shape `screen-kit-loading-region.test.tsx`
 * uses — because the defect it encodes is a one-token regression that nothing else can catch.
 *
 * `import.meta.url` resolves against the DOCUMENT url under vitest's jsdom environment, so the path
 * must be built from `process.cwd()` (the app vitest project runs from the repo root).
 */
const APP = `${process.cwd()}/apps/gm-react`;
// Comment lines are stripped: this file's own prose quotes the defective expression verbatim, and a
// scan that matched it would fail on the fixed source.
const SRC = readFileSync(`${APP}/public/prepaint.js`, 'utf8')
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

// RC-DSN-1.3 — the motion vocabulary that the attribute above switches off. Like prepaint, CSS fails
// silently: a keyframe whose end frame is not the resting state still "works" at full motion and only
// strands content half-faded once reduced motion collapses it, and a timing token written as a
// literal simply never collapses. So the stylesheets are scanned too. Comments are stripped because
// their prose names tokens and selectors.
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const INDEX_CSS = stripComments(readFileSync(`${APP}/src/styles/index.css`, 'utf8'));
const SPACING_CSS = stripComments(readFileSync(`${APP}/src/styles/tokens/spacing.css`, 'utf8'));

const VOCABULARY = ['fade-in', 'rise', 'sheet-slide', 'shimmer', 'pulse'] as const;

/** Body of a top-level rule; in these files every top-level rule closes on a `}` at column 0. */
function block(css: string, head: string): string {
	const match = new RegExp(`(?:^|\\n)${head}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css);
	if (!match) throw new Error(`no top-level block matching ${head}`);
	return match[1]!;
}

/** Body of one keyframe selector (`to`, `0%,\s*100%`, …) inside a @keyframes body. */
function frame(keyframes: string, selector: string): string {
	const match = new RegExp(`(?:^|\\n)\\s*${selector}\\s*\\{([^}]*)\\}`).exec(keyframes);
	if (!match) throw new Error(`no ${selector} frame`);
	return match[1]!;
}

function declarations(body: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
	return out;
}

const ROOT = declarations(block(SPACING_CSS, ':root'));
const REDUCED = declarations(
	block(SPACING_CSS, "\\[data-motion='reduced'\\],\\s*\\[data-motion='none'\\]"),
);

describe('the motion vocabulary is one set of named, reusable transitions', () => {
	it.each(VOCABULARY)('%s is a keyframe, a timing token, and a class that joins them', (name) => {
		expect(INDEX_CSS).toMatch(new RegExp(`@keyframes motion-${name}\\s*\\{`));
		expect(ROOT.has(`--motion-${name}`), `--motion-${name} in spacing.css :root`).toBe(true);
		expect(block(INDEX_CSS, `\\.motion-${name}`)).toMatch(
			new RegExp(`animation:\\s*motion-${name}\\s+var\\(--motion-${name}\\)`),
		);
	});

	it('entrances end on the resting frame, so a collapsed run lands where the content belongs', () => {
		const resting: Record<string, string[]> = {
			'fade-in': ['opacity: 1;'],
			rise: ['opacity: 1;', 'transform: none;'],
			'sheet-slide': ['transform: none;'],
		};
		for (const [name, expected] of Object.entries(resting)) {
			const end = frame(block(INDEX_CSS, `@keyframes motion-${name}`), 'to');
			for (const decl of expected) expect(end, `motion-${name} end frame`).toContain(decl);
		}
	});

	it('the pulse starts and ends on its resting frame, so reduced motion leaves it static', () => {
		expect(frame(block(INDEX_CSS, '@keyframes motion-pulse'), '0%,\\s*100%')).toContain(
			'opacity: 1;',
		);
	});
});

describe('every named transition collapses under reduced motion', () => {
	it.each(VOCABULARY)(
		'--motion-%s is timed by a duration token that reduced motion zeroes',
		(name) => {
			const timing = ROOT.get(`--motion-${name}`) ?? '';
			const parts = /^var\((--duration-[a-z-]+)\) var\((--easing-[a-z]+)\)$/.exec(timing);
			expect(parts, `--motion-${name}: ${timing}`).not.toBeNull();
			const [, duration, easing] = parts!;
			expect(ROOT.get(duration!), `${duration} must be declared`).toBeDefined();
			expect(REDUCED.get(duration!), `${duration} under reduced motion`).toBe('0ms');
			expect(easing, 'the spring is reserved for dice and celebration').not.toBe('--easing-spring');
		},
	);

	it('zeroes every non-zero duration token, loop periods included', () => {
		const durations = [...ROOT].filter(([k, v]) => k.startsWith('--duration-') && v !== '0ms');
		expect(durations.length).toBeGreaterThan(5);
		for (const [token] of durations) expect(REDUCED.get(token), token).toBe('0ms');
	});

	it('clamps every animation and transition, including pseudo-elements, for reduced AND none', () => {
		// The tokens only reach animations that read them; this rule catches the DS components that
		// still inline their own keyframes with literal timings.
		const rule =
			/((?:\[data-motion='(?:reduced|none)'\] \*(?:::before|::after)?,?\s*)+)\{([^}]*)\}/.exec(
				INDEX_CSS,
			);
		expect(rule).not.toBeNull();
		const selectors = rule![1]!.split(',').map((s) => s.trim());
		for (const mode of ['reduced', 'none']) {
			for (const target of ['*', '*::before', '*::after']) {
				expect(selectors).toContain(`[data-motion='${mode}'] ${target}`);
			}
		}
		expect(rule![2]).toContain('animation-duration: 0.001ms !important;');
		expect(rule![2]).toContain('animation-iteration-count: 1 !important;');
		expect(rule![2]).toContain('transition-duration: 0.001ms !important;');
	});
});

describe('--easing-spring stays reserved for dice and celebration surfaces', () => {
	// The spring overshoots, which reads as play on a crit and as a glitch on a menu. These are the
	// files RC-SES-2.4 (dice drama) owns; extend the list only for another dice or celebration surface.
	const ALLOWED = [
		'ds/components/domain/DiceResult.jsx',
		'screens/session/DiceTray.tsx',
		'app/session/QuickPanel.tsx',
	];

	function walk(dir: string, out: string[] = []): string[] {
		for (const entry of readdirSync(dir)) {
			const full = join(dir, entry);
			if (statSync(full).isDirectory()) walk(full, out);
			else out.push(full);
		}
		return out;
	}

	it('is declared once and referenced only from the allowed files', () => {
		expect(ROOT.get('--easing-spring')).toMatch(/^cubic-bezier\(/);
		const root = `${APP}/src/`;
		const users = walk(root)
			.filter((f) => /\.(css|ts|tsx|js|jsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f))
			.filter((f) => readFileSync(f, 'utf8').includes('var(--easing-spring'))
			.map((f) => f.slice(root.length));
		expect(users.filter((f) => !ALLOWED.includes(f))).toEqual([]);
	});
});
