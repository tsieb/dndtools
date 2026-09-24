import { type GeneratorGroup, type GeneratorOutput } from '@dndtools/core';
import {
	GENERATOR_GROUPS,
	generatorsByGroup,
	getGenerator,
	isImmediateParamChange,
} from '@dndtools/core/map-generators';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../i18n';
import type { MapEditorApi } from '../useMapEditor';
import { GenPreview, Params, paramsFromDefaults, randomSeed, runLocal } from './generationPreview';
export function useGenerationPreview({
	editor,
	setPreview,
	announce,
	onExit,
	initialGeneratorId,
	quickMapMode = false,
}: {
	editor: MapEditorApi;
	setPreview: (preview: GenPreview | null) => void;
	announce: (message: string) => void;
	onExit: () => void;
	/** When set (e.g. from a ⌘K "Generate: …" entry), the panel opens primed on this generator. */
	initialGeneratorId?: string;
	/** Android accepts a preset as one explicit edit, then returns to navigation. */
	quickMapMode?: boolean;
}) {
	const { t } = useI18n();
	const groupsWithGenerators = useMemo(
		() => GENERATOR_GROUPS.filter((g) => generatorsByGroup(g.id).length > 0),
		[],
	);
	const [group, setGroup] = useState<GeneratorGroup>(groupsWithGenerators[0]?.id ?? 'dungeon');
	const generators = useMemo(() => generatorsByGroup(group), [group]);
	const [generatorId, setGeneratorId] = useState<string>(generators[0]?.id ?? '');
	const definition = getGenerator(generatorId) ?? generators[0];

	// A ⌘K "Generate: …" entry primes a specific generator: jump to its group + select it.
	useEffect(() => {
		if (!initialGeneratorId) return;
		const def = getGenerator(initialGeneratorId);
		if (!def) return;
		setGroup(def.group);
		setGeneratorId(def.id);
	}, [initialGeneratorId]);

	const [params, setParams] = useState<Params>(() =>
		definition ? paramsFromDefaults(definition) : {},
	);
	const [seed, setSeed] = useState<string>(() => randomSeed(editor.nextId));
	const [presetId, setPresetId] = useState<string | null>(null);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [error, setError] = useState<string | null>(null);
	/** After accept: the run's summary/notes + the layer ids for the Derive offer. */
	const [accepted, setAccepted] = useState<{
		summary: string | null;
		notes: GeneratorOutput['notes'];
		layerIds: string[];
		seed: string;
	} | null>(null);
	const seedRef = useRef<HTMLInputElement>(null);

	// Switching generator resets its knobs to defaults and clears any preset selection + preview.
	useEffect(() => {
		if (!definition) return;
		setParams(paramsFromDefaults(definition));
		setPresetId(null);
		setAccepted(null);
	}, [definition]);

	// RC-MAP-3.5 — the params that fed the LAST preview run, so a change can be classified as
	// immediate-only (every differing param is `applies: 'immediate'`) vs. regenerate-required.
	const lastRunParamsRef = useRef<Params | null>(null);
	const lastRunGeneratorIdRef = useRef<string | null>(null);
	const rafRef = useRef<number | null>(null);

	// Live preview: re-run the generator into the ghost whenever the generator/seed/params change. An
	// immediate-only edit (e.g. dragging "size variation") is coalesced to one run per animation frame
	// instead of one per input event, which is what a raw `<input type=range>` fires while dragging —
	// without this, tuning a heavy generator (thousands of scattered props) pegs the main thread well
	// past the `widget-update` budget (<= 100ms p95, PERFORMANCE.md). A regenerate-required edit (a new
	// generator, seed, or a non-immediate param) always runs synchronously: it is not a drag gesture and
	// must never be dropped or feel debounced.
	useEffect(() => {
		if (rafRef.current != null) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		}
		if (!definition) {
			lastRunParamsRef.current = null;
			setPreview(null);
			return;
		}
		const runNow = () => {
			rafRef.current = null;
			lastRunParamsRef.current = params;
			lastRunGeneratorIdRef.current = definition.id;
			const result = runLocal(
				definition,
				seed,
				params,
				'preview',
				editor.actorId,
				t('mapGenerate.generatorFailed'),
			);
			if ('error' in result) {
				setError(result.error);
				setPreview(null);
				return;
			}
			setError(null);
			setPreview({ layers: result.output.layers });
		};
		const prev = lastRunParamsRef.current;
		const coalesce =
			prev !== null &&
			lastRunGeneratorIdRef.current === definition.id &&
			isImmediateParamChange(definition, prev, params);
		if (coalesce) {
			rafRef.current = requestAnimationFrame(runNow);
			return () => {
				if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
			};
		}
		runNow();
	}, [definition, seed, params, editor.actorId, setPreview, t]);

	// Clear the ghost when the panel unmounts (tool switched away).
	useEffect(() => () => setPreview(null), [setPreview]);

	const localOutput = useMemo(
		() =>
			definition
				? runLocal(
						definition,
						seed,
						params,
						`gen-${seed}`,
						editor.actorId,
						t('mapGenerate.generatorFailed'),
					)
				: { error: t('mapGenerate.noGenerator') },
		[definition, seed, params, editor.actorId, t],
	);

	return {
		editor,
		setPreview,
		announce,
		onExit,
		quickMapMode,
		t,
		groupsWithGenerators,
		group,
		setGroup,
		generators,
		generatorId,
		setGeneratorId,
		definition,
		params,
		setParams,
		seed,
		setSeed,
		presetId,
		setPresetId,
		showAdvanced,
		setShowAdvanced,
		error,
		setError,
		accepted,
		setAccepted,
		seedRef,
		localOutput,
	};
}
