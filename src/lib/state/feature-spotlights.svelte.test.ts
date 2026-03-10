import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSpotlightForFeature } from '$lib/domain/feature-spotlights.js';

const persisted: { seenSpotlights: unknown } = { seenSpotlights: [] };
const getSetting = vi.fn(async (key: string) => {
	if (key === 'seenSpotlights') return persisted.seenSpotlights;
	return null;
});
const setSetting = vi.fn(async (_key: string, value: unknown) => {
	persisted.seenSpotlights = value;
});

vi.mock('$lib/platform/storage/index.js', () => ({
	getStorage: () => ({
		getSetting,
		setSetting,
	}),
}));

describe('featureSpotlightsState', () => {
	beforeEach(() => {
		persisted.seenSpotlights = [];
		getSetting.mockClear();
		setSetting.mockClear();
		vi.resetModules();
	});

	it('loads and normalizes seen spotlight ids from storage', async () => {
		persisted.seenSpotlights = [
			' feature-spotlight:object_notes ',
			'',
			12,
			'feature-spotlight:object_notes',
		];
		const { featureSpotlightsState } = await import('./feature-spotlights.svelte.js');
		await featureSpotlightsState.loadFromStorage();

		expect(featureSpotlightsState.loaded).toBe(true);
		expect(featureSpotlightsState.seenIds).toEqual(['feature-spotlight:object_notes']);
		expect(getSetting).toHaveBeenCalledWith('seenSpotlights');
	});

	it('queues and activates a feature spotlight when a target selector is available', async () => {
		const { featureSpotlightsState } = await import('./feature-spotlights.svelte.js');
		await featureSpotlightsState.loadFromStorage();
		featureSpotlightsState.queueForFeature('mcp_staged_review');

		featureSpotlightsState.showNext((selectors) => selectors[0] ?? null);
		expect(featureSpotlightsState.active?.featureId).toBe('mcp_staged_review');
		expect(featureSpotlightsState.queuedIds).toHaveLength(0);
	});

	it('marks active spotlight as seen on dismiss and persists ids', async () => {
		const { featureSpotlightsState } = await import('./feature-spotlights.svelte.js');
		await featureSpotlightsState.loadFromStorage();
		featureSpotlightsState.queueForFeature('object_notes');
		featureSpotlightsState.showNext((selectors) => selectors[0] ?? null);

		const activeId = featureSpotlightsState.active?.id;
		expect(activeId).toBe(getSpotlightForFeature('object_notes')?.id);
		await featureSpotlightsState.dismissActive();

		expect(featureSpotlightsState.active).toBeNull();
		expect(featureSpotlightsState.seenIds).toContain(String(activeId));
		expect(setSetting).toHaveBeenCalledWith('seenSpotlights', featureSpotlightsState.seenIds);
	});

	it('queues encounter-based spotlights only for enabled features', async () => {
		const { featureSpotlightsState } = await import('./feature-spotlights.svelte.js');
		await featureSpotlightsState.loadFromStorage();
		featureSpotlightsState.queueForEncounter(
			'/campaign/timeline',
			(featureId) => featureId === 'timeline',
		);

		expect(featureSpotlightsState.queuedIds).toEqual([
			String(getSpotlightForFeature('timeline')?.id),
		]);
	});
});
