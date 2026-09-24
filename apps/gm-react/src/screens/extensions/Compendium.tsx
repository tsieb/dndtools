import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Icon, Input, SegmentedControl, Select } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import {
	isAbortError,
	searchMonsters,
	searchSpells,
	type Open5eDocument,
} from '../../app/compendium/open5e';
import { formatCr, type ImportSourceMeta } from '../../app/compendium/import';
import type {
	CompendiumKind,
	CompendiumMonster,
	CompendiumResult,
	CompendiumSpell,
} from '../../app/compendium/types';
import { useI18n, type MessageKey, type MessageValues } from '../../i18n';
import { MonsterDetail, SpellDetail } from './CompendiumEntry';
import { CompendiumResults } from './CompendiumResults';
import { CompendiumSourcePicker } from './CompendiumSourcePicker';
import { ReadOnlyNote } from './shared';
import { useCompendiumImport } from './useCompendiumImport';

type Translate = (key: MessageKey, values?: MessageValues) => string;

/* ---- Compendium (real Open5e browse + import) --------------------------------------------------- */

const CR_VALUES = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];
// The filter options are copy, so they are built per locale rather than frozen at module load.
const crOptions = (t: Translate) => [
	{ value: 'any', label: t('extensions.compendium.anyCr') },
	...CR_VALUES.map((cr) => ({
		value: String(cr),
		label: t('extensions.compendium.crValue', { cr: formatCr(cr) }),
	})),
];
const levelOptions = (t: Translate) => [
	{ value: 'any', label: t('extensions.compendium.anyLevel') },
	{ value: '0', label: t('extensions.compendium.cantrip') },
	...Array.from({ length: 9 }, (_, i) => ({
		value: String(i + 1),
		label: t('extensions.compendium.levelValue', { level: i + 1 }),
	})),
];

