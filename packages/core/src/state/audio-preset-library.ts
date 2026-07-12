import {
	AUDIO_PRESET_CATEGORIES,
	type AudioPreset,
	type AudioPresetCategory,
	type AudioPresetLayer,
} from './audio-preset';

/**
 * AUDIO-014 / S11.3.1 — THE BUILT-IN AUDIO PRESET LIBRARY.
 *
 * A curated, categorized set of 40+ named atmosphere presets shipped WITH the app (the compendium/SRD
 * bundling idiom — frozen code data, not persisted vault state). Every built-in preset is a NON-DELETABLE
 * system object that is fully customizable BY COPY: {@link copyPresetForUser} clones one into an editable
 * user preset. Built-in layers are TEMPLATE layers (a `bundled-preset` clip key with no configured-source
 * binding); the DM binds them to imported library assets / web streams in the editor to make them playable,
 * so the app ships NO copyrighted audio bytes (only the mixer definitions — the reusable atmosphere recipes).
 *
 * Deterministic + frozen: the list, ids, categories, and layer configs are identical on every device, so a
 * preset reference resolves the same everywhere. Pure data + pure helpers (no DOM, clock, or network).
 */

const BUILTIN_TIMESTAMP = '1970-01-01T00:00:00.000Z';
const BUILTIN_AUTHOR = 'system';

/** A compact spec for a built-in layer (a bundled clip key + its mix). Expanded into a full layer below. */
interface BuiltinLayerSpec {
	label: string;
	clip: string;
	volume: number;
	loop?: boolean;
	offsetMs?: number;
}

/** A compact spec for a built-in preset. Expanded into a full frozen {@link AudioPreset}. */
interface BuiltinPresetSpec {
	slug: string;
	name: string;
	layers: BuiltinLayerSpec[];
}

/** The stable id of a built-in preset. Deterministic + collision-free (category + slug). */
export function builtinPresetId(category: AudioPresetCategory, slug: string): string {
	return `builtin-preset-${category}-${slug}`;
}

/** True when an id is in the built-in preset id namespace (used to refuse deleting a system preset). */
export function isBuiltinAudioPresetId(id: string): boolean {
	return id.startsWith('builtin-preset-');
}

function expandLayer(presetId: string, index: number, spec: BuiltinLayerSpec): AudioPresetLayer {
	const layer: AudioPresetLayer = {
		id: `${presetId}-layer-${index + 1}`,
		label: spec.label,
		// A built-in layer is a TEMPLATE bed: a bundled clip key with no configured-source binding. The DM
		// binds it to an imported asset / stream in the editor to make it playable, so the app ships NO bytes.
		sourceKind: 'bundled-preset',
		ref: spec.clip,
		sourceId: null,
		assetId: null,
		loop: spec.loop !== false,
		volume: spec.volume,
		startOffsetMs: spec.offsetMs ?? 0,
	};
	return Object.freeze(layer);
}

function expandPreset(category: AudioPresetCategory, spec: BuiltinPresetSpec): AudioPreset {
	const id = builtinPresetId(category, spec.slug);
	return Object.freeze({
		id,
		name: spec.name,
		category,
		builtIn: true,
		layers: Object.freeze(spec.layers.map((layer, i) => expandLayer(id, i, layer))) as AudioPresetLayer[],
		createdBy: BUILTIN_AUTHOR,
		createdAt: BUILTIN_TIMESTAMP,
		updatedAt: BUILTIN_TIMESTAMP,
		revision: 1,
	}) as AudioPreset;
}

