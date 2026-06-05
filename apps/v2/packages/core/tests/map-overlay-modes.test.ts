import { describe, expect, it } from 'vitest';
import {
	DEFAULT_MAP_OVERLAY_SETTINGS,
	configureOverlay,
	enterOverlayMode,
	type MapOverlaySettings,
} from '../src';

/**
 * MAP-014 — combat overlay MODE prerequisite gating. Entering a mode whose declared prerequisite
 * visual state is unmet is blocked with a reason UNLESS auto-satisfy is requested; the gate is
 * enforced fail-closed (no bypass), and a configuration change cannot leave the active mode
 * inconsistent.
 */

const STAMP = { actorId: 'actor-dm', now: '2026-06-04T00:00:00.000Z' };

function settings(overrides: Partial<MapOverlaySettings> = {}): MapOverlaySettings {
	return { ...DEFAULT_MAP_OVERLAY_SETTINGS, ...overrides };
}

describe('MAP-014 AC1 prerequisite-gated mode entry', () => {
	it('blocks grid-align mode with a reason when the grid is not visible', () => {
		const result = enterOverlayMode(settings({ gridVisible: false }), { mode: 'grid-align' }, STAMP);
		expect('error' in result).toBe(true);
		if ('error' in result) {
			expect(result.error.kind).toBe('prerequisite-unmet');
			expect(result.error.missing).toContain('grid-visible');
			expect(result.error.message).toMatch(/grid-visible/);
		}
	});

	it('enters grid-align mode when the grid is already visible', () => {
		const result = enterOverlayMode(settings({ gridVisible: true }), { mode: 'grid-align' }, STAMP);
		expect('settings' in result).toBe(true);
		if ('settings' in result) expect(result.settings.mode).toBe('grid-align');
	});

	it('auto-satisfies the prerequisite (enables grid visibility) when asked', () => {
		const result = enterOverlayMode(
			settings({ gridVisible: false }),
			{ mode: 'grid-align', autoSatisfyPrerequisites: true },
			STAMP,
		);
		expect('settings' in result).toBe(true);
		if ('settings' in result) {
			expect(result.settings.mode).toBe('grid-align');
			expect(result.settings.gridVisible).toBe(true);
		}
	});

	it('range mode requires BOTH a visible grid and tokens enabled', () => {
		const onlyGrid = enterOverlayMode(
			settings({ gridVisible: true, tokensEnabled: false }),
			{ mode: 'range' },
			STAMP,
		);
		expect('error' in onlyGrid).toBe(true);
		if ('error' in onlyGrid) expect(onlyGrid.error.missing).toEqual(['tokens-enabled']);

		const both = enterOverlayMode(
			settings({ gridVisible: true, tokensEnabled: true }),
			{ mode: 'range' },
			STAMP,
		);
		expect('settings' in both).toBe(true);
	});

	it('a prerequisite-free mode (token) always enters', () => {
		const result = enterOverlayMode(settings(), { mode: 'token' }, STAMP);
		expect('settings' in result).toBe(true);
	});
});

describe('MAP-014 AC2 the gate cannot be bypassed and config cannot break the active mode', () => {
	it('configuring grid off while in grid-align mode is blocked', () => {
		const inMode = settings({ mode: 'grid-align', gridVisible: true });
		const result = configureOverlay(inMode, { gridVisible: false }, STAMP);
		expect('error' in result).toBe(true);
		if ('error' in result && result.error.kind === 'prerequisite-unmet') {
			expect(result.error.missing).toContain('grid-visible');
		}
	});

	it('configuring grid off while NOT requiring it (token mode) is allowed', () => {
		const inMode = settings({ mode: 'token', gridVisible: true });
		const result = configureOverlay(inMode, { gridVisible: false }, STAMP);
		expect('settings' in result).toBe(true);
		if ('settings' in result) expect(result.settings.gridVisible).toBe(false);
	});

	it('rejects a non-positive grid size and units-per-cell fail-closed', () => {
		expect('error' in configureOverlay(settings(), { gridSize: 0 }, STAMP)).toBe(true);
		expect('error' in configureOverlay(settings(), { unitsPerCell: -1 }, STAMP)).toBe(true);
	});
});
