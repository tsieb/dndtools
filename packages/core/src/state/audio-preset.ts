import { isSafeUrl } from '../security/content-safety';

/**
 * AUDIO-014 (Epic 11.3 / S11.3.1–S11.3.2) — CATEGORIZED AUDIO PRESETS: a named, multi-layer atmosphere
 * mixer definition the DM can browse from a built-in library and CUSTOMIZE into a reusable vault object.
 *
 * A preset is a DURABLE, DM-authored MIXER: a category + an ordered list of LAYERS, each of which is one
 * looping/one-shot bed with its own source reference, volume, loop flag, and start offset (the AUDIO-015
 * "multi-layer audio mixer" — up to {@link MAX_AUDIO_PRESET_LAYERS} simultaneous sources per the AUDIO-001
 * engine budget). A preset REFERENCES audio (never copies bytes — Contract 2): a `local-file` layer may pin
 * a content-addressed `assetId`, a `web-stream` layer carries a validated URL, and a `bundled-preset` layer
 * names a shipped clip key. A layer may ALSO carry an optional `sourceId`/`assetId` binding to a CONFIGURED
 * library source so the preset is directly PLAYABLE through the existing session-audio runtime; a layer with
 * no binding is a TEMPLATE layer (honest: it resolves to a silent, needs-binding state at activation, never a
 * guessed track).
 *
 * The BUILT-IN library ({@link ./audio-preset-library}) is shipped code (the compendium/SRD bundling idiom):
 * frozen, non-deletable system presets that are fully customizable by COPY. USER presets live in the durable
 * audio slice and round-trip through the fail-closed hydrator. This module is PURE + DETERMINISTIC (no DOM,
 * clock, or network): identical inputs always build the identical preset, and hostile input fails closed.
 */

export const AUDIO_PRESET_SCHEMA_VERSION = 1 as const;

/** The entity type audio-preset ops are addressed by. Presets are DM-only config (Player-safe: dm-only). */
export const AUDIO_PRESET_ENTITY_TYPE = 'audio-preset' as const;

/** The AUDIO-001 engine layer budget — a preset mixes at most this many simultaneous sources. */
export const MAX_AUDIO_PRESET_LAYERS = 6 as const;

const MAX_PRESET_NAME_LENGTH = 120;
const MAX_LAYER_LABEL_LENGTH = 80;
const MAX_LAYER_REF_LENGTH = 2048;
/** A generous ceiling on a layer's variation offset (10 minutes) so a corrupt record cannot pin a huge value. */
const MAX_LAYER_START_OFFSET_MS = 600_000;

/**
 * The category a preset is filed under in the built-in library (S11.3.1). A CLOSED enum; an unknown category
 * fails closed (rejected on build, coerced to `dungeon` on tolerant hydrate) so a preset is always browsable.
 */
export type AudioPresetCategory =
	| 'dungeon'
	| 'wilderness'
	| 'urban'
	| 'combat'
	| 'social'
	| 'mystical';

export const AUDIO_PRESET_CATEGORIES: readonly AudioPresetCategory[] = Object.freeze([
	'dungeon',
	'wilderness',
	'urban',
	'combat',
	'social',
	'mystical',
]);

/** A DM-facing label for each preset category (the library browser heading). */
export const AUDIO_PRESET_CATEGORY_LABELS: Readonly<Record<AudioPresetCategory, string>> =
	Object.freeze({
		dungeon: 'Dungeon',
		wilderness: 'Wilderness',
		urban: 'Urban',
		combat: 'Combat',
		social: 'Social',
		mystical: 'Mystical',
	});

/** True when `value` is a declared preset category. Unknown values fail closed. */
export function isAudioPresetCategory(value: unknown): value is AudioPresetCategory {
	return (
		typeof value === 'string' &&
		(AUDIO_PRESET_CATEGORIES as readonly string[]).includes(value)
	);
}

/**
 * The kind of source a preset LAYER plays through — the declared {@link ./audio-source} vocabulary a layer
 * may name. A CLOSED enum; an unknown kind fails closed (a layer can never reference an undeclared provider).
 */
export type AudioPresetLayerSourceKind = 'bundled-preset' | 'local-file' | 'web-stream';

export const AUDIO_PRESET_LAYER_SOURCE_KINDS: readonly AudioPresetLayerSourceKind[] = Object.freeze([
	'bundled-preset',
	'local-file',
	'web-stream',
]);

/** True when `value` is a declared layer source kind. Unknown values fail closed. */
export function isAudioPresetLayerSourceKind(value: unknown): value is AudioPresetLayerSourceKind {
	return (
		typeof value === 'string' &&
		(AUDIO_PRESET_LAYER_SOURCE_KINDS as readonly string[]).includes(value)
	);
}

/**
 * ONE layer of a preset's mixer (AUDIO-015). It references audio by a descriptive `ref` (a bundled clip key,
 * an asset id, or a web-stream URL) and MAY additionally bind a CONFIGURED library `sourceId`/`assetId` so the
 * layer is directly playable through the session-audio runtime. `loop`, `volume`, and `startOffsetMs` are the
 * per-layer mix controls the editor exposes. It NEVER carries audio bytes (Contract 2).
 */
