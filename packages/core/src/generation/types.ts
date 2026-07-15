import type { MapFeature, MapLayer, MapLayerCategory } from '../state/map-state';
import { normalizeMapLayer } from '../state/map-state';
import type { MapPoiCategory } from '../state/map-annotations';
import type { RngStreams } from '../state/prng';
import type { SceneVisibility } from '../state/scene-state';

/**
 * MAP-021 — the procedural generation registry contract.
 *
 * This module defines generators DECLARATIVELY: a generator publishes its parameters as data
 * ({@link ParamSpec}) rather than as a hand-written form. The editor renders the entire parameter UI
 * from that data, so adding a generator — or a knob to an existing one — costs zero UI code and
 * cannot drift out of sync with the algorithm that consumes it.
 *
 * Three properties of the param model are load-bearing for the UX, and each exists because a real tool
 * gets it wrong:
 *
 *   - `advanced` implements progressive disclosure. The 3–5 params a GM actually turns are primary;
 *     the long tail sits behind one disclosure with a COUNT and a LABEL (a disclosure with no
 *     information scent does not get opened).
 *   - `applies` splits knobs that take effect immediately from knobs that require a re-run. Ambiguity
 *     about whether a slider is about to destroy the map you just made is the central fear of every
 *     procgen UI; Azgaar's Options tab solves it by saying so explicitly, and so do we.
 *   - `label`/`help` name a knob by its EFFECT, never its mechanism. `extraConnectorChance` is
 *     "Loopiness"; `fillProbability` is "Cave openness". A GM is not tuning an algorithm, they are
 *     describing a place.
 *
 * Determinism (Contract 2) is inherited from {@link RngStreams}: a generator draws only from named
 * sub-streams of the root seed, so the same `{generatorId, seed, params}` produces byte-identical
 * output on every device, and tweaking one subsystem's params does not reshuffle the others.
 */

/** Which end of the scale ladder a generator serves. Drives grouping in the generator picker. */
export type GeneratorScale = 'battle' | 'region' | 'world';

export type GeneratorGroup =
	| 'dungeon'
	| 'cave'
	| 'settlement'
	| 'world'
	| 'region'
	| 'scatter'
	| 'structure';

export type ParamValue = number | string | boolean | readonly string[];

interface ParamSpecBase {
	/** Key in the params record. Part of the determinism contract — renaming one changes saved presets. */
	id: string;
	/** Human label, named for the knob's EFFECT ("Loopiness"), never its mechanism. */
	label: string;
	/** One line of information scent. Shown inline for primary params, on hover for advanced ones. */
	help?: string;
	/** When true, the knob lives behind the "Advanced" disclosure rather than on the primary surface. */
	advanced?: boolean;
	/** Accordion section this knob groups under in the panel (e.g. 'Rooms', 'Corridors', 'Water'). */
	group?: string;
	/**
	 * Whether changing this knob requires re-running the generator, or can be applied to the existing
	 * result in place. Defaults to 'regenerate'. Surfaced in the UI so the user always knows whether a
	 * drag is about to reroll their map.
	 */
	applies?: 'regenerate' | 'immediate';
}

export interface NumberParamSpec extends ParamSpecBase {
	kind: 'number' | 'int';
	min: number;
	max: number;
	step: number;
	default: number;
	/** Optional unit suffix rendered after the value ("ft", "%"). */
	unit?: string;
}

export interface BooleanParamSpec extends ParamSpecBase {
	kind: 'boolean';
	default: boolean;
}

export interface SelectParamSpec extends ParamSpecBase {
	kind: 'select';
	options: ReadonlyArray<{ value: string; label: string; help?: string }>;
	default: string;
}

/**
 * A multi-select set of thematic tags ("ruined", "flooded", "undead"). Watabou's lesson: a GM wants to
 * describe a place, not tune a number. Tags are the front door; the numeric params are the back one.
 */
export interface TagsParamSpec extends ParamSpecBase {
	kind: 'tags';
	options: ReadonlyArray<{ value: string; label: string; help?: string }>;
	default: readonly string[];
}

export type ParamSpec = NumberParamSpec | BooleanParamSpec | SelectParamSpec | TagsParamSpec;

/**
 * A named parameter set. Presets ARE the product: most users pick "Flooded sewer" and reroll the seed,
 * and never touch a slider. Selecting a preset PRE-FILLS the advanced panel with that preset's values,
 * so tweaking is a smooth ramp out of the preset rather than a mode switch into a blank form.
 */
export interface GeneratorPreset {
	id: string;
	label: string;
	description?: string;
	values: Readonly<Record<string, ParamValue>>;
}

