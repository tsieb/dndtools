import type { GeneratorDefinition, GeneratorGroup, GeneratorScale, ParamValue } from './types';
import type { MapGeneratorRegistry } from '../commands/types';
import { DUNGEON_GENERATORS } from './dungeon';
import { CAVE_GENERATORS } from './cave';
import { SCATTER_GENERATORS } from './scatter';
import { worldContinent } from './world';
import { cityGenerator, villageGenerator } from './city';
import { wildernessGenerator, hexcrawlGenerator } from './region';

/**
 * MAP-021 — the generator registry.
 *
 * One flat, ordered list is the whole registry. The editor renders its generator picker, every
 * parameter control, and every preset chip from this data alone, so shipping a new generator is a
 * pure-core change: add it here and it appears in the UI, fully formed, with zero UI code written.
 *
 * Order matters — it is the order the picker lists them in, within each group. Within a group the
 * flagship goes first (the one a user who does not yet know the difference should get by default).
 */
export const GENERATORS: readonly GeneratorDefinition[] = Object.freeze([
	// Battle scale — the map you put on the table tonight.
	...DUNGEON_GENERATORS,
	...CAVE_GENERATORS,
	// Settlement scale.
	cityGenerator,
	villageGenerator,
	// Region + world scale — the map you make between sessions.
	wildernessGenerator,
	hexcrawlGenerator,
	worldContinent,
	// Utilities that decorate an existing map rather than creating one.
	...SCATTER_GENERATORS,
]);

const BY_ID: ReadonlyMap<string, GeneratorDefinition> = new Map(
	GENERATORS.map((definition) => [definition.id, definition]),
);

/** Look up a generator by id. Returns undefined for an unknown id — callers must fail closed. */
/**
 * The registry as the reducer consumes it (`CoreEnvironment.mapGenerators`). Hosts load this module
 * on demand — it is the `@dndtools/core/map-generators` entry — and pass this object through.
 */
export const MAP_GENERATOR_REGISTRY: MapGeneratorRegistry = Object.freeze({
	getGenerator: (id: string) => getGenerator(id),
});

export function getGenerator(id: string): GeneratorDefinition | undefined {
	return BY_ID.get(id);
}

export function generatorsByGroup(group: GeneratorGroup): readonly GeneratorDefinition[] {
	return GENERATORS.filter((definition) => definition.group === group);
}

/**
 * RC-MAP-3.5 — true whether every param that differs between `prev` and `next` is declared
 * `applies: 'immediate'` on `definition`. The live-preview caller uses this to tell a knob that only
 * re-thresholds the current output (sea level, size variation) from one that reseeds it (density,
 * object kind): a run triggered by an immediate-only diff may be coalesced to the display's frame
 * budget (`widget-update`, <= 100ms p95) without dropping a regenerate-required edit on the floor.
 * An unknown/removed param id is treated as NOT immediate — fail closed to the safe (always re-run)
 * path rather than silently skip a full regenerate.
 */
export function isImmediateParamChange(
	definition: GeneratorDefinition,
	prev: Readonly<Record<string, ParamValue>>,
	next: Readonly<Record<string, ParamValue>>,
): boolean {
	const specById = new Map(definition.params.map((spec) => [spec.id, spec]));
	const ids = new Set([...Object.keys(prev), ...Object.keys(next)]);
	let changed = false;
	for (const id of ids) {
		if (Object.is(prev[id], next[id])) continue;
		changed = true;
		const spec = specById.get(id);
		if (!spec || spec.applies !== 'immediate') return false;
	}
	return changed;
}

export function generatorsByScale(scale: GeneratorScale): readonly GeneratorDefinition[] {
	return GENERATORS.filter((definition) => definition.scale === scale);
}

/**
 * Human-facing group metadata for the picker. Kept next to the registry so a new group cannot be
 * added without also giving it a label and a description a user can act on.
 */
export const GENERATOR_GROUPS: ReadonlyArray<{
	id: GeneratorGroup;
	label: string;
	description: string;
}> = Object.freeze([
	{ id: 'dungeon', label: 'Dungeons', description: 'Rooms and corridors — built structures.' },
	{ id: 'cave', label: 'Caves', description: 'Natural, organic spaces carved from rock.' },
	{
		id: 'settlement',
		label: 'Settlements',
		description: 'Cities and villages, with streets and buildings.',
	},
	{ id: 'region', label: 'Regions', description: 'The land between towns — a few days across.' },
	{ id: 'world', label: 'Worlds', description: 'Continents, coastlines, kingdoms.' },
	{ id: 'scatter', label: 'Scatter', description: 'Decorate an existing map with objects.' },
	{ id: 'structure', label: 'Structures', description: 'Single buildings and interiors.' },
]);