/** The compact catalog, grouped by category. 8+8+8+6+6+6 = 42 built-in presets (S11.3.1 "40+"). */
const CATALOG: Readonly<Record<AudioPresetCategory, BuiltinPresetSpec[]>> = {
	dungeon: [
		{ slug: 'stone-corridor', name: 'Stone Corridor', layers: [
			{ label: 'stone ambience', clip: 'ambience/dungeon-stone', volume: 70 },
			{ label: 'distant drips', clip: 'sfx/water-drip', volume: 40, offsetMs: 4000 },
		] },
		{ slug: 'flooded-cave', name: 'Flooded Cave', layers: [
			{ label: 'lapping water', clip: 'ambience/cave-water', volume: 65 },
			{ label: 'cave echo', clip: 'ambience/cave-echo', volume: 45 },
		] },
		{ slug: 'trap-room', name: 'Trap Room', layers: [
			{ label: 'low tension', clip: 'music/tension-low', volume: 55 },
			{ label: 'mechanism ticks', clip: 'sfx/gears-tick', volume: 35 },
		] },
		{ slug: 'boss-chamber', name: 'Boss Chamber', layers: [
			{ label: 'ominous choir', clip: 'music/boss-choir', volume: 75 },
			{ label: 'deep drone', clip: 'ambience/deep-drone', volume: 50 },
		] },
		{ slug: 'safe-room', name: 'Safe Room', layers: [
			{ label: 'warm hearth', clip: 'ambience/hearth-fire', volume: 60 },
			{ label: 'gentle rest', clip: 'music/calm-rest', volume: 45 },
		] },
		{ slug: 'undead-crypt', name: 'Undead Crypt', layers: [
			{ label: 'crypt wind', clip: 'ambience/crypt-wind', volume: 60 },
			{ label: 'whispers', clip: 'sfx/ghost-whisper', volume: 40, offsetMs: 6000 },
		] },
		{ slug: 'sewer-tunnels', name: 'Sewer Tunnels', layers: [
			{ label: 'dripping sludge', clip: 'ambience/sewer-drip', volume: 60 },
			{ label: 'rat scurry', clip: 'sfx/rats', volume: 35, offsetMs: 3000 },
		] },
		{ slug: 'deep-mine', name: 'Deep Mine', layers: [
			{ label: 'distant picks', clip: 'sfx/mining-pick', volume: 45 },
			{ label: 'mine rumble', clip: 'ambience/mine-rumble', volume: 55 },
		] },
	],
	wilderness: [
		{ slug: 'dense-forest', name: 'Dense Forest', layers: [
			{ label: 'forest birds', clip: 'ambience/forest-birds', volume: 60 },
			{ label: 'leaf rustle', clip: 'ambience/leaves', volume: 45 },
		] },
		{ slug: 'open-plains', name: 'Open Plains', layers: [
			{ label: 'prairie wind', clip: 'ambience/plains-wind', volume: 65 },
			{ label: 'distant insects', clip: 'ambience/crickets', volume: 35 },
		] },
		{ slug: 'thunderstorm', name: 'Thunderstorm', layers: [
			{ label: 'heavy rain', clip: 'ambience/rain-heavy', volume: 70 },
			{ label: 'thunder', clip: 'sfx/thunder', volume: 55, offsetMs: 8000 },
		] },
		{ slug: 'mountain-pass', name: 'Mountain Pass', layers: [
			{ label: 'high wind', clip: 'ambience/mountain-wind', volume: 70 },
			{ label: 'eagle cry', clip: 'sfx/eagle', volume: 30, offsetMs: 9000 },
		] },
		{ slug: 'haunted-wood', name: 'Haunted Wood', layers: [
			{ label: 'eerie wind', clip: 'ambience/eerie-wind', volume: 60 },
			{ label: 'creaking trees', clip: 'sfx/tree-creak', volume: 40 },
			{ label: 'unease', clip: 'music/dread-low', volume: 45 },
		] },
		{ slug: 'sunlit-meadow', name: 'Sunlit Meadow', layers: [
			{ label: 'meadow birds', clip: 'ambience/meadow-birds', volume: 55 },
			{ label: 'buzzing bees', clip: 'ambience/bees', volume: 35 },
		] },
		{ slug: 'frozen-tundra', name: 'Frozen Tundra', layers: [
			{ label: 'icy gusts', clip: 'ambience/tundra-wind', volume: 70 },
			{ label: 'ice groan', clip: 'sfx/ice-crack', volume: 35, offsetMs: 7000 },
		] },
		{ slug: 'coastal-cliffs', name: 'Coastal Cliffs', layers: [
			{ label: 'crashing surf', clip: 'ambience/ocean-surf', volume: 65 },
			{ label: 'gulls', clip: 'sfx/gulls', volume: 35, offsetMs: 4000 },
		] },
	],
	urban: [
		{ slug: 'bustling-market', name: 'Bustling Market', layers: [
			{ label: 'crowd murmur', clip: 'ambience/market-crowd', volume: 65 },
			{ label: 'vendor calls', clip: 'sfx/vendor-calls', volume: 40, offsetMs: 5000 },
		] },
		{ slug: 'dark-alley', name: 'Dark Alley', layers: [
			{ label: 'city night', clip: 'ambience/city-night', volume: 55 },
			{ label: 'distant footsteps', clip: 'sfx/footsteps', volume: 35, offsetMs: 6000 },
		] },
		{ slug: 'tavern', name: 'Tavern', layers: [
			{ label: 'tavern chatter', clip: 'ambience/tavern-crowd', volume: 60 },
			{ label: 'lute tune', clip: 'music/tavern-lute', volume: 50 },
			{ label: 'clinking mugs', clip: 'sfx/mugs', volume: 35 },
		] },
		{ slug: 'throne-room', name: 'Throne Room', layers: [
			{ label: 'regal hall', clip: 'ambience/great-hall', volume: 55 },
			{ label: 'stately theme', clip: 'music/royal-theme', volume: 55 },
		] },
		{ slug: 'harbor', name: 'Harbor', layers: [
			{ label: 'docks & water', clip: 'ambience/harbor', volume: 60 },
			{ label: 'ship bells', clip: 'sfx/ship-bell', volume: 35, offsetMs: 7000 },
		] },
		{ slug: 'slums', name: 'Slums', layers: [
			{ label: 'grimy streets', clip: 'ambience/slums', volume: 55 },
			{ label: 'distant argument', clip: 'sfx/argument', volume: 30, offsetMs: 8000 },
		] },
		{ slug: 'temple-district', name: 'Temple District', layers: [
			{ label: 'temple bells', clip: 'ambience/temple-bells', volume: 55 },
			{ label: 'chanting', clip: 'music/chant-soft', volume: 45 },
		] },
		{ slug: 'arena', name: 'Arena', layers: [
			{ label: 'roaring crowd', clip: 'ambience/arena-crowd', volume: 70 },
			{ label: 'war drums', clip: 'music/arena-drums', volume: 55 },
		] },
	],
	combat: [
		{ slug: 'battle', name: 'Battle', layers: [
			{ label: 'battle theme', clip: 'music/battle', volume: 75 },
			{ label: 'clashing steel', clip: 'sfx/sword-clash', volume: 45 },
		] },
		{ slug: 'pursuit', name: 'Pursuit', layers: [
			{ label: 'chase theme', clip: 'music/chase', volume: 75 },
			{ label: 'running steps', clip: 'sfx/running', volume: 40 },
		] },
		{ slug: 'ambush', name: 'Ambush', layers: [
			{ label: 'sudden strike', clip: 'music/ambush-sting', volume: 70, loop: false },
			{ label: 'tense combat', clip: 'music/combat-tense', volume: 65 },
		] },
		{ slug: 'final-stand', name: 'Final Stand', layers: [
			{ label: 'epic finale', clip: 'music/epic-finale', volume: 80 },
			{ label: 'heroic choir', clip: 'music/heroic-choir', volume: 55 },
		] },
		{ slug: 'siege', name: 'Siege', layers: [
			{ label: 'siege drums', clip: 'music/siege-drums', volume: 70 },
			{ label: 'catapult impacts', clip: 'sfx/catapult', volume: 45, offsetMs: 6000 },
		] },
		{ slug: 'duel', name: 'Duel', layers: [
			{ label: 'duel theme', clip: 'music/duel', volume: 70 },
			{ label: 'blade rings', clip: 'sfx/blade-ring', volume: 40 },
		] },
	],
	social: [
		{ slug: 'formal-court', name: 'Formal Court', layers: [
			{ label: 'courtly strings', clip: 'music/court-strings', volume: 55 },
			{ label: 'quiet murmur', clip: 'ambience/court-murmur', volume: 35 },
		] },
		{ slug: 'interrogation', name: 'Interrogation', layers: [
			{ label: 'cold tension', clip: 'music/tension-cold', volume: 55 },
			{ label: 'dripping cell', clip: 'sfx/cell-drip', volume: 30, offsetMs: 5000 },
		] },
		{ slug: 'celebration', name: 'Celebration', layers: [
			{ label: 'festive music', clip: 'music/festival', volume: 65 },
			{ label: 'cheering crowd', clip: 'ambience/cheer', volume: 45 },
		] },
		{ slug: 'funeral', name: 'Funeral', layers: [
			{ label: 'mournful dirge', clip: 'music/dirge', volume: 55 },
			{ label: 'soft rain', clip: 'ambience/rain-soft', volume: 35 },
		] },
		{ slug: 'negotiation', name: 'Negotiation', layers: [
			{ label: 'measured underscore', clip: 'music/underscore-calm', volume: 50 },
			{ label: 'quiet room', clip: 'ambience/quiet-room', volume: 30 },
		] },
		{ slug: 'ritual-gathering', name: 'Ritual Gathering', layers: [
			{ label: 'low chant', clip: 'music/ritual-chant', volume: 55 },
			{ label: 'ceremonial drums', clip: 'sfx/ritual-drums', volume: 40 },
		] },
	],
	mystical: [
		{ slug: 'arcane-lab', name: 'Arcane Lab', layers: [
			{ label: 'humming energy', clip: 'ambience/arcane-hum', volume: 55 },
			{ label: 'bubbling flasks', clip: 'sfx/bubbling', volume: 35 },
		] },
		{ slug: 'divine-temple', name: 'Divine Temple', layers: [
			{ label: 'celestial choir', clip: 'music/celestial', volume: 60 },
			{ label: 'soft bells', clip: 'sfx/holy-bells', volume: 35, offsetMs: 6000 },
		] },
		{ slug: 'void', name: 'The Void', layers: [
			{ label: 'endless drone', clip: 'ambience/void-drone', volume: 60 },
			{ label: 'distant pulse', clip: 'sfx/void-pulse', volume: 35, offsetMs: 7000 },
		] },
		{ slug: 'dreamscape', name: 'Dreamscape', layers: [
			{ label: 'shimmer pad', clip: 'music/dream-pad', volume: 55 },
			{ label: 'soft chimes', clip: 'sfx/chimes', volume: 35 },
		] },
		{ slug: 'fae-glade', name: 'Fae Glade', layers: [
			{ label: 'enchanted forest', clip: 'ambience/fae-forest', volume: 55 },
			{ label: 'fairy bells', clip: 'sfx/fairy-bells', volume: 40 },
		] },
		{ slug: 'planar-rift', name: 'Planar Rift', layers: [
			{ label: 'reality tear', clip: 'ambience/rift-hum', volume: 60 },
			{ label: 'warping energy', clip: 'sfx/warp', volume: 40, offsetMs: 5000 },
		] },
	],
};

