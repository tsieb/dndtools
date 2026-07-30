import { useEffect, useMemo, useRef, useState } from 'react';
import {
	GENERATOR_GROUPS,
	createRngStreams,
	generatorsByGroup,
	getGenerator,
	resolveParams,
	type GeneratorDefinition,
	type GeneratorGroup,
	type GeneratorOutput,
	type MapLayer,
	type ParamValue,
} from '@dndtools/core';
import { Button, Chip, Icon, Input } from '../../../ds';
import { T, eb } from '../../screen-kit';
import type { MapEditorApi } from '../useMapEditor';
import { ParamControls, defaultOf } from './ParamControls';

/** The ghost the canvas paints while a generation is being tuned. */
export interface GenPreview {
	layers: MapLayer[];
}

type Params = Record<string, ParamValue>;

function paramsFromDefaults(def: GeneratorDefinition): Params {
	const out: Params = {};
	for (const spec of def.params) out[spec.id] = defaultOf(spec);
	return out;
}

/**
 * A fresh seed string. Entropy is minted through the editor's runtime/platform seam (PLAT-006)
 * — this GUI module must not reach `crypto` directly. We keep just the 8-char random segment so
 * the seed stays short and copy-pasteable.
 */
function randomSeed(mint: (prefix?: string) => string): string {
	const raw = mint('seed');
	const segment = raw.split('-')[1];
	return segment && segment.length >= 6 ? segment : raw.replace(/[^a-z0-9]/gi, '').slice(0, 8);
}

/** Run a generator locally for the preview — no dispatch, no durable state. */
function runLocal(
	def: GeneratorDefinition,
	seed: string,
	params: Params,
	idPrefix: string,
	actorId: string,
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
		return { error: err instanceof Error ? err.message : 'The generator failed to run.' };
	}
}

