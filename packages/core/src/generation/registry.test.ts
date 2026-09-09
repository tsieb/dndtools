import { describe, expect, it } from 'vitest';
import { getGenerator, isImmediateParamChange } from './registry';

describe('isImmediateParamChange', () => {
	const scatterProps = getGenerator('scatter.props');
	if (!scatterProps) throw new Error('scatter.props generator missing from registry');

	it('is true when only immediate-tagged params differ', () => {
		// sizeVariation is declared `applies: 'immediate'` on scatter.props.
		expect(
			isImmediateParamChange(scatterProps, { sizeVariation: 0.2 }, { sizeVariation: 0.8 }),
		).toBe(true);
	});

	it('is false when a regenerate-required param also differs', () => {
		expect(
			isImmediateParamChange(
				scatterProps,
				{ sizeVariation: 0.2, density: 0.4 },
				{ sizeVariation: 0.8, density: 0.6 },
			),
		).toBe(false);
	});

	it('is false when nothing changed', () => {
		expect(
			isImmediateParamChange(scatterProps, { sizeVariation: 0.2 }, { sizeVariation: 0.2 }),
		).toBe(false);
	});

	it('fails closed on an unknown param id', () => {
		expect(isImmediateParamChange(scatterProps, { unknownParam: 1 }, { unknownParam: 2 })).toBe(
			false,
		);
	});

	it('is false for the world generator, which declares no immediate params', () => {
		const world = getGenerator('world.continent');
		if (!world) throw new Error('world.continent generator missing from registry');
		const seaLevelParam = world.params.find((p) => p.id === 'seaLevel');
		if (!seaLevelParam) throw new Error('world.continent has no seaLevel param to test against');
		expect(isImmediateParamChange(world, { seaLevel: 0.3 }, { seaLevel: 0.5 })).toBe(false);
	});
});
