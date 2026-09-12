// @vitest-environment jsdom

import type React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DiceResult as RawDiceResult } from './DiceResult.jsx';

/**
 * RC-SES-2.4 — dice drama. A natural high goes gold, pops on the spring and sweeps a gold sheen; a
 * natural low goes red and pulses; anything else is the clean chip. Under reduced motion the chip
 * must come to rest on the static gold (or red) border with nothing left moving.
 *
 * The VISUAL SNAPSHOT is of what paints each chip — its own style attribute, the headline's, and the
 * keyframes it ships — rather than a pixel image. The markup is rendered to a string and parsed back
 * so every declaration is read exactly as React wrote it: jsdom's CSSOM silently drops values it
 * cannot parse (a `var()` inside `animation`, `color-mix()`), which would hide the very properties
 * this story is about. The browser half — computed styles and running animations with the app-wide
 * reduced-motion clamp applied — is `tests/e2e/dice-tray.spec.ts`.
 */

type DsProps = Record<string, unknown>;
const DiceResult = RawDiceResult as React.ComponentType<DsProps>;

const NAT_20 = { notation: '1d20', total: 20, rolls: [20], crit: 'success', critNatural: 20 };
const NAT_1 = { notation: '1d20', total: 1, rolls: [1], crit: 'fail', critNatural: 1 };
const PLAIN = { notation: '1d20', total: 13, rolls: [13] };

function chip(props: DsProps): HTMLElement {
	const host = document.createElement('div');
	host.innerHTML = renderToStaticMarkup(<DiceResult {...props} />);
	return host.querySelector('[role="group"]') as HTMLElement;
}

const styleOf = (el: Element | null | undefined) => el?.getAttribute('style') ?? '';

/** Everything that paints the chip, as written. */
function visual(el: HTMLElement) {
	const headline = [...el.querySelectorAll('span')].find((s) => styleOf(s).includes('--text-2xl'));
	// The readout text without the shipped keyframes (already under `keyframes`).
	const shown = el.cloneNode(true) as HTMLElement;
	shown.querySelectorAll('style').forEach((node) => node.remove());
	return {
		drama: el.getAttribute('data-drama'),
		mode: el.getAttribute('data-drama-mode'),
		chip: styleOf(el),
		headline: styleOf(headline),
		keyframes: el.querySelector('style')?.textContent ?? null,
		text: shown.textContent,
	};
}

describe('dice drama — visual snapshot', () => {
	const CASES = [
		['natural 20', NAT_20],
		['natural 1', NAT_1],
		['plain roll', PLAIN],
	] as const;

	it.each(CASES)('%s, as it lands (drama="play")', (_, props) => {
		expect(visual(chip({ ...props, drama: 'play' }))).toMatchSnapshot();
	});

	it.each(CASES)('%s, at rest (drama="static")', (_, props) => {
		expect(visual(chip({ ...props, drama: 'static' }))).toMatchSnapshot();
	});

	it('a natural 20 is gold and pops on --easing-spring while the sheen sweeps', () => {
		const el = chip({ ...NAT_20, drama: 'play' });
		const style = styleOf(el);
		expect(el.getAttribute('data-drama')).toBe('crit');
		expect(style).toContain('border:1px solid var(--color-accent)');
		expect(style).toContain('dndDicePop var(--motion-dice-pop) var(--easing-spring) both');
		expect(style).toContain('dndDiceSheen var(--motion-dice-sheen)');
		expect(visual(el).headline).toContain('color:var(--color-accent)');
		expect(el.textContent).toContain('Natural 20');
	});

	it('a natural 1 is red and pulses', () => {
		const el = chip({ ...NAT_1, drama: 'play' });
		expect(el.getAttribute('data-drama')).toBe('fumble');
		expect(styleOf(el)).toContain('border:1px solid var(--color-status-error-text)');
		expect(styleOf(el)).toContain('dndDicePulse var(--motion-dice-pulse)');
		expect(styleOf(el)).not.toContain('--easing-spring');
	});

	it('any other roll is the clean chip, even while playing', () => {
		const el = chip({ ...PLAIN, drama: 'play' });
		expect(el.getAttribute('data-drama')).toBe('plain');
		expect(styleOf(el)).toContain('border:1px solid var(--color-border)');
		expect(styleOf(el)).not.toContain('animation');
		expect(el.querySelector('style')).toBeNull();
	});

	it('without `drama` a crit keeps the quiet log colours and never animates', () => {
		const el = chip(NAT_20);
		expect(el.hasAttribute('data-drama')).toBe(false);
		expect(styleOf(el)).toContain('border:1px solid var(--color-status-success-text)');
		expect(styleOf(el)).not.toContain('animation');
		expect(el.querySelector('style')).toBeNull();
	});
});

