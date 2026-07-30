// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VisibilityChip as RawVisibilityChip } from './VisibilityChip.jsx';

// The DS ships as .jsx with `checkJs: false`, so tsc infers every prop that has no default as
// required. Re-type the import as an open prop bag rather than restating the component's contract.
const VisibilityChip = RawVisibilityChip as React.ComponentType<Record<string, unknown>>;

// The visibility chip is the product's safety-critical cue: a DM reads it to know what players can
// see. Its `levels` map is keyed on CHIP level names, but call sites sometimes hold a RAW core
// visibility value ('shared' / 'player-visible'). Those used to miss the map and fall through to the
// `dm-only` default — so a shared entity announced itself as a red "DM ONLY", the exact inverse of
// the truth (seen on the CharBuilder review step for every new PC).

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

// Read the level off the chip's own VISIBLE text. This used to read `title`, but a non-compact chip
// no longer carries one: naming the icon AND rendering the same string AND repeating it in `title`
// made the app's most-used safety chip announce "DM only DM only" and put a tooltip over text that
// was already on screen. In compact mode there is no text, so the icon keeps the name — asserted
// separately in ds-interaction-fixes.test.tsx.
function labelFor(level: string): string {
	act(() => root.render(<VisibilityChip level={level} />));
	return container.firstElementChild?.textContent ?? '';
}

describe('VisibilityChip', () => {
	it('renders the chip levels it declares', () => {
		expect(labelFor('dm-only')).toBe('DM only');
		expect(labelFor('players')).toBe('Players');
		expect(labelFor('hidden')).toBe('Hidden');
		expect(labelFor('mixed')).toBe('Mixed');
	});

	it('does not report a shared entity as DM only', () => {
		expect(labelFor('shared')).not.toBe('DM only');
		expect(labelFor('shared')).toBe('Players');
	});

	it('normalizes the raw core "player-visible" value', () => {
		expect(labelFor('player-visible')).toBe('Players');
	});

	// Failing CLOSED is the right default for an unknown value — over-reporting exposure is the
	// dangerous direction, so anything unrecognized must still read as DM only.
	it('falls back to DM only for an unrecognized level', () => {
		expect(labelFor('not-a-level')).toBe('DM only');
	});
});