export interface AudioPresetLayer {
	id: string;
	/** A short DM-authored label for the mixer row (e.g. "wind", "distant drums"). */
	label: string;
	sourceKind: AudioPresetLayerSourceKind;
	/**
	 * The descriptive source reference: a bundled clip key (`bundled-preset`), a content-addressed asset id
	 * (`local-file`), or a validated web-stream URL (`web-stream`). For a `web-stream` layer this is safe-URL
	 * validated (a `javascript:`/`data:` scheme is rejected — never an XSS vector).
	 */
	ref: string;
	/**
	 * An OPTIONAL binding to a CONFIGURED library {@link ./audio-source} so the layer plays through the
	 * existing session-audio runtime. Null for a template layer (browsable but not yet playable).
	 */
	sourceId: string | null;
	/** An OPTIONAL specific library asset (a `local-file` binding) to play; null otherwise. */
	assetId: string | null;
	loop: boolean;
	/** The layer volume, 0–100 (S11.3.2). */
	volume: number;
	/** A start offset in milliseconds for variation between activations (S11.3.2). */
	startOffsetMs: number;
}

/**
 * A durable AUDIO PRESET: a named, categorized mixer. `builtIn` presets are shipped code (non-deletable,
 * customizable by copy); user presets live in the durable audio slice. References only — never asset bytes.
 */
export interface AudioPreset {
	id: string;
	name: string;
	category: AudioPresetCategory;
	/** True for a shipped system preset (non-deletable; copy to customize). User presets are always false. */
	builtIn: boolean;
	layers: AudioPresetLayer[];
	createdBy: string;
	createdAt: string;
	updatedAt: string;
	revision: number;
}

/** The fail-closed build outcome. `ok` true ⇒ a valid preset to persist; false ⇒ rejected with reason. */
export type AudioPresetResult =
	| { ok: true; preset: AudioPreset }
	| { ok: false; reason: AudioPresetRejectionReason; message: string };

/** Why a preset build was rejected fail-closed (non-leaking; describes the reason, not raw payload). */
export type AudioPresetRejectionReason =
	| 'invalid-name'
	| 'invalid-category'
	| 'no-layers'
	| 'too-many-layers'
	| 'invalid-layer';

/** Input for one layer (all mix controls optional — safe defaults apply). */
export interface BuildAudioPresetLayerInput {
	id?: string;
	label?: string;
	sourceKind: string;
	ref: string;
	sourceId?: string | null;
	assetId?: string | null;
	loop?: boolean;
	volume?: number;
	startOffsetMs?: number;
}

export interface BuildAudioPresetInput {
	id: string;
	name: string;
	category: string;
	layers: readonly BuildAudioPresetLayerInput[];
	createdBy: string;
	createdAt: string;
	/** Assigns stable ids to layers that omit one. Defaults to an index-derived id. */
	layerId?: (index: number) => string;
	/** Existing record (for an update) so created-by/at + revision continuity are preserved. */
	previous?: AudioPreset;
}

function clampVolume(value: number | undefined, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(100, Math.max(0, Math.round(value)));
}

function clampOffset(value: number | undefined): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
	return Math.min(MAX_LAYER_START_OFFSET_MS, Math.round(value));
}

/** Build one validated layer, or a rejection reason. Pure. */
function buildLayer(
	input: BuildAudioPresetLayerInput,
	fallbackId: string,
): { ok: true; layer: AudioPresetLayer } | { ok: false; message: string } {
	if (!isAudioPresetLayerSourceKind(input.sourceKind)) {
		return { ok: false, message: `Layer source kind "${input.sourceKind}" is not declared.` };
	}
	const ref = (input.ref ?? '').toString().trim();
	if (ref === '' || ref.length > MAX_LAYER_REF_LENGTH) {
		return { ok: false, message: 'A preset layer must reference a non-empty, bounded source.' };
	}
	// SEC / XSS — a web-stream layer's URL must be a safe scheme (http/https). A javascript:/data: URL is
	// rejected fail-closed so a hostile preset can never smuggle a script URL into a playable layer.
	if (input.sourceKind === 'web-stream' && !isSafeUrl(ref)) {
		return { ok: false, message: 'A web-stream layer URL is not a safe http(s) URL.' };
	}
	const id = (input.id ?? '').toString().trim() || fallbackId;
	const label = (input.label ?? '').toString().trim().slice(0, MAX_LAYER_LABEL_LENGTH) || input.sourceKind;
	const sourceId = (input.sourceId ?? '').toString().trim() || null;
	const assetId = (input.assetId ?? '').toString().trim() || null;
	return {
		ok: true,
		layer: {
			id,
			label,
			sourceKind: input.sourceKind,
			ref,
			sourceId,
			assetId,
			loop: input.loop !== false,
			volume: clampVolume(input.volume, 80),
			startOffsetMs: clampOffset(input.startOffsetMs),
		},
	};
}

