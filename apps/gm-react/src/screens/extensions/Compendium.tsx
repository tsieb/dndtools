import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	getContentItemsForActor,
	listCharactersForActor,
	VAULT_OBJECT_SUBTYPE_KEY,
} from '@dndtools/core';
import {
	Badge,
	Button,
	EmptyState,
	Icon,
	Input,
	SegmentedControl,
	Select,
	Skeleton,
	Toaster,
} from '../../ds';
import { LoadingRegion, Panel, T } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import {
	isAbortError,
	listDocuments,
	searchMonsters,
	searchSpells,
	SRD_DOCUMENT_KEY,
	type Open5eDocument,
} from '../../app/compendium/open5e';
import {
	formatCr,
	monsterToQuickCreatePayload,
	spellToCreateObjectPayload,
	type ImportSourceMeta,
} from '../../app/compendium/import';
import type {
	CompendiumKind,
	CompendiumMonster,
	CompendiumResult,
	CompendiumSpell,
} from '../../app/compendium/types';
import { eventField } from './shared';
import {
	ImportControl,
	MonsterDetail,
	monsterMeta,
	SpellDetail,
	spellMeta,
	type EntryImportProps,
} from './CompendiumEntry';

/* ---- Compendium (real Open5e browse + import) --------------------------------------------------- */

const CR_VALUES = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];
const CR_OPTIONS = [
	{ value: 'any', label: 'Any CR' },
	...CR_VALUES.map((cr) => ({ value: String(cr), label: `CR ${formatCr(cr)}` })),
];
const LEVEL_OPTIONS = [
	{ value: 'any', label: 'Any level' },
	{ value: '0', label: 'Cantrip' },
	...Array.from({ length: 9 }, (_, i) => ({ value: String(i + 1), label: `Level ${i + 1}` })),
];

