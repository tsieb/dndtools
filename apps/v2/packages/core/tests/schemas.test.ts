import { describe, expect, it } from 'vitest';
import {
	createSceneInputSchema,
	moveWidgetInputSchema,
	sceneStateSchema,
} from '../src';

describe('Strict schemas reject unknown fields and bad payloads', () => {
	it('rejects unknown fields on createSceneInput payload', () => {
		const parsed = createSceneInputSchema.safeParse({ name: 'ok', bogus: true });
		expect(parsed.success).toBe(false);
	});

	it('requires positive width/height on move-widget input is not enforced (allowed deltas) — but resize is positive', () => {
		const ok = moveWidgetInputSchema.safeParse({
			sceneId: 's',
			widgetInstanceId: 'w',
			x: 0,
			y: -10,
		});
		expect(ok.success).toBe(true);
	});

	it('SceneState shape validates an empty document', () => {
		const parsed = sceneStateSchema.safeParse({ scenes: {}, schemaVersion: 1 });
		expect(parsed.success).toBe(true);
	});
});