export function ExtCompendium() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const isPhone = useViewport() === 'phone';
	const dmId = runtime.defaultActorId;
	const isDm = runtime.state.permissions.actors[dmId]?.role === 'dm';
	const canWrite = isDm && !runtime.preview;

	const [kind, setKind] = useState<CompendiumKind>('monster');
	const [search, setSearch] = useState('');
	const [cr, setCr] = useState('any');
	const [level, setLevel] = useState('any');
	const [loading, setLoading] = useState(true);
	const [result, setResult] = useState<CompendiumResult<
		CompendiumMonster | CompendiumSpell
	> | null>(null);
	const [selKey, setSelKey] = useState<string | null>(null);
	const [activeDoc, setActiveDoc] = useState<Open5eDocument | null>(null); // null = the default SRD
	const abortRef = useRef<AbortController | null>(null);
	const crOpts = useMemo(() => crOptions(t), [t]);
	const levelOpts = useMemo(() => levelOptions(t), [t]);

	// Debounced, abortable search — live Open5e first, bundled SRD on network failure (the client
	// re-throws intentional aborts so a stale query can never clobber a fresh one).
	useEffect(() => {
		const ctrl = new AbortController();
		abortRef.current?.abort();
		abortRef.current = ctrl;
		setLoading(true);
		const timer = setTimeout(() => {
			const query = {
				search: search.trim() || undefined,
				cr: kind === 'monster' && cr !== 'any' ? Number(cr) : undefined,
				level: kind === 'spell' && level !== 'any' ? Number(level) : undefined,
				documentKey: activeDoc?.key,
				limit: 40,
			};
			const opts = { signal: ctrl.signal, document: activeDoc ?? undefined };
			const run = kind === 'monster' ? searchMonsters(query, opts) : searchSpells(query, opts);
			run
				.then((res) => {
					if (ctrl.signal.aborted) return;
					setResult(res);
					setLoading(false);
				})
				.catch((error: unknown) => {
					if (isAbortError(error) || ctrl.signal.aborted) return;
					setResult(null); // bundled fallback failed too — the empty state below says so
					setLoading(false);
				});
		}, 250);
		return () => {
			clearTimeout(timer);
			ctrl.abort();
		};
	}, [kind, search, cr, level, activeDoc]);

	const sourceMeta: ImportSourceMeta | null = result
		? { document: result.document, license: result.license, attribution: result.attribution }
		: null;
	const importProps = useCompendiumImport(kind, sourceMeta);

	const entries = result?.entries ?? [];
	const selected = entries.find((e) => e.key === selKey) ?? null;

	const sourceBadge = loading ? (
		<Badge status="neutral">{t('extensions.compendium.searching')}</Badge>
	) : result?.source === 'live' ? (
		<Badge status="success" icon="check">
			{t('extensions.compendium.sourceLive')}
		</Badge>
	) : result ? (
		<Badge status="warning" icon="warning">
			{t('extensions.compendium.sourceOffline')}
		</Badge>
	) : (
		<Badge status="error" icon="warning">
			{t('extensions.compendium.sourceUnavailable')}
		</Badge>
	);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
			<div
				// Two `fr` tracks squeeze rather than overflow, so this never tripped the overflow
				// sweep — it just left the search field ~15px wide and the stat grid ~12px per cell
				// on a phone. Stack instead, as /community already does.
				style={{
					display: 'grid',
					gridTemplateColumns: isPhone ? 'minmax(0, 1fr)' : '1.35fr 1fr',
					gap: 'var(--space-4)',
					alignItems: 'start',
				}}
			>
				<Panel title={t('extensions.compendium.title')} action={sourceBadge}>
					{!canWrite && <ReadOnlyNote>{t('extensions.compendium.readOnly')}</ReadOnlyNote>}
					{/* kind selector */}
					<div style={{ marginBottom: 'var(--space-2)' }}>
						<SegmentedControl
							ariaLabel={t('extensions.compendium.kind')}
							size="sm"
							value={kind}
							onChange={(id: string) => {
								setKind(id as CompendiumKind);
								setSelKey(null);
								importProps.setConfirmKey(null);
							}}
							options={[
								{
									value: 'monster',
									label: (
										<>
											<Icon name="monster-claw" size={14} />
											{t('extensions.compendium.monsters')}
											{kind === 'monster' && result ? (
												<span style={{ fontFamily: T.mono }}>{result.total}</span>
											) : null}
										</>
									),
								},
								{
									value: 'spell',
									label: (
										<>
											<Icon name="spell-sparkle" size={14} />
											{t('extensions.compendium.spells')}
											{kind === 'spell' && result ? (
												<span style={{ fontFamily: T.mono }}>{result.total}</span>
											) : null}
										</>
									),
								},
							]}
						/>
					</div>
					{/* search + filter */}
					<div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
						<span style={{ flex: 1, minWidth: 0 }}>
							<Input
								value={search}
								onChange={(e: { target: { value: string } }) => setSearch(e.target.value)}
								placeholder={t(
									kind === 'monster'
										? 'extensions.compendium.searchMonsters'
										: 'extensions.compendium.searchSpells',
								)}
								aria-label={t('extensions.compendium.searchLabel')}
							/>
						</span>
						<span style={{ flex: '0 0 130px' }}>
							{kind === 'monster' ? (
								<Select
									aria-label={t('extensions.compendium.filterCr')}
									options={crOpts}
									value={cr}
									onChange={(e: { target: { value: string } }) => setCr(e.target.value)}
								/>
							) : (
								<Select
									aria-label={t('extensions.compendium.filterLevel')}
									options={levelOpts}
									value={level}
									onChange={(e: { target: { value: string } }) => setLevel(e.target.value)}
								/>
							)}
						</span>
					</div>
					<CompendiumSourcePicker
						activeDoc={activeDoc}
						resultSource={result?.source}
						onChoose={(doc) => {
							setActiveDoc(doc);
							setSelKey(null);
						}}
					/>
					<CompendiumResults
						kind={kind}
						loading={loading}
						result={result}
						selKey={selKey}
						onSelect={setSelKey}
						imports={importProps}
					/>
				</Panel>
				{/* detail panel */}
				<Panel
					accent
					title={selected ? selected.name : t('extensions.compendium.entryDetails')}
					action={
						selected && (
							<Badge status="info">
								{t(
									kind === 'monster'
										? 'extensions.compendium.monster'
										: 'extensions.compendium.spell',
								)}
							</Badge>
						)
					}
				>
					{!selected && (
						<div style={{ font: `var(--text-sm)/1.55 ${T.sans}`, color: T.sub }}>
							{t('extensions.compendium.selectPrompt')}
						</div>
					)}
					{selected && kind === 'monster' && (
						<MonsterDetail monster={selected as CompendiumMonster} imports={importProps} />
					)}
					{selected && kind === 'spell' && (
						<SpellDetail spell={selected as CompendiumSpell} imports={importProps} />
					)}
				</Panel>
			</div>
			{/* LEGAL: the license attribution for the rendered material must stay visible on this surface. */}
			{result && (
				<div
					style={{
						display: 'flex',
						gap: 'var(--space-2)',
						alignItems: 'flex-start',
						padding: 'var(--space-2) var(--space-3)',
						border: `1px solid ${T.bd}`,
						borderRadius: 'var(--radius-lg)',
						background: T.alt,
					}}
				>
					<Badge status="neutral">{result.license}</Badge>
					<span style={{ font: `var(--text-xs)/1.6 ${T.sans}`, color: T.sub }}>
						{result.attribution}
					</span>
				</div>
			)}
		</div>
	);
}