export function GeneratePanel({
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

	// Live preview: re-run the generator into the ghost whenever the generator/seed/params change.
	useEffect(() => {
		if (!definition) {
			setPreview(null);
			return;
		}
		const result = runLocal(definition, seed, params, 'preview', editor.actorId);
		if ('error' in result) {
			setError(result.error);
			setPreview(null);
			return;
		}
		setError(null);
		setPreview({ layers: result.output.layers });
	}, [definition, seed, params, editor.actorId, setPreview]);

	// Clear the ghost when the panel unmounts (tool switched away).
	useEffect(() => () => setPreview(null), [setPreview]);

	const localOutput = useMemo(
		() =>
			definition
				? runLocal(definition, seed, params, `gen-${seed}`, editor.actorId)
				: { error: 'No generator selected.' },
		[definition, seed, params, editor.actorId],
	);

	if (!definition) {
		return (
			<div style={{ font: `13px ${T.sans}`, color: T.sub }}>No generators are registered.</div>
		);
	}

	const applyPreset = (id: string) => {
		const preset = definition.presets.find((p) => p.id === id);
		if (!preset) return;
		setParams({ ...paramsFromDefaults(definition), ...preset.values });
		setPresetId(id);
		setAccepted(null);
	};

	const setParam = (id: string, next: ParamValue) => {
		setParams((prev) => ({ ...prev, [id]: next }));
		setPresetId(null);
		setAccepted(null);
	};

	const reroll = () => {
		setSeed(randomSeed(editor.nextId));
		setAccepted(null);
	};

	async function accept() {
		if ('error' in localOutput) {
			setError(localOutput.error);
			return;
		}
		const idPrefix = `gen-${seed}-${Date.now().toString(36)}`;
		// Re-derive the layer ids under the REAL prefix so the Derive step can target them; the command
		// re-runs the generator server-side and produces byte-identical layers under the same prefix.
		const forReal = runLocal(definition, seed, params, idPrefix, editor.actorId);
		const layerIds = 'output' in forReal ? forReal.output.layers.map((l) => l.id) : [];
		const ok = await editor.run({
			type: 'map.generate',
			actorId: editor.actorId,
			payload: {
				mapId: editor.mapId,
				generatorId: definition.id,
				seed,
				params,
				idPrefix,
				visibility: 'dm-only',
			},
		} as never);
		if (!ok) return;
		const out = 'output' in forReal ? forReal.output : localOutput.output;
		setPreview(null);
		setAccepted({
			summary: out.summary ?? null,
			notes: out.notes,
			layerIds,
			seed,
		});
		announce(
			`Generated ${definition.label}${out.summary ? ` — ${out.summary}` : ''}. Layers are DM-only until revealed.`,
		);
		if (quickMapMode) onExit();
	}

	async function deriveFrom(layerIds: string[], seedForDerive: string) {
		if (layerIds.length === 0) return;
		const ok = await editor.run({
			type: 'map.derive-features',
			actorId: editor.actorId,
			payload: {
				mapId: editor.mapId,
				sourceLayerIds: layerIds,
				walls: true,
				doors: true,
				lights: true,
				seed: seedForDerive,
				idPrefix: `drv-${seedForDerive}-${Date.now().toString(36)}`,
				visibility: 'dm-only',
			},
		} as never);
		if (ok) announce('Derived walls, doors, and lights from the generated floors.');
	}

	const previewCount =
		'output' in localOutput
			? localOutput.output.layers.reduce((n, l) => n + l.content.length, 0)
			: 0;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
				<Icon name="tool-generate" size={16} color={T.acc} />
				<span style={{ font: `700 14px ${T.disp}`, color: T.ink, flex: 1 }}>Generate</span>
				<Button variant="ghost" size="sm" icon="close" onClick={onExit}>
					Done
				</Button>
			</div>

			{/* group picker */}
			<div>
				<div style={{ ...eb, marginBottom: 6 }}>Category</div>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
					{groupsWithGenerators.map((g) => {
						const on = g.id === group;
						return (
							<button
								key={g.id}
								type="button"
								aria-pressed={on}
								title={g.description}
								onClick={() => {
									setGroup(g.id);
									const first = generatorsByGroup(g.id)[0];
									if (first) setGeneratorId(first.id);
								}}
								style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
							>
								<Chip tone={on ? 'accent' : 'neutral'} selected={on}>
									{g.label}
								</Chip>
							</button>
						);
					})}
				</div>
			</div>

			{/* generator picker (flagship first) */}
			<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
				{generators.map((g) => {
					const on = g.id === generatorId;
					return (
						<button
							key={g.id}
							type="button"
							aria-pressed={on}
							onClick={() => setGeneratorId(g.id)}
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: 2,
								padding: '9px 11px',
								borderRadius: 9,
								textAlign: 'left',
								cursor: 'pointer',
								background: on ? T.accSub : T.raised,
								border: `1px solid ${on ? T.accBd : T.bd}`,
							}}
						>
							<span style={{ font: `600 13px ${T.sans}`, color: on ? T.acc : T.ink }}>
								{g.label}
							</span>
							<span style={{ font: `11.5px/1.4 ${T.sans}`, color: T.sub }}>{g.description}</span>
							<span style={{ font: `11px/1.4 ${T.sans}`, color: T.ter }}>
								Best for: {g.bestFor}
							</span>
						</button>
					);
				})}
			</div>

			{/* preset chips — the primary interaction */}
			{definition.presets.length > 0 && (
				<div>
					<div style={{ ...eb, marginBottom: 6 }}>Presets</div>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
						{definition.presets.map((p) => {
							const on = p.id === presetId;
							return (
								<button
									key={p.id}
									type="button"
									aria-pressed={on}
									title={p.description}
									onClick={() => applyPreset(p.id)}
									style={{
										padding: '8px 12px',
										borderRadius: 999,
										cursor: 'pointer',
										background: on ? T.acc : T.raised,
										color: on ? T.accFg : T.ink,
										border: `1px solid ${on ? T.acc : T.bdS}`,
										font: `600 12.5px ${T.sans}`,
									}}
								>
									{p.label}
								</button>
							);
						})}
					</div>
				</div>
			)}

			{/* seed */}
			<div>
				<div style={{ ...eb, marginBottom: 6 }}>Seed</div>
				<div style={{ display: 'flex', gap: 6 }}>
					<Input
						ref={seedRef}
						value={seed}
						aria-label="Generation seed"
						onChange={(e: { target: { value: string } }) => setSeed(e.target.value)}
						// Enter used to REROLL, i.e. throw away the seed you had just finished typing — and
						// typing a seed is the whole point of the field (a shared seed reproduces someone
						// else's map exactly). The preview already re-runs from `seed` on every change, so
						// Enter has nothing left to submit; it just must not destroy the input.
						onKeyDown={(e: { key: string; preventDefault: () => void }) => {
							if (e.key === 'Enter') e.preventDefault();
						}}
						style={{ flex: 1, fontFamily: T.mono }}
					/>
					<Button
						variant="secondary"
						size="sm"
						icon="dice"
						onClick={reroll}
						aria-label="Reroll seed"
					>
						Reroll
					</Button>
					<Button
						variant="ghost"
						size="sm"
						icon="duplicate"
						aria-label="Copy seed"
						onClick={() => void navigator.clipboard?.writeText(seed).catch(() => {})}
					/>
				</div>
				<div style={{ font: `11px ${T.sans}`, color: T.ter, marginTop: 4 }}>
					Same seed + settings reproduce an identical map. Reroll for a new one.
				</div>
			</div>

			{/* primary params */}
			<ParamControls
				specs={definition.params}
				values={params}
				onChange={setParam}
				scope="primary"
			/>

			{/* advanced disclosure with a count */}
			{!quickMapMode && definition.params.some((p) => p.advanced) && (
				<div>
					<button
						type="button"
						aria-expanded={showAdvanced}
						onClick={() => setShowAdvanced((v) => !v)}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 6,
							width: '100%',
							padding: '8px 0',
							border: 'none',
							background: 'transparent',
							cursor: 'pointer',
							font: `600 12.5px ${T.sans}`,
							color: T.sub,
						}}
					>
						<Icon name={showAdvanced ? 'chevron-down' : 'chevron-right'} size={15} color={T.ter} />
						Advanced ({definition.params.filter((p) => p.advanced).length} settings)
					</button>
					{showAdvanced && (
						<ParamControls
							specs={definition.params}
							values={params}
							onChange={setParam}
							scope="advanced"
						/>
					)}
				</div>
			)}

			{error && (
				<div
					style={{
						display: 'flex',
						gap: 8,
						padding: '9px 12px',
						borderRadius: 9,
						background: 'var(--color-status-error-subtle)',
						border: `1px solid ${T.err}`,
						font: `12px ${T.sans}`,
						color: 'var(--color-status-error-text)',
					}}
				>
					<Icon name="error" size={15} color={T.err} />
					{error}
				</div>
			)}

			{/* preview → commit controls */}
			<div
				style={{
					position: 'sticky',
					bottom: 0,
					display: 'flex',
					flexDirection: 'column',
					gap: 8,
					padding: '12px 0 2px',
					borderTop: `1px solid ${T.bd}`,
					background: T.surf,
				}}
			>
				<div style={{ font: `11.5px ${T.sans}`, color: T.sub }}>
					{error
						? 'Fix the highlighted setting to preview.'
						: `Ghost preview on the canvas · ${previewCount} features. Accept to add editable layers.`}
				</div>
				<div style={{ display: 'flex', gap: 8 }}>
					<Button
						variant="primary"
						size="sm"
						icon="check"
						// Accept stayed enabled after a successful accept, and a second press re-dispatched
						// map.generate with a fresh idPrefix — silently stamping the whole generated map on
						// top of itself. Rerolling or editing a param clears `accepted` and re-enables it.
						disabled={editor.busy || !!error || !!accepted}
						onClick={() => void accept()}
						style={{ flex: 1 }}
					>
						Accept
					</Button>
					<Button variant="secondary" size="sm" icon="dice" disabled={editor.busy} onClick={reroll}>
						Again
					</Button>
					<Button variant="ghost" size="sm" icon="close" onClick={onExit}>
						Cancel
					</Button>
				</div>
			</div>

			{/* post-accept: summary + notes + derive offer */}
			{accepted && (
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 10,
						padding: 12,
						borderRadius: 10,
						background: 'var(--color-status-success-subtle)',
						border: `1px solid ${T.ok}`,
					}}
				>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
						<Icon name="success" size={16} color={T.ok} />
						<span style={{ font: `600 13px ${T.sans}`, color: T.ink }}>
							Added{accepted.summary ? ` — ${accepted.summary}` : ''}
						</span>
					</div>
					<Button
						variant="secondary"
						size="sm"
						icon="tool-wall"
						disabled={editor.busy || accepted.layerIds.length === 0}
						onClick={() => void deriveFrom(accepted.layerIds, accepted.seed)}
					>
						Derive walls / doors / lights
					</Button>
					{accepted.notes && accepted.notes.length > 0 && (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
							{accepted.notes.slice(0, 6).map((n) => (
								<div key={n.key} style={{ font: `11.5px/1.5 ${T.sans}`, color: T.sub }}>
									<strong style={{ color: T.ink }}>{n.title}</strong> — {n.body}
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
