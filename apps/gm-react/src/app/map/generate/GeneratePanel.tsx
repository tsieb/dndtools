import { type ParamValue } from '@dndtools/core';
import { generatorsByGroup } from '@dndtools/core/map-generators';
import { Button, Chip, Icon, Input } from '../../../ds';
import { copyToClipboard } from '../../../platform/preferences';
import { T, eb } from '../../screen-kit';
import type { MapEditorApi } from '../useMapEditor';
import { GenPreview, paramsFromDefaults, randomSeed, runLocal } from './generationPreview';
import { ParamControls } from './ParamControls';
import { useGenerationPreview } from './useGenerationPreview';

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
	const {
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
	} = useGenerationPreview({
		editor,
		setPreview,
		announce,
		onExit,
		initialGeneratorId,
		quickMapMode,
	});

	if (!definition) {
		return <div style={{ font: `13px ${T.sans}`, color: T.sub }}>{t('mapGenerate.none')}</div>;
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
		const forReal = runLocal(
			definition,
			seed,
			params,
			idPrefix,
			editor.actorId,
			t('mapGenerate.generatorFailed'),
		);
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
		if (ok) announce(t('mapGenerate.derived'));
	}

	const previewCount =
		'output' in localOutput
			? localOutput.output.layers.reduce((n, l) => n + l.content.length, 0)
			: 0;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
				<Icon name="tool-generate" size={16} color={T.acc} />
				<span style={{ font: `700 14px ${T.sans}`, color: T.ink, flex: 1 }}>
					{t('mapGenerate.generate')}
				</span>
				<Button variant="ghost" size="sm" icon="close" onClick={onExit}>
					{t('common.action.done')}
				</Button>
			</div>

			{/* group picker */}
			<div>
				<div style={{ ...eb, marginBottom: 'var(--space-1-5)' }}>{t('mapGenerate.category')}</div>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1-5)' }}>
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
								style={{
									border: 'none',
									background: 'transparent',
									padding: 'var(--space-0)',
									cursor: 'pointer',
								}}
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
			<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
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
								gap: 'var(--space-0-5)',
								padding: 'var(--space-2) var(--space-3)',
								borderRadius: 'var(--radius-md)',
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
								{t('mapGenerate.bestFor')} {g.bestFor}
							</span>
						</button>
					);
				})}
			</div>

			{/* preset chips — the primary interaction */}
			{definition.presets.length > 0 && (
				<div>
					<div style={{ ...eb, marginBottom: 'var(--space-1-5)' }}>{t('mapGenerate.presets')}</div>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1-5)' }}>
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
										padding: 'var(--space-2) var(--space-3)',
										borderRadius: 'var(--radius-full)',
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
				<div style={{ ...eb, marginBottom: 'var(--space-1-5)' }}>{t('mapGenerate.seed')}</div>
				<div style={{ display: 'flex', gap: 'var(--space-1-5)' }}>
					<Input
						ref={seedRef}
						value={seed}
						aria-label={t('mapGenerate.seedLabel')}
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
						aria-label={t('mapGenerate.rerollSeed')}
					>
						{t('mapGenerate.reroll')}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						icon="duplicate"
						aria-label={t('mapGenerate.copySeed')}
						onClick={() => void copyToClipboard(seed)}
					/>
				</div>
				<div style={{ font: `11px ${T.sans}`, color: T.ter, marginTop: 'var(--space-1)' }}>
					{t('mapGenerate.seedHintFull')}
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
							gap: 'var(--space-1-5)',
							width: '100%',
							padding: 'var(--space-2) var(--space-0)',
							border: 'none',
							background: 'transparent',
							cursor: 'pointer',
							font: `600 12.5px ${T.sans}`,
							color: T.sub,
						}}
					>
						<Icon name={showAdvanced ? 'chevron-down' : 'chevron-right'} size={15} color={T.ter} />
						{t('mapGenerate.advanced', {
							count: definition.params.filter((p) => p.advanced).length,
						})}
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
						gap: 'var(--space-2)',
						padding: 'var(--space-2) var(--space-3)',
						borderRadius: 'var(--radius-md)',
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
					gap: 'var(--space-2)',
					padding: 'var(--space-3) var(--space-0) var(--space-0-5)',
					borderTop: `1px solid ${T.bd}`,
					background: T.surf,
				}}
			>
				<div style={{ font: `11.5px ${T.sans}`, color: T.sub }}>
					{error
						? t('mapGenerate.fixSetting')
						: t('mapGenerate.ghostPreview', { count: previewCount })}
				</div>
				<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
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
						{t('mapGenerate.accept')}
					</Button>
					<Button variant="secondary" size="sm" icon="dice" disabled={editor.busy} onClick={reroll}>
						{t('mapGenerate.again')}
					</Button>
					<Button variant="ghost" size="sm" icon="close" onClick={onExit}>
						{t('common.action.cancel')}
					</Button>
				</div>
			</div>

			{/* post-accept: summary + notes + derive offer */}
			{accepted && (
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 'var(--space-2)',
						padding: 'var(--space-3)',
						borderRadius: 'var(--radius-md)',
						background: 'var(--color-status-success-subtle)',
						border: `1px solid ${T.ok}`,
					}}
				>
					<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
						<Icon name="success" size={16} color={T.ok} />
						<span style={{ font: `600 13px ${T.sans}`, color: T.ink }}>
							{accepted.summary
								? t('mapGenerate.addedWithSummary', { summary: accepted.summary })
								: t('mapGenerate.added')}
						</span>
					</div>
					<Button
						variant="secondary"
						size="sm"
						icon="tool-wall"
						disabled={editor.busy || accepted.layerIds.length === 0}
						onClick={() => void deriveFrom(accepted.layerIds, accepted.seed)}
					>
						{t('mapGenerate.derive')}
					</Button>
					{accepted.notes && accepted.notes.length > 0 && (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
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

export type { GenPreview } from './generationPreview';