// The drama is stilled by two things it does not own: the duration tokens zeroing under
// `[data-motion='reduced'|'none']` (spacing.css) and index.css clamping every animation to ~0ms and
// one iteration (pinned by prepaint-motion.test.ts). Both only help if the drama is timed by those
// tokens and every keyframe ENDS on the resting frame, which is what is checked here.
const APP = `${process.cwd()}/apps/gm-react`;
const SPACING_CSS = readFileSync(`${APP}/src/styles/tokens/spacing.css`, 'utf8').replace(
	/\/\*[\s\S]*?\*\//g,
	'',
);

function declarations(head: string): Map<string, string> {
	const body = new RegExp(`(?:^|\\n)${head}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(SPACING_CSS)?.[1] ?? '';
	const out = new Map<string, string>();
	for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
	return out;
}

const ROOT = declarations(':root');
const REDUCED = declarations("\\[data-motion='reduced'\\],\\s*\\[data-motion='none'\\]");

/** One frame's declarations inside one `@keyframes` rule of the shipped keyframe text. */
function frame(css: string, name: string, selector: string): string {
	const body = new RegExp(`@keyframes ${name}\\{((?:[^{}]*\\{[^}]*\\})*)\\}`).exec(css)?.[1] ?? '';
	return new RegExp(`(?:^|\\})${selector}\\{([^}]*)\\}`).exec(body)?.[1] ?? '';
}

describe('dice drama under reduced motion', () => {
	it('is timed only by duration tokens that reduced motion zeroes', () => {
		for (const props of [NAT_20, NAT_1]) {
			const animation = /animation:([^;]+)/.exec(styleOf(chip({ ...props, drama: 'play' })))![1]!;
			const tokens = [...animation.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]!);
			const timings = tokens.filter((t) => t.startsWith('--motion-dice-') && !t.endsWith('-count'));
			expect(timings.length).toBeGreaterThan(0);
			for (const token of timings) {
				const durations = [...(ROOT.get(token) ?? '').matchAll(/var\((--duration-[a-z-]+)\)/g)];
				expect(durations, `${token} is built from one duration token`).toHaveLength(1);
				expect(REDUCED.get(durations[0]![1]!), `${durations[0]![1]} under reduced motion`).toBe(
					'0ms',
				);
			}
			// No literal durations: every time value in the shorthand arrives through a token.
			expect(animation).not.toMatch(/\d(ms|s)\b/);
		}
	});

	it('every keyframe ends on the resting frame, so a collapsed run leaves the chip still', () => {
		const el = chip({ ...NAT_20, drama: 'play' });
		const keyframes = el.querySelector('style')!.textContent!;
		expect(frame(keyframes, 'dndDicePop', 'to')).toBe('transform:none');
		// The sheen ends exactly where it rests: painted past the chip's right edge.
		const rest = /background-position:([^;]+)/.exec(styleOf(el))![1];
		expect(frame(keyframes, 'dndDiceSheen', 'to')).toBe(`background-position:${rest}`);
		expect(frame(keyframes, 'dndDicePulse', '0%,100%')).toBe('box-shadow:0 0 0 0 transparent');
	});

	it('the resting frame alone still reads as a natural 20: static gold border and fill, in words', () => {
		for (const drama of ['play', 'static']) {
			const style = styleOf(chip({ ...NAT_20, drama }));
			expect(style).toContain('border:1px solid var(--color-accent)');
			expect(style).toContain('background-color:var(--color-accent-subtle)');
		}
		const resting = chip({ ...NAT_20, drama: 'static' });
		expect(styleOf(resting)).not.toContain('animation');
		expect(resting.textContent).toContain('Natural 20');
		const fumble = chip({ ...NAT_1, drama: 'static' });
		expect(styleOf(fumble)).toContain('border:1px solid var(--color-status-error-text)');
		expect(styleOf(fumble)).not.toContain('animation');
	});
});
