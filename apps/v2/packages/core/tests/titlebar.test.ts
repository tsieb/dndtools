import { describe, expect, it } from 'vitest';
import {
	DEFAULT_TITLEBAR_HEIGHT_PX,
	TITLEBAR_CHROME_BASELINE_PX,
	auditTitlebarTargets,
	titlebarControlsForState,
	type TitlebarTargetMeasurement,
} from '../src/index';

function visibleIds(state: Parameters<typeof titlebarControlsForState>[0]): string[] {
	return titlebarControlsForState(state)
		.filter((c) => c.visible)
		.map((c) => c.id);
}

describe('PLAT-002 AC2: titlebar controls reflect window state', () => {
	it('shows maximize (not restore) when the window is normal', () => {
		const ids = visibleIds('normal');
		expect(ids).toContain('maximize');
		expect(ids).not.toContain('restore');
		expect(ids).toContain('minimize');
		expect(ids).toContain('close');
	});

	it('shows restore (not maximize) when the window is maximized', () => {
		const ids = visibleIds('maximized');
		expect(ids).toContain('restore');
		expect(ids).not.toContain('maximize');
	});

	it('shows restore when fullscreen', () => {
		expect(visibleIds('fullscreen')).toContain('restore');
	});
});

describe('PLAT-002 AC3: titlebar target-size audit', () => {
	const goodSize = TITLEBAR_CHROME_BASELINE_PX + 4; // within titlebar height, above baseline

	function measurement(
		id: TitlebarTargetMeasurement['id'],
		width: number,
		height: number,
	): TitlebarTargetMeasurement {
		return { id, width, height };
	}

	it('passes when every control meets the baseline and fits the titlebar height', () => {
		const result = auditTitlebarTargets([
			measurement('minimize', goodSize, goodSize),
			measurement('maximize', goodSize, goodSize),
			measurement('close', goodSize, goodSize),
		]);
		expect(result.passed).toBe(true);
		expect(result.failures).toEqual([]);
	});

	it('fails a control whose hitbox is below the chrome baseline', () => {
		const result = auditTitlebarTargets([
			measurement('close', TITLEBAR_CHROME_BASELINE_PX - 1, goodSize),
		]);
		expect(result.passed).toBe(false);
		expect(result.failures[0]).toMatchObject({ id: 'close', reason: 'below-baseline' });
	});

	it('fails a control taller than the declared titlebar height', () => {
		const result = auditTitlebarTargets([
			measurement('maximize', goodSize, DEFAULT_TITLEBAR_HEIGHT_PX + 1),
		]);
		expect(result.passed).toBe(false);
		expect(result.failures[0]).toMatchObject({ id: 'maximize', reason: 'exceeds-titlebar-height' });
	});

	it('reports every offending control, not just the first', () => {
		const result = auditTitlebarTargets([
			measurement('minimize', 10, 10),
			measurement('maximize', goodSize, goodSize),
			measurement('close', goodSize, 100),
		]);
		expect(result.failures.map((f) => f.id).sort()).toEqual(['close', 'minimize']);
	});
});
