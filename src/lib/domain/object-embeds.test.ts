import { describe, expect, it } from 'vitest';
import {
	extractObjectEmbeds,
	formatObjectEmbed,
	isObjectEmbedToken,
	parseEmbedRenderOptions,
} from '$lib/domain/object-embeds.js';

describe('object-embeds', () => {
	it('formats object embeds using id-based protocol', () => {
		expect(formatObjectEmbed('obj-123', 'Goblin')).toBe('[[obj:obj-123|Goblin]]');
		expect(formatObjectEmbed('obj-123')).toBe('[[obj:obj-123]]');
		expect(formatObjectEmbed('obj-123', 'Goblin', { view: 'card', open: true })).toBe(
			'[[obj:obj-123|Goblin|view=card,open=true]]',
		);
	});

	it('extracts both legacy and id-based object embeds', () => {
		const content = [
			'![[obj:stat_block:goblin-1|Goblin Scout]]',
			'[[obj:obj-2|Sildar]]',
			'[[obj:obj-3]]',
		].join('\n');

		const embeds = extractObjectEmbeds(content);
		expect(embeds).toHaveLength(3);
		expect(embeds[0]).toMatchObject({ type: 'stat_block', id: 'goblin-1', label: 'Goblin Scout' });
		expect(embeds[1]).toMatchObject({ type: undefined, id: 'obj-2', label: 'Sildar' });
		expect(embeds[2]).toMatchObject({ type: undefined, id: 'obj-3' });
	});

	it('recognizes object embed tokens', () => {
		expect(isObjectEmbedToken('[[obj:obj-7|Aria]]')).toBe(true);
		expect(isObjectEmbedToken('![[obj:character:obj-7|Aria]]')).toBe(true);
		expect(isObjectEmbedToken('[[Phandalin]]')).toBe(false);
	});

	it('parses embed render options', () => {
		expect(parseEmbedRenderOptions('view=inline,open=true,maxDepth=4')).toEqual({
			view: 'inline',
			open: true,
			maxDepth: 4,
		});
	});
});