/** A POI a generator wants to seed (an entrance, a boss chamber, a shrine, a village). */
export interface GeneratedPoi {
	id: string;
	label: string;
	category: MapPoiCategory;
	position: { x: number; y: number };
	notes: string;
}

/**
 * The room/region connectivity graph a generator produces as a by-product. Retaining it is what makes
 * the difference between a generator that draws walls and one that understands the place it drew: the
 * entrance is a graph leaf, the boss room is the node of maximum eccentricity, chokepoints are the MST
 * cut-set (so keys and locked doors have somewhere meaningful to go), and secret doors are the
 * candidate edges that were considered and rejected.
 */
export interface GeneratedGraph {
	nodes: Array<{
		id: string;
		/** Centroid in normalized map space. */
		position: { x: number; y: number };
		/** Generator-assigned role: 'entrance' | 'boss' | 'treasure' | 'guard' | 'shrine' | … */
		role: string;
		/** Index into the emitted room features, when the node corresponds to one. */
		featureId?: string;
	}>;
	edges: Array<{
		from: string;
		to: string;
		/** 'corridor' — a real connection. 'secret' — a rejected candidate kept as a secret door. */
		kind: 'corridor' | 'secret';
		/** True when removing this edge would disconnect the graph (a chokepoint: put the lock here). */
		chokepoint?: boolean;
	}>;
}

export interface GeneratorOutput {
	/** The generated layers, ready to insert into the map. */
	layers: MapLayer[];
	/** POIs the generator wants seeded alongside the geometry. */
	pois?: GeneratedPoi[];
	/** The connectivity graph, when the generator computed one. */
	graph?: GeneratedGraph;
	/** Keyed-room text, encounter/treasure rolls — the content that makes a map usable at the table. */
	notes?: Array<{ key: string; title: string; body: string }>;
	/** One-line human summary shown after a run ("14 rooms, 3 loops, 2 secret doors"). */
	summary?: string;
}

export interface GeneratorContext {
	/** Validated, defaulted parameter values (see `resolveParams`). */
	params: Readonly<Record<string, ParamValue>>;
	/** Named, independent RNG sub-streams derived from the root seed. */
	rng: RngStreams;
	/** Deterministic id prefix — every emitted id derives from this, never from a clock or Math.random. */
	idPrefix: string;
	/** Player-facing visibility stamped on every generated layer. Fail-closed: defaults to `dm-only`. */
	visibility: SceneVisibility;
	stamp: { actorId: string; now: string };
}

export interface GeneratorDefinition {
	/** Stable id, `group.algorithm` (e.g. `dungeon.tinykeep`). Persisted with the output. */
	id: string;
	group: GeneratorGroup;
	scale: GeneratorScale;
	label: string;
	/** One sentence: what this produces. Shown in the picker. */
	description: string;
	/** When to reach for this one over its siblings. This is what makes a 15-generator picker usable. */
	bestFor: string;
	/**
	 * Algorithm version. Bumped when the PRNG call order or geometry changes, so an old
	 * `{seed, params, version}` can be honestly reported as no longer reproducible rather than
	 * silently producing a different map.
	 */
	version: number;
	params: readonly ParamSpec[];
	presets: readonly GeneratorPreset[];
	run(ctx: GeneratorContext): GeneratorOutput;
}

export type GeneratorParamError = {
	kind: 'invalid-param';
	paramId: string;
	message: string;
};

/**
 * Validate raw parameter input against a generator's declared specs, filling defaults for anything
 * absent. Fail-closed: an out-of-range or unknown-option value is an ERROR, not a silent clamp, so a
 * bad param set persists nothing partial (the MAP-004 AC2 contract) and the user is told which knob
 * was wrong. Unknown keys are ignored rather than rejected, so a preset saved against an older version
 * of a generator still loads.
 */