export function ExtCompendium() {
	const runtime = useRuntime();
	const isPhone = useViewport() === 'phone';
	const navigate = useNavigate();
	const dmId = runtime.defaultActorId;
	const previewing = !!runtime.preview;
	const isDm = runtime.state.permissions.actors[dmId]?.role === 'dm';
	const canWrite = isDm && !previewing;

	const [kind, setKind] = useState<CompendiumKind>('monster');
	const [search, setSearch] = useState('');
	const [cr, setCr] = useState('any');
	const [level, setLevel] = useState('any');
	const [loading, setLoading] = useState(true);
	const [result, setResult] = useState<CompendiumResult<
		CompendiumMonster | CompendiumSpell
	> | null>(null);
	const [selKey, setSelKey] = useState<string | null>(null);
	const [busyKey, setBusyKey] = useState<string | null>(null);
	const [confirmKey, setConfirmKey] = useState<string | null>(null);
	// Non-SRD sources: an explicit opt-in that shows each source's own license before any fetch.
	const [sourceUiOpen, setSourceUiOpen] = useState(false);
	const [docs, setDocs] = useState<Open5eDocument[] | null>(null);
	const [docsError, setDocsError] = useState<string | null>(null);
	const [pendingDocKey, setPendingDocKey] = useState(SRD_DOCUMENT_KEY);
	const [activeDoc, setActiveDoc] = useState<Open5eDocument | null>(null); // null = the default SRD
	const abortRef = useRef<AbortController | null>(null);

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

	// Duplicate guards — what is ALREADY in the vault, by (case-insensitive) name.
	const rosterNames = useMemo(
		() =>
			new Set(
				listCharactersForActor(runtime.state.characters, runtime.state.permissions, dmId).map((c) =>
					c.name.trim().toLowerCase(),
				),
			),
		[runtime.state.characters, runtime.state.permissions, dmId],
	);
	const spellTitles = useMemo(
		() =>
			new Set(
				getContentItemsForActor(runtime.state.content, runtime.state.permissions, dmId)
					.filter(
						(item) => item.kind === 'object' && item.fields[VAULT_OBJECT_SUBTYPE_KEY] === 'spell',
					)
					.map((item) => item.title.trim().toLowerCase()),
			),
		[runtime.state.content, runtime.state.permissions, dmId],
	);
	const inVault = (name: string) =>
		(kind === 'monster' ? rosterNames : spellTitles).has(name.trim().toLowerCase());

	const sourceMeta: ImportSourceMeta | null = result
		? { document: result.document, license: result.license, attribution: result.attribution }
		: null;

	const importEntry = async (entry: CompendiumMonster | CompendiumSpell) => {
		if (!canWrite || busyKey !== null || !sourceMeta) return;
		setBusyKey(entry.key);
		try {
			if (kind === 'monster') {
				const monster = entry as CompendiumMonster;
				const res = await runtime.dispatch({
					type: 'character.quick-create',
					actorId: dmId,
					payload: monsterToQuickCreatePayload(monster, sourceMeta),
				});
				if (res.status === 'rejected') {
					Toaster.error(`${monster.name} was not imported: ${res.rejection.message}`);
					return;
				}
				const id = eventField(res, 'character.created', 'characterId');
				Toaster.success(
					`${monster.name} added to the roster (DM-only)`,
					id ? { action: 'Open', onAction: () => navigate(`/characters/${id}`) } : undefined,
				);
			} else {
				const spell = entry as CompendiumSpell;
				const res = await runtime.dispatch({
					type: 'content.create-object',
					actorId: dmId,
					payload: spellToCreateObjectPayload(spell, sourceMeta),
				});
				if (res.status === 'rejected') {
					Toaster.error(`${spell.name} was not imported: ${res.rejection.message}`);
					return;
				}
				const id = eventField(res, 'content.object-changed', 'itemId');
				Toaster.success(
					`${spell.name} saved to the vault (DM-only)`,
					id ? { action: 'Open', onAction: () => navigate(`/knowledge/${id}`) } : undefined,
				);
			}
		} catch (error) {
			Toaster.error(error instanceof Error ? error.message : String(error));
		} finally {
			setBusyKey(null);
			setConfirmKey(null);
		}
	};

	const openSourcePicker = () => {
		setSourceUiOpen(true);
		if (docs) return;
		// Was `if (docs || docsError) return`, which made a single failed fetch permanent: the error
		// latched, so every later attempt short-circuited and the list could never load again even
		// after the network came back.
		setDocsError(null);
		listDocuments()
			.then(setDocs)
			.catch(() =>
				setDocsError(
					'The Open5e source list could not be reached — only the bundled SRD is available offline.',
				),
			);
	};
	const pendingDoc = docs?.find((d) => d.key === pendingDocKey) ?? null;

	const entries = result?.entries ?? [];
	const selected = entries.find((e) => e.key === selKey) ?? null;
	const importProps: EntryImportProps = {
		inVault,
		busyKey,
		confirmKey,
		setConfirmKey,
		importEntry,
		canWrite,
	};
	const sourceBadge = loading ? (
		<Badge status="neutral">searching…</Badge>
	) : result?.source === 'live' ? (
		<Badge status="success" icon="check">
			Live · Open5e API
		</Badge>
	) : result ? (
		<Badge status="warning" icon="warning">
			Offline — bundled SRD
		</Badge>
	) : (
		<Badge status="error" icon="warning">
			unavailable
		</Badge>
	);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
			<div
				// Two `fr` tracks squeeze rather than overflow, so this never tripped the overflow
				// sweep — it just left the search field ~15px wide and the stat grid ~12px per cell
				// on a phone. Stack instead, as /community already does.
				style={{
					display: 'grid',
					gridTemplateColumns: isPhone ? 'minmax(0, 1fr)' : '1.35fr 1fr',
					gap: 18,
					alignItems: 'start',
				}}
			>
				<Panel title="Open5e compendium" action={sourceBadge}>
					{!canWrite && (
						<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter, marginBottom: 8 }}>
							Importing is DM-only and read-only while previewing — browsing works, the import
							buttons are disabled.
						</div>
					)}
					{/* kind selector */}
					<div style={{ marginBottom: 10 }}>
						<SegmentedControl
							ariaLabel="Compendium entry kind"
							size="sm"
							value={kind}
							onChange={(id: string) => {
								setKind(id as CompendiumKind);
								setSelKey(null);
								setConfirmKey(null);
							}}
							options={[
								{
									value: 'monster',
									label: (
										<>
											<Icon name="monster-claw" size={14} />
											Monsters
											{kind === 'monster' && result ? (
												<span style={{ opacity: 0.75 }}>{result.total}</span>
											) : null}
										</>
									),
								},
								{
									value: 'spell',
									label: (
										<>
											<Icon name="spell-sparkle" size={14} />
											Spells
											{kind === 'spell' && result ? (
												<span style={{ opacity: 0.75 }}>{result.total}</span>
											) : null}
										</>
									),
								},
							]}
						/>
					</div>
					{/* search + filter */}
					<div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
						<span style={{ flex: 1, minWidth: 0 }}>
							<Input
								value={search}
								onChange={(e: { target: { value: string } }) => setSearch(e.target.value)}
								placeholder={
									kind === 'monster' ? 'Search monsters by name…' : 'Search spells by name…'
								}
								aria-label="Search the compendium by name"
							/>
						</span>
						<span style={{ flex: '0 0 130px' }}>
							{kind === 'monster' ? (
								<Select
									aria-label="Filter by challenge rating"
									options={CR_OPTIONS}
									value={cr}
									onChange={(e: { target: { value: string } }) => setCr(e.target.value)}
								/>
							) : (
								<Select
									aria-label="Filter by spell level"
									options={LEVEL_OPTIONS}
									value={level}
									onChange={(e: { target: { value: string } }) => setLevel(e.target.value)}
								/>
							)}
						</span>
					</div>
					{/* source document (non-SRD needs an explicit opt-in that shows the source's license) */}
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 8,
							padding: '8px 10px',
							border: `1px solid ${T.bd}`,
							borderRadius: 9,
							background: T.alt,
							marginBottom: 12,
						}}
					>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
							<span style={{ font: `12px ${T.sans}`, color: T.sub, flex: 1, minWidth: 0 }}>
								Source:{' '}
								<span style={{ font: `600 12px ${T.sans}`, color: T.ink }}>
									{activeDoc ? activeDoc.name : 'SRD 5.1'}
								</span>{' '}
								<span style={{ color: T.ter }}>
									·{' '}
									{activeDoc
										? activeDoc.licenses.map((l) => l.name).join(', ') || 'see publisher'
										: 'CC-BY-4.0'}
								</span>
							</span>
							{!sourceUiOpen && (
								<Button variant="ghost" size="sm" onClick={openSourcePicker}>
									Other sources…
								</Button>
							)}
						</div>
						{sourceUiOpen && (
							<>
								{!docs && !docsError && <Skeleton height={30} />}
								{docsError && (
									// Cancel lives inside the `{docs && …}` branch below and the "Other sources…"
									// trigger is hidden while the picker is open, so a failed fetch used to leave
									// this panel stuck open forever — no way out, and no way to try again. The
									// error state needs its own two exits.
									<>
										<div role="alert" style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>
											{docsError}
										</div>
										<div style={{ display: 'flex', gap: 6 }}>
											<Button variant="secondary" size="sm" onClick={openSourcePicker}>
												Try again
											</Button>
											<Button variant="ghost" size="sm" onClick={() => setSourceUiOpen(false)}>
												Cancel
											</Button>
										</div>
									</>
								)}
								{docs && (
									<>
										<Select
											aria-label="Choose a source document"
											options={docs.map((d) => ({
												value: d.key,
												label: `${d.name} — ${d.publisher}`,
											}))}
											value={pendingDocKey}
											onChange={(e: { target: { value: string } }) =>
												setPendingDocKey(e.target.value)
											}
										/>
										{pendingDoc && (
											<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>
												License:{' '}
												<span style={{ color: T.sub }}>
													{pendingDoc.licenses.map((l) => l.name).join(', ') ||
														'see the publisher’s terms'}
												</span>
												{pendingDoc.permalink ? ` · ${pendingDoc.permalink}` : ''}. Content from
												this source is fetched live from the Open5e API and remains under its
												publisher’s license.
											</div>
										)}
										<div style={{ display: 'flex', gap: 6 }}>
											<Button
												variant="secondary"
												size="sm"
												disabled={!pendingDoc}
												onClick={() => {
													setActiveDoc(
														pendingDoc && pendingDoc.key !== SRD_DOCUMENT_KEY ? pendingDoc : null,
													);
													setSourceUiOpen(false);
													setSelKey(null);
												}}
											>
												Use this source
											</Button>
											<Button variant="ghost" size="sm" onClick={() => setSourceUiOpen(false)}>
												Cancel
											</Button>
										</div>
									</>
								)}
							</>
						)}
						{activeDoc && result?.source === 'bundled' && (
							<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.err }}>
								{activeDoc.name} needs the live API — offline results below are the bundled SRD
								instead.
							</div>
						)}
					</div>
					{/* results */}
					{loading && (
						// The region used to name itself with `aria-label` and hold nothing but
						// `aria-hidden` Skeletons, so the debounced compendium search announced neither
						// its loading nor its completion. LoadingRegion puts the text INSIDE.
						<LoadingRegion
							label="Loading results"
							style={{ display: 'flex', flexDirection: 'column', gap: 9 }}
						>
							{[0, 1, 2, 3].map((i) => (
								<Skeleton key={i} height={62} />
							))}
						</LoadingRegion>
					)}
					{!loading && !result && (
						<EmptyState
							icon="warning"
							title="Compendium unavailable"
							description="Neither the online compendium nor the bundled reference could be loaded — check your connection and reload."
						/>
					)}
					{!loading && result && entries.length === 0 && (
						<EmptyState
							icon="search"
							title="No matches"
							description={`Nothing in ${result.document} matches this search — try a different name or clear the filter.`}
						/>
					)}
					{!loading && entries.length > 0 && (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
							{entries.map((entry) => {
								const dup = inVault(entry.name);
								return (
									// The row used to be a role="button" div WRAPPING the real Import buttons —
									// nested interactive controls, which collapse the card and its action into
									// one ambiguous control in AT browse mode. The selectable thing is now the
									// text block below, a real <button> that is a SIBLING of the Import control.
									<div
										key={entry.key}
										style={{
											display: 'flex',
											gap: 12,
											padding: 12,
											borderRadius: 10,
											textAlign: 'left',
											border: `1px solid ${selKey === entry.key ? T.accBd : T.bd}`,
											background: selKey === entry.key ? T.accSub : T.surf,
										}}
									>
										<button
											type="button"
											aria-pressed={selKey === entry.key}
											aria-label={`Select ${entry.name}`}
											onClick={() => setSelKey(entry.key)}
											style={{
												flex: 1,
												minWidth: 0,
												display: 'block',
												textAlign: 'left',
												padding: 0,
												border: 'none',
												background: 'transparent',
												color: 'inherit',
												font: 'inherit',
												cursor: 'pointer',
											}}
										>
											<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
												<span style={{ font: `600 13.5px ${T.sans}` }}>{entry.name}</span>
												{dup && (
													<Badge status="success" icon="check">
														In vault
													</Badge>
												)}
											</div>
											<div style={{ font: `11.5px ${T.mono}`, color: T.ter, margin: '2px 0 0' }}>
												{kind === 'monster'
													? monsterMeta(entry as CompendiumMonster)
													: spellMeta(entry as CompendiumSpell)}
											</div>
										</button>
										<span onClick={(e) => e.stopPropagation()} style={{ alignSelf: 'center' }}>
											<ImportControl
												name={entry.name}
												inVault={dup}
												busy={busyKey === entry.key}
												disabled={!canWrite || (busyKey !== null && busyKey !== entry.key)}
												confirming={confirmKey === entry.key}
												onConfirmChange={(on) => setConfirmKey(on ? entry.key : null)}
												onImport={() => void importEntry(entry)}
											/>
										</span>
									</div>
								);
							})}
							{result && result.total > entries.length && (
								<div
									style={{
										font: `11.5px ${T.sans}`,
										color: T.ter,
										textAlign: 'center',
										padding: '2px 0 0',
									}}
								>
									Showing the first {entries.length} of {result.total} matches — refine the search
									to narrow it down.
								</div>
							)}
						</div>
					)}
				</Panel>
				{/* detail panel */}
				<Panel
					accent
					title={selected ? selected.name : 'Entry details'}
					action={
						selected && <Badge status="info">{kind === 'monster' ? 'Monster' : 'Spell'}</Badge>
					}
				>
					{!selected && (
						<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.ter }}>
							Select an entry to review its statblock before importing. Monsters land in the roster
							as DM-only quick-create characters (usable in the Encounter Builder); spells become
							DM-only vault objects on the Knowledge screen.
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
						gap: 10,
						alignItems: 'flex-start',
						padding: '10px 14px',
						border: `1px solid ${T.bd}`,
						borderRadius: 10,
						background: T.alt,
					}}
				>
					<Badge status="neutral">{result.license}</Badge>
					<span style={{ font: `11px/1.6 ${T.sans}`, color: T.ter }}>{result.attribution}</span>
				</div>
			)}
		</div>
	);
}