/**
 * AUDIO-014 — BUILD (or update) a USER audio preset, fail-closed. Decision order (reject BEFORE any state
 * mutation, so no half-formed preset is ever persisted):
 *
 *   1. A blank / over-long NAME is rejected `invalid-name`.
 *   2. An UNDECLARED category is rejected `invalid-category`.
 *   3. ZERO layers is rejected `no-layers`; more than {@link MAX_AUDIO_PRESET_LAYERS} is `too-many-layers`.
 *   4. Any layer with an undeclared source kind, a blank/over-long ref, or an unsafe web-stream URL is
 *      rejected `invalid-layer` (the XSS gate). Volumes/offsets are clamped, never rejected.
 *
 * A user preset is always `builtIn: false` (system presets are shipped code, built directly by the library).
 * The function never touches storage; the command persists the returned preset.
 */
export function buildAudioPreset(input: BuildAudioPresetInput): AudioPresetResult {
	const name = (input.name ?? '').toString().trim();
	if (name === '' || name.length > MAX_PRESET_NAME_LENGTH) {
		return { ok: false, reason: 'invalid-name', message: 'A preset needs a short, non-empty name.' };
	}
	if (!isAudioPresetCategory(input.category)) {
		return {
			ok: false,
			reason: 'invalid-category',
			message: `Preset category "${input.category}" is not a declared category.`,
		};
	}
	if (!Array.isArray(input.layers) || input.layers.length === 0) {
		return { ok: false, reason: 'no-layers', message: 'A preset needs at least one audio layer.' };
	}
	if (input.layers.length > MAX_AUDIO_PRESET_LAYERS) {
		return {
			ok: false,
			reason: 'too-many-layers',
			message: `A preset mixes at most ${MAX_AUDIO_PRESET_LAYERS} layers.`,
		};
	}
	const layerId = input.layerId ?? ((index: number) => `${input.id}-layer-${index + 1}`);
	const layers: AudioPresetLayer[] = [];
	for (let i = 0; i < input.layers.length; i += 1) {
		const built = buildLayer(input.layers[i]!, layerId(i));
		if (!built.ok) {
			return { ok: false, reason: 'invalid-layer', message: built.message };
		}
		layers.push(built.layer);
	}

	const previous = input.previous;
	const preset: AudioPreset = {
		id: input.id,
		name,
		category: input.category,
		builtIn: false,
		layers,
		createdBy: previous?.createdBy ?? input.createdBy,
		createdAt: previous?.createdAt ?? input.createdAt,
		updatedAt: input.createdAt,
		revision: (previous?.revision ?? 0) + 1,
	};
	return { ok: true, preset };
}

/** Deep-clone a preset so callers never mutate shared state. Pure. */
export function cloneAudioPreset(preset: AudioPreset): AudioPreset {
	return { ...preset, layers: preset.layers.map((layer) => ({ ...layer })) };
}

/**
 * Tolerantly hydrate ONE persisted user preset fail-closed: coerce an invalid category to `dungeon`, drop
 * layers with an undeclared source kind / blank ref / unsafe web-stream URL, clamp volumes/offsets, and DROP
 * the whole preset (return null) when no valid layer survives (an un-playable, un-browsable husk). This never
 * throws on a corrupt record; the worst case is the record is safely omitted.
 */
export function ensureAudioPreset(preset: AudioPreset): AudioPreset | null {
	if (preset === null || typeof preset !== 'object') return null;
	const category: AudioPresetCategory = isAudioPresetCategory(preset.category)
		? preset.category
		: 'dungeon';
	const rawLayers = Array.isArray(preset.layers) ? preset.layers : [];
	const layers: AudioPresetLayer[] = [];
	for (let i = 0; i < rawLayers.length && layers.length < MAX_AUDIO_PRESET_LAYERS; i += 1) {
		const raw = rawLayers[i]!;
		const built = buildLayer(
			{
				id: raw?.id,
				label: raw?.label,
				sourceKind: raw?.sourceKind as string,
				ref: raw?.ref as string,
				sourceId: raw?.sourceId ?? null,
				assetId: raw?.assetId ?? null,
				loop: raw?.loop,
				volume: raw?.volume,
				startOffsetMs: raw?.startOffsetMs,
			},
			(raw?.id ?? '').toString().trim() || `${preset.id}-layer-${i + 1}`,
		);
		if (built.ok) layers.push(built.layer);
	}
	if (layers.length === 0) return null;
	const name = (preset.name ?? '').toString().trim().slice(0, MAX_PRESET_NAME_LENGTH) || 'Untitled preset';
	return {
		id: preset.id,
		name,
		category,
		// A persisted record can never re-assert itself as a system preset — built-ins are shipped code only.
		builtIn: false,
		layers,
		createdBy: preset.createdBy ?? '',
		createdAt: preset.createdAt ?? '',
		updatedAt: preset.updatedAt ?? preset.createdAt ?? '',
		revision: typeof preset.revision === 'number' && preset.revision >= 0 ? preset.revision : 1,
	};
}