export function resolveParams(
	definition: GeneratorDefinition,
	raw: Readonly<Record<string, unknown>>,
): { params: Record<string, ParamValue> } | { error: GeneratorParamError } {
	const params: Record<string, ParamValue> = {};
	for (const spec of definition.params) {
		const provided = raw[spec.id];
		if (provided === undefined) {
			params[spec.id] = spec.kind === 'tags' ? [...spec.default] : spec.default;
			continue;
		}
		switch (spec.kind) {
			case 'number':
			case 'int': {
				if (typeof provided !== 'number' || !Number.isFinite(provided)) {
					return {
						error: {
							kind: 'invalid-param',
							paramId: spec.id,
							message: `${spec.label} must be a number.`,
						},
					};
				}
				if (spec.kind === 'int' && !Number.isInteger(provided)) {
					return {
						error: {
							kind: 'invalid-param',
							paramId: spec.id,
							message: `${spec.label} must be a whole number.`,
						},
					};
				}
				if (provided < spec.min || provided > spec.max) {
					return {
						error: {
							kind: 'invalid-param',
							paramId: spec.id,
							message: `${spec.label} must be between ${spec.min} and ${spec.max}.`,
						},
					};
				}
				params[spec.id] = provided;
				break;
			}
			case 'boolean': {
				if (typeof provided !== 'boolean') {
					return {
						error: {
							kind: 'invalid-param',
							paramId: spec.id,
							message: `${spec.label} must be true or false.`,
						},
					};
				}
				params[spec.id] = provided;
				break;
			}
			case 'select': {
				if (typeof provided !== 'string' || !spec.options.some((o) => o.value === provided)) {
					return {
						error: {
							kind: 'invalid-param',
							paramId: spec.id,
							message: `${spec.label} must be one of: ${spec.options.map((o) => o.value).join(', ')}.`,
						},
					};
				}
				params[spec.id] = provided;
				break;
			}
			case 'tags': {
				if (
					!Array.isArray(provided) ||
					provided.some(
						(tag) => typeof tag !== 'string' || !spec.options.some((o) => o.value === tag),
					)
				) {
					return {
						error: {
							kind: 'invalid-param',
							paramId: spec.id,
							message: `${spec.label} must be a list of: ${spec.options.map((o) => o.value).join(', ')}.`,
						},
					};
				}
				// Sort so the same tag set always hashes/serializes identically regardless of click order —
				// otherwise two users who picked the same tags in a different order would get different maps.
				params[spec.id] = [...(provided as string[])].sort();
				break;
			}
		}
	}
	return { params };
}

/** Read a resolved param with the right static type. Throws only on a programming error (bad id). */
export function numberParam(params: Readonly<Record<string, ParamValue>>, id: string): number {
	const value = params[id];
	if (typeof value !== 'number') throw new Error(`Generator param "${id}" is not a number.`);
	return value;
}

export function stringParam(params: Readonly<Record<string, ParamValue>>, id: string): string {
	const value = params[id];
	if (typeof value !== 'string') throw new Error(`Generator param "${id}" is not a string.`);
	return value;
}

export function boolParam(params: Readonly<Record<string, ParamValue>>, id: string): boolean {
	const value = params[id];
	if (typeof value !== 'boolean') throw new Error(`Generator param "${id}" is not a boolean.`);
	return value;
}

export function tagsParam(
	params: Readonly<Record<string, ParamValue>>,
	id: string,
): readonly string[] {
	const value = params[id];
	if (!Array.isArray(value)) throw new Error(`Generator param "${id}" is not a tag list.`);
	return value as readonly string[];
}

/**
 * Round to six decimals so a normalized coordinate serializes IDENTICALLY on every platform. Every
 * coordinate a generator emits must pass through here — this is the last mile of the byte-identical
 * determinism contract, and skipping it on one code path is enough to break cross-device replay.
 */
export function norm(value: number): number {
	return Math.round(value * 1_000_000) / 1_000_000;
}

/** Convenience: a normalized, rounded point. */
export function normPoint(x: number, y: number): { x: number; y: number } {
	return { x: norm(x), y: norm(y) };
}

/** Build a feature, normalizing every coordinate. Generators should always emit through this. */
export function feature(
	id: string,
	kind: MapFeature['kind'],
	points: ReadonlyArray<{ x: number; y: number }>,
	style: string,
	props?: MapFeature['props'],
): MapFeature {
	const built: MapFeature = {
		id,
		kind,
		points: points.map((p) => normPoint(p.x, p.y)),
		style,
	};
	if (props && Object.keys(props).length > 0) built.props = { ...props };
	return built;
}

/**
 * Build one fully-formed, immediately-editable {@link MapLayer} from generated features. Generation is
 * NOT a black box: its output is ordinary layer content, so the DM can paint over it, delete parts of
 * it, and undo it with exactly the same commands they use for hand-drawn content.
 */
export function buildLayer(
	ctx: GeneratorContext,
	suffix: string,
	name: string,
	category: MapLayerCategory,
	content: MapFeature[],
	order: number,
): MapLayer {
	return normalizeMapLayer(
		{
			id: `${ctx.idPrefix}-${suffix}`,
			name,
			category,
			visibility: ctx.visibility,
			enabled: true,
			opacity: 1,
			content,
			updatedBy: ctx.stamp.actorId,
			updatedAt: ctx.stamp.now,
		},
		order,
	);
}