/** THE frozen, ordered built-in preset library (category order, then catalog order within a category). */
export const BUILTIN_AUDIO_PRESETS: readonly AudioPreset[] = Object.freeze(
	AUDIO_PRESET_CATEGORIES.flatMap((category) =>
		CATALOG[category].map((spec) => expandPreset(category, spec)),
	),
);

/** A lookup map of built-in presets by id (frozen). */
const BUILTIN_BY_ID: Readonly<Record<string, AudioPreset>> = Object.freeze(
	Object.fromEntries(BUILTIN_AUDIO_PRESETS.map((preset) => [preset.id, preset])),
);

/** List every built-in preset in stable order. */
export function listBuiltinAudioPresets(): readonly AudioPreset[] {
	return BUILTIN_AUDIO_PRESETS;
}

/** List the built-in presets in one category, in catalog order. */
export function listBuiltinAudioPresetsByCategory(category: AudioPresetCategory): AudioPreset[] {
	return BUILTIN_AUDIO_PRESETS.filter((preset) => preset.category === category);
}

/** Resolve a built-in preset by id, or undefined. */
export function builtinAudioPresetById(id: string): AudioPreset | undefined {
	return BUILTIN_BY_ID[id];
}

/** The total built-in preset count (S11.3.1 acceptance: 40+). */
export const BUILTIN_AUDIO_PRESET_COUNT = BUILTIN_AUDIO_PRESETS.length;

/**
 * S11.3.1 — COPY a preset (built-in or user) into a fresh, editable USER-preset draft. Returns a plain
 * (unbuilt) shape the command layer feeds to {@link ./audio-preset}.buildAudioPreset with a new id, so the
 * copy is a first-class, customizable user preset (the "customizable via copy" contract). The copy carries
 * the source layers verbatim (labels/refs/mix/bindings) but is never itself a system preset.
 */
export function copyPresetForUser(source: AudioPreset): {
	name: string;
	category: AudioPresetCategory;
	layers: Array<{
		label: string;
		sourceKind: AudioPresetLayer['sourceKind'];
		ref: string;
		sourceId: string | null;
		assetId: string | null;
		loop: boolean;
		volume: number;
		startOffsetMs: number;
	}>;
} {
	return {
		name: `${source.name} (copy)`,
		category: source.category,
		layers: source.layers.map((layer) => ({
			label: layer.label,
			sourceKind: layer.sourceKind,
			ref: layer.ref,
			sourceId: layer.sourceId,
			assetId: layer.assetId,
			loop: layer.loop,
			volume: layer.volume,
			startOffsetMs: layer.startOffsetMs,
		})),
	};
}
