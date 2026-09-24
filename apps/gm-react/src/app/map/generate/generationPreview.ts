import {
	createRngStreams,
	resolveParams,
	type GeneratorDefinition,
	type GeneratorOutput,
	type MapLayer,
	type ParamValue,
} from '@dndtools/core';
import { defaultOf } from './ParamControls';

/** The ghost the canvas paints while a generation is being tuned. */
export interface GenPreview {
	layers: MapLayer[];
}

export type Params = Record<string, ParamValue>;

export function paramsFromDefaults(def: GeneratorDefinition): Params {
	const out: Params = {};
	for (const spec of def.params) out[spec.id] = defaultOf(spec);
	return out;
}

/**
 * A fresh seed string. Entropy is minted through the editor's runtime/platform seam (PLAT-006)
 * — this GUI module must not reach `crypto` directly. We keep just the 8-char random segment so
 * the seed stays short and copy-pasteable.
 */
export function randomSeed(mint: (prefix?: string) => string): string {
	const raw = mint('seed');
	const segment = raw.split('-')[1];
	return segment && segment.length >= 6 ? segment : raw.replace(/[^a-z0-9]/gi, '').slice(0, 8);
}

/** Run a generator locally for the preview — no dispatch, no durable state. */
export function runLocal(
	def: GeneratorDefinition,
	seed: string,
	params: Params,
	idPrefix: string,
	actorId: string,
	/** The copy for a generator that throws. Passed in because this runs outside the component,
	 * where `useI18n` is not available (RC-UX-1.2). */
	failureText: string,
): { output: GeneratorOutput } | { error: string } {
	const resolved = resolveParams(def, params);
	if ('error' in resolved) return { error: `${resolved.error.message}` };
	try {
		const output = def.run({
			params: resolved.params,
			rng: createRngStreams(seed),
			idPrefix,
			visibility: 'dm-only',
			stamp: { actorId, now: new Date(0).toISOString() },
		});
		return { output };
	} catch (err) {
		return { error: err instanceof Error ? err.message : failureText };
	}
}
