import { AUDIO_SFX_EVENT_KINDS, type AudioSfxEventKind } from './audio-automation';

/**
 * RC-AUD-3.2 — THE BUILT-IN SFX CUE LIBRARY (the starter pack's sound-effect half).
 *
 * A curated, frozen catalog of one-shot CUES for the table moments a sound punctuates: a natural 20, a
 * natural 1, a death save going either way, a map area revealed, a handout delivered. It is shipped CODE
 * DATA, exactly like {@link ./audio-preset-library}.BUILTIN_AUDIO_PRESETS — the same idiom, for the same
 * reason: the app ships NO audio bytes. A cue is a NAMED RECIPE (a bundled clip key, a suggested mix and
 * the event it belongs to); the DM binds it to an imported library asset or a declared stream to make it
 * sound. Nothing here can play by itself, so nothing here can pretend to.
 *
 * Deterministic + frozen: ids, order and mix are identical on every device, so a cue reference resolves
 * the same everywhere. Pure data + pure helpers (no DOM, clock, or network).
 */

/** A compact spec for a built-in cue. Expanded into a frozen {@link AudioSfxCue} below. */
interface BuiltinCueSpec {
	slug: string;
	name: string;
	clip: string;
	volume: number;
}

/**
 * A built-in SFX CUE: a named one-shot recipe for one SFX event. `clip` is a BUNDLED CLIP KEY — the same
 * unbound `bundled-preset` reference the atmosphere library uses — never a URL and never bytes.
 */
export interface AudioSfxCue {
	id: string;
	/** The DM-facing cue name (sentence case, no engine jargon). */
	name: string;
	/** The SFX event this cue is written for. */
	event: AudioSfxEventKind;
	/** The bundled clip key the DM binds to a real asset/stream. */
	clip: string;
	/** The suggested one-shot mix level, 0–100. A cue never loops (it is a punctuation mark). */
	volume: number;
}

/** The stable id of a built-in cue. Deterministic + collision-free (event + slug). */
export function builtinSfxCueId(event: AudioSfxEventKind, slug: string): string {
	return `builtin-sfx-${event}-${slug}`;
}

/** True when an id is in the built-in SFX cue namespace (used to refuse deleting a shipped cue). */
export function isBuiltinSfxCueId(id: string): boolean {
	return id.startsWith('builtin-sfx-');
}

/** Three cues per event: enough for a DM to pick a table voice without authoring one from nothing. */
const CATALOG: Readonly<Record<AudioSfxEventKind, BuiltinCueSpec[]>> = {
	'roll-critical-success': [
		{ slug: 'fanfare', name: 'Short fanfare', clip: 'sfx/crit-fanfare', volume: 70 },
		{ slug: 'chime', name: 'Bright chime', clip: 'sfx/crit-chime', volume: 60 },
		{ slug: 'cheer', name: 'Table cheer', clip: 'sfx/crit-cheer', volume: 55 },
	],
	'roll-critical-failure': [
		{ slug: 'thud', name: 'Hollow thud', clip: 'sfx/fumble-thud', volume: 65 },
		{ slug: 'sad-horn', name: 'Sad horn', clip: 'sfx/fumble-horn', volume: 55 },
		{ slug: 'glass', name: 'Breaking glass', clip: 'sfx/fumble-glass', volume: 60 },
	],
	'death-save-success': [
		{ slug: 'heartbeat', name: 'Steadying heartbeat', clip: 'sfx/death-save-steady', volume: 60 },
		{ slug: 'breath', name: 'Caught breath', clip: 'sfx/death-save-breath', volume: 50 },
		{ slug: 'soft-bell', name: 'Soft bell', clip: 'sfx/death-save-bell', volume: 55 },
	],
	'death-save-failure': [
		{ slug: 'low-drum', name: 'Low drum', clip: 'sfx/death-save-drum', volume: 65 },
		{ slug: 'toll', name: 'Distant toll', clip: 'sfx/death-save-toll', volume: 60 },
		{ slug: 'flatline', name: 'Fading pulse', clip: 'sfx/death-save-pulse', volume: 55 },
	],
	'map-reveal': [
		{ slug: 'whoosh', name: 'Soft whoosh', clip: 'sfx/reveal-whoosh', volume: 55 },
		{ slug: 'stone-slide', name: 'Sliding stone', clip: 'sfx/reveal-stone', volume: 60 },
		{ slug: 'shimmer', name: 'Shimmer', clip: 'sfx/reveal-shimmer', volume: 50 },
	],
	'handout-delivery': [
		{ slug: 'paper', name: 'Paper rustle', clip: 'sfx/handout-paper', volume: 50 },
		{ slug: 'seal', name: 'Wax seal', clip: 'sfx/handout-seal', volume: 55 },
		{ slug: 'quill', name: 'Quill scratch', clip: 'sfx/handout-quill', volume: 45 },
	],
};

function expandCue(event: AudioSfxEventKind, spec: BuiltinCueSpec): AudioSfxCue {
	return Object.freeze({
		id: builtinSfxCueId(event, spec.slug),
		name: spec.name,
		event,
		clip: spec.clip,
		volume: spec.volume,
	});
}

/** THE frozen, ordered built-in SFX cue library (event order, then catalog order within an event). */
export const BUILTIN_SFX_CUES: readonly AudioSfxCue[] = Object.freeze(
	AUDIO_SFX_EVENT_KINDS.flatMap((event) => CATALOG[event].map((spec) => expandCue(event, spec))),
);

const CUES_BY_ID: Readonly<Record<string, AudioSfxCue>> = Object.freeze(
	Object.fromEntries(BUILTIN_SFX_CUES.map((cue) => [cue.id, cue])),
);

/** List every built-in cue in stable order. */
export function listBuiltinSfxCues(): readonly AudioSfxCue[] {
	return BUILTIN_SFX_CUES;
}

/** List the built-in cues written for one SFX event, in catalog order. */
export function listBuiltinSfxCuesForEvent(event: AudioSfxEventKind): AudioSfxCue[] {
	return BUILTIN_SFX_CUES.filter((cue) => cue.event === event);
}

/** Resolve a built-in cue by id, or undefined. */
export function builtinSfxCueById(id: string): AudioSfxCue | undefined {
	return CUES_BY_ID[id];
}

/** The total shipped cue count (three per declared SFX event). */
export const BUILTIN_SFX_CUE_COUNT = BUILTIN_SFX_CUES.length;
