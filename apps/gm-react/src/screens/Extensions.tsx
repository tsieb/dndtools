import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	buildWidgetPackageReviewSummary,
	exportWidgetPackage,
	getContentItemsForActor,
	listCharactersForActor,
	scaffoldCustomWidgetPackageDraft,
	VAULT_OBJECT_SUBTYPE_KEY,
	type CommandResult,
	type WidgetPackageDefinition,
} from '@dndtools/core';
import { Badge, Button, EmptyState, HPBar, Icon, Input, Select, Skeleton, Switch, Tabs, Textarea, Toaster, VisibilityChip } from '../ds';
import { Page, Panel, T, eb, mono } from '../app/screen-kit';
import { DNDExt } from '../runtime/mockCampaign';
import { useRuntime } from '../runtime/RuntimeContext';
import {
	isAbortError,
	listDocuments,
	searchMonsters,
	searchSpells,
	SRD_DOCUMENT_KEY,
	type Open5eDocument,
} from '../app/compendium/open5e';
import {
	formatCr,
	monsterToQuickCreatePayload,
	spellDuration,
	spellToCreateObjectPayload,
	type ImportSourceMeta,
} from '../app/compendium/import';
import type {
	CompendiumKind,
	CompendiumMonster,
	CompendiumResult,
	CompendiumSpell,
} from '../app/compendium/types';

/**
 * Extensions & Systems — plugins, compendium import, custom object types, the rules-system switch, and
 * the theme studio (port of app.jsx ExtensibilitySection).
 *
 * REAL CORE WIRING — the Plugins tab is the live widget-package registry (`runtime.state.widgets`):
 *   - the installed list renders the actual registry records with the capability/host-permission
 *     profile computed by `buildWidgetPackageReviewSummary` and their trust posture;
 *   - install (bundled starter library or pasted package JSON), enable, disable, remove and upgrade
 *     all dispatch the real `widget.package.*` commands (DM-only). Installs land unreviewed with
 *     every host permission denied — fail-closed; there is no trust-review command in this build,
 *     so that denial is permanent (only code-defined `system.*` packages are trusted). Upgrades run
 *     declared migrations against every placed widget; removes leave placed widgets as disabled
 *     placeholders. All of it persists.
 *
 * REAL — the Compendium tab browses the Open5e v2 API (default: the CC-BY-4.0 SRD; other source
 * documents only behind an explicit opt-in that shows each source's own license) with an offline
 * fallback to the bundled SRD dataset (`app/compendium/`), and IMPORTS entries through real core
 * commands: a monster dispatches `character.quick-create` (kind 'monster' — lands in the roster and
 * the EncounterBuilder), a spell dispatches `content.create-object` (subtype 'spell'). Duplicate
 * names are flagged with an explicit re-import confirm — never silent.
 *
 * HONEST STUBS (no core command on this surface, clearly noted in each panel):
 *   - Community marketplace: browsing/fetching community packages needs a network backend — nothing
 *     is fetched; the panel says so and offers no fake controls.
 *   - Object types: a custom-type schema editor has no Core command here — local draft state.
 *   - System switch: swapping the rules system has no Core command here — local selection only.
 *   - Theme studio: the live `data-theme` swap IS real (DOM), token import/export is a local preview.
 */

const EXT = DNDExt as any;
const TRUST_TONE: Record<string, string> = { trusted: 'success', unreviewed: 'warning', denied: 'error' };
const HOST_PERM_LABEL: Record<string, string> = {
	filesystem: 'Filesystem',
	clipboard: 'Clipboard',
	network: 'Network',
	'source-adapter': 'Source adapter',
	asset: 'Assets',
	'external-link': 'External links',
};

// Bundled starter library — packages the Core itself scaffolds (`scaffoldCustomWidgetPackageDraft`),
// so every entry is valid by construction and still goes through the full `widget.package.install`
// validation + trust pipeline. This is NOT a marketplace: nothing is fetched from anywhere.
const STARTER_LIBRARY = [
	{
		packageId: 'starter.table-roller',
		widgetType: 'table-roller',
		name: 'Table Roller Panel',
		desc: 'A sandboxed starter widget shell for rolling on your own random tables.',
	},
	{
		packageId: 'starter.weather-tracker',
		widgetType: 'weather-tracker',
		name: 'Weather Tracker',
		desc: 'A sandboxed starter widget shell for tracking travel weather scene to scene.',
	},
	{
		packageId: 'starter.loot-ledger',
		widgetType: 'loot-ledger',
		name: 'Party Loot Ledger',
		desc: 'A sandboxed starter widget shell for logging treasure splits between sessions.',
	},
] as const;

function buildStarterPackage(entry: (typeof STARTER_LIBRARY)[number]): WidgetPackageDefinition {
	const draft = scaffoldCustomWidgetPackageDraft({
		packageId: entry.packageId,
		widgetType: entry.widgetType,
		displayName: entry.name,
		description: entry.desc,
	});
	// The scaffolder stamps drafts as LLM-`generated`; these ship with the app, so re-stamp the
	// provenance as `workspace` (a first-party bundled draft, not model output).
	return { ...draft.package, authoring: { source: 'workspace', createdBy: 'starter-library' } };
}

function ExtPlugins() {
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	const previewing = !!runtime.preview;
	const isDm = runtime.state.permissions.actors[dmId]?.role === 'dm';
	const canWrite = isDm && !previewing;
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
	const [jsonDraft, setJsonDraft] = useState('');
	const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
	// The live widget-package registry — the "plugins" of this app. A removed package is gone, not listed.
	const packages = useMemo(
		() => Object.values(runtime.state.widgets.packages).filter((rec: any) => !rec.removedAt),
		[runtime.state.widgets],
	);

	// Shared result surfacing: success copy on accept, the Core rejection (with its per-field zod/
	// validation issues) on reject. A thrown dispatch (failed durable write) also lands here.
	const finish = (result: CommandResult, okText: string) => {
		if (result.status === 'accepted') {
			setMsg({ tone: 'success', text: okText });
		} else {
			const issues = (result.rejection.issues ?? []).map((i) => `${i.path}: ${i.message}`).join(' · ');
			setMsg({ tone: 'error', text: issues ? `${result.rejection.message} ${issues}` : result.rejection.message });
		}
	};
	const guard = (fn: () => Promise<void>) => {
		if (busy) return;
		setBusy(true);
		void fn()
			.catch((error: unknown) => setMsg({ tone: 'error', text: error instanceof Error ? error.message : String(error) }))
			.finally(() => setBusy(false));
	};

	const setEnabled = (packageId: string, enabled: boolean) =>
		guard(async () => {
			if (enabled) {
				finish(
					await runtime.dispatch({ type: 'widget.package.enable', actorId: dmId, payload: { packageId } }),
					`Enabled ${packageId}.`,
				);
			} else {
				finish(
					await runtime.dispatch({
						type: 'widget.package.disable',
						actorId: dmId,
						payload: { packageId, reason: 'Disabled by widget manager.' },
					}),
					`Disabled ${packageId} — its placed widgets are paused until re-enabled.`,
				);
			}
		});

	const removePackage = (packageId: string) =>
		guard(async () => {
			setConfirmRemoveId(null);
			finish(
				await runtime.dispatch({ type: 'widget.package.remove', actorId: dmId, payload: { packageId } }),
				`Removed ${packageId} — its placed widgets remain as disabled placeholders.`,
			);
		});

	const installStarter = (entry: (typeof STARTER_LIBRARY)[number]) =>
		guard(async () => {
			finish(
				await runtime.dispatch({
					type: 'widget.package.install',
					actorId: dmId,
					payload: { package: buildStarterPackage(entry) },
				}),
				`Installed ${entry.name} — unreviewed, every host permission denied (fail-closed). Flip its switch above to enable it.`,
			);
		});

	// Prefill the JSON box with a card's real definition — the working upgrade path: export, bump
	// `version` (declare `migrations` for placed widgets), paste back, and Install/upgrade.
	const exportToDraft = (packageId: string) => {
		const exported = exportWidgetPackage(runtime.state.widgets, { ids: () => runtime.newId() }, packageId);
		if ('kind' in exported) {
			setMsg({ tone: 'error', text: `Package ${packageId} could not be exported (${exported.reason}).` });
			return;
		}
		setJsonDraft(JSON.stringify(exported.package, null, 2));
		setMsg({
			tone: 'info',
			text: `Exported ${packageId} into the JSON box below — bump "version" (and declare "migrations" for placed widgets) to upgrade it.`,
		});
	};

	const applyJson = () =>
		guard(async () => {
			let parsed: unknown;
			try {
				parsed = JSON.parse(jsonDraft);
			} catch (error) {
				setMsg({ tone: 'error', text: `Not valid JSON: ${error instanceof Error ? error.message : String(error)}` });
				return;
			}
			// Accept a raw package definition or the { package: ... } export wrapper.
			const definition = (
				parsed && typeof parsed === 'object' && 'package' in parsed ? (parsed as { package: unknown }).package : parsed
			) as WidgetPackageDefinition;
			const id = definition && typeof definition === 'object' ? definition.id : undefined;
			if (typeof id !== 'string' || !id) {
				setMsg({ tone: 'error', text: 'Package JSON needs a top-level "id" (or an export wrapper with "package.id").' });
				return;
			}
			const existing = runtime.state.widgets.packages[id];
			const isUpgrade = !!existing && !existing.removedAt;
			if (isUpgrade && id.startsWith('system.')) {
				setMsg({ tone: 'error', text: 'System packages are code-defined — their definitions cannot be upgraded from JSON.' });
				return;
			}
			const result = await runtime.dispatch({
				type: isUpgrade ? 'widget.package.upgrade' : 'widget.package.install',
				actorId: dmId,
				payload: { package: definition },
			});
			finish(
				result,
				isUpgrade
					? `Upgraded ${id} — declared migrations ran against every placed widget.`
					: `Installed ${id} — unreviewed, every host permission denied (fail-closed). Flip its switch above to enable it.`,
			);
			if (result.status === 'accepted') setJsonDraft('');
		});

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			{!canWrite && (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
					Package management is DM-only and read-only while previewing — the controls below are disabled.
				</div>
			)}
			{msg && (
				<div
					role="status"
					style={{
						font: `12.5px/1.5 ${T.sans}`,
						color: msg.tone === 'error' ? T.err : msg.tone === 'success' ? T.ok : T.sub,
						padding: '9px 12px',
						border: `1px solid ${T.bd}`,
						borderRadius: 9,
						background: T.surf,
					}}
				>
					{msg.text}
				</div>
			)}
			<Panel title="Installed packages" action={<Badge status="neutral">{packages.length} installed</Badge>}>
				<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.ter, marginBottom: 6 }}>
					Each package runs in a capability sandbox. The badges below are exactly what its manifest is permitted to do —
					computed live from the package, nothing more. Enable/disable, remove and upgrade all dispatch real Core
					commands and persist.
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					{packages.length === 0 && <div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No widget packages installed.</div>}
					{packages.map((rec: any) => {
						const def = rec.package;
						const isSystem = def.id.startsWith('system.');
						const review = buildWidgetPackageReviewSummary(def);
						const needsReview = rec.trust.state === 'unreviewed' || review.trustRecommendation !== 'trusted-after-review';
						const perms: string[] = review.requestedHostPermissions;
						const widgetCount = def.widgets.length;
						return (
							<div key={def.id} style={{ display: 'flex', gap: 12, padding: 13, border: `1px solid ${needsReview ? T.accBd : T.bd}`, borderRadius: 11, background: T.surf }}>
								<span style={{ width: 38, height: 38, borderRadius: 9, background: T.accSub, color: T.acc, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
									<Icon name="widget" size="md" />
								</span>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
										<span style={{ font: `600 13.5px ${T.sans}` }}>{def.displayName}</span>
										<Badge status={TRUST_TONE[rec.trust.state] as 'neutral'}>{rec.trust.state}</Badge>
										{isSystem && <Badge status="neutral">built-in</Badge>}
										{needsReview && (
											<Badge status="warning" icon="warning">
												Needs review
											</Badge>
										)}
										{review.customCodeWidgets.length > 0 && <Badge status="info">custom code</Badge>}
										{rec.migrationStatus?.state === 'failed' && (
											<Badge status="error" icon="warning">
												migration failed
											</Badge>
										)}
									</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter, marginBottom: 6 }}>
										v{def.version} · {widgetCount} {widgetCount === 1 ? 'widget' : 'widgets'} · {review.trustRecommendation}
									</div>
									<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
										{perms.length === 0 ? (
											<Badge status="neutral">No host permissions</Badge>
										) : (
											perms.map((p) => (
												<Badge key={p} status="accent">
													{HOST_PERM_LABEL[p] ?? p}
												</Badge>
											))
										)}
										{review.requestedNetworkDestinations.map((d: string) => (
											<Badge key={d} status="warning">
												net: {d}
											</Badge>
										))}
									</div>
								</div>
								<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flex: '0 0 auto' }}>
									<Switch
										checked={rec.enabled}
										disabled={!canWrite || busy}
										aria-label={`Enable ${def.displayName}`}
										onChange={() => setEnabled(def.id, !rec.enabled)}
									/>
									{/* System packages are code-defined: no remove (the board's own widgets) and no JSON
									    round-trip (their `builtin` runtime is rejected by the installer by design). */}
									{!isSystem && (
										<div style={{ display: 'flex', gap: 6 }}>
											{confirmRemoveId === def.id ? (
												<>
													<Button variant="danger" size="sm" disabled={!canWrite || busy} onClick={() => removePackage(def.id)}>
														Confirm remove
													</Button>
													<Button variant="ghost" size="sm" onClick={() => setConfirmRemoveId(null)}>
														Keep
													</Button>
												</>
											) : (
												<>
													<Button variant="ghost" size="sm" icon="upload" onClick={() => exportToDraft(def.id)}>
														Export JSON
													</Button>
													<Button variant="ghost" size="sm" icon="delete" disabled={!canWrite || busy} onClick={() => setConfirmRemoveId(def.id)}>
														Remove
													</Button>
												</>
											)}
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</Panel>
			<Panel title="Starter library" action={<Badge status="neutral">bundled · no network</Badge>}>
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					Installable packages scaffolded by the Core itself — installing dispatches the real{' '}
					<span style={mono}>widget.package.install</span>, so each lands unreviewed with every host permission denied
					(fail-closed sandbox). Enable it from the installed list above.
				</div>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
					{STARTER_LIBRARY.map((entry) => {
						const rec = runtime.state.widgets.packages[entry.packageId];
						const installed = !!rec && !rec.removedAt;
						return (
							<div key={entry.packageId} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 13, border: `1px solid ${T.bd}`, borderRadius: 11, background: T.surf }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
									<span style={{ font: `600 13px ${T.sans}`, flex: 1, minWidth: 0 }}>{entry.name}</span>
									<Badge status="info">sandboxed</Badge>
								</div>
								<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub, flex: 1 }}>{entry.desc}</div>
								{installed ? (
									<Badge status="success" icon="check">
										Installed
									</Badge>
								) : (
									<Button variant="secondary" size="sm" icon="import" disabled={!canWrite || busy} onClick={() => installStarter(entry)}>
										Install
									</Button>
								)}
							</div>
						);
					})}
				</div>
			</Panel>
			<Panel title="Install or upgrade from JSON">
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					Paste a widget-package definition (or an export from a card above). A new id installs; an already-installed
					id upgrades in place — the Core validates the manifest either way and runs declared migrations on upgrade.
				</div>
				<Textarea
					value={jsonDraft}
					onChange={(e: { target: { value: string } }) => setJsonDraft(e.target.value)}
					rows={10}
					placeholder='{ "id": "my-package", "version": "1.0.0", "displayName": "My Package", "widgets": [ … ] }'
					aria-label="Widget package definition JSON"
					style={{ fontFamily: T.mono, fontSize: 12 }}
				/>
				<Button variant="primary" size="sm" icon="import" disabled={!canWrite || busy || !jsonDraft.trim()} onClick={applyJson}>
					Install / upgrade package
				</Button>
			</Panel>
			<Panel title="Community marketplace" action={<Badge status="neutral">not wired — needs a network backend</Badge>}>
				<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.ter }}>
					Browsing and fetching community packages needs a marketplace service this local-first build does not have —
					nothing here is fetched, and no fake listing is shown. Install from the starter library or paste package
					JSON above instead.
				</div>
			</Panel>
		</div>
	);
}

/* ---- Compendium (real Open5e browse + import) --------------------------------------------------- */

/** Pull a string field off the first emitted event of a given kind (mirrors CharBuilder/demo-seed). */
function eventField(result: CommandResult, kind: string, field: string): string | null {
	if (result.status !== 'accepted') return null;
	for (const event of result.events) {
		if ((event as { kind?: string }).kind === kind) {
			const value = (event as unknown as Record<string, unknown>)[field];
			if (typeof value === 'string') return value;
		}
	}
	return null;
}

// The standard 5e CR ladder (matches both the live `challenge_rating` filter and bundled `cr`).
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

const monsterMeta = (m: CompendiumMonster) =>
	`${m.size} ${m.type} · CR ${formatCr(m.cr)}${m.ac != null ? ` · AC ${m.ac}` : ''}${m.hp != null ? ` · HP ${m.hp}` : ''}`;
const spellMeta = (s: CompendiumSpell) =>
	`${s.level === 0 ? 'Cantrip' : `Level ${s.level}`} ${s.school} · ${s.castingTime} · ${s.range}`;

const ABILITY_COLUMNS: Array<[label: string, key: string]> = [
	['STR', 'strength'], ['DEX', 'dexterity'], ['CON', 'constitution'],
	['INT', 'intelligence'], ['WIS', 'wisdom'], ['CHA', 'charisma'],
];

/** One labeled detail line in the entry panel (rendered only when there is a value). */
function DetailLine({ label, value }: { label: string; value?: string | null }) {
	if (!value) return null;
	return (
		<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
			<span style={{ font: `600 12px ${T.sans}`, color: T.ink }}>{label}. </span>
			{value}
		</div>
	);
}

/**
 * The import control with the duplicate guard: a same-name entry already in the vault flips the
 * button into an explicit two-step "Import again → Import copy / Keep" confirm — never silent.
 */
function ImportControl({
	name, inVault, busy, disabled, confirming, onConfirmChange, onImport, size = 'sm',
}: {
	name: string;
	inVault: boolean;
	busy: boolean;
	disabled: boolean;
	confirming: boolean;
	onConfirmChange: (on: boolean) => void;
	onImport: () => void;
	size?: 'sm' | 'md';
}) {
	if (inVault && confirming) {
		return (
			<span style={{ display: 'inline-flex', gap: 6 }}>
				<Button variant="danger" size={size} disabled={disabled || busy} onClick={onImport}>
					Import copy
				</Button>
				<Button variant="ghost" size={size} onClick={() => onConfirmChange(false)}>
					Keep
				</Button>
			</span>
		);
	}
	if (inVault) {
		return (
			<Button
				variant="ghost"
				size={size}
				icon="import"
				disabled={disabled || busy}
				aria-label={`Import ${name} again (already in vault)`}
				onClick={() => onConfirmChange(true)}
			>
				Import again
			</Button>
		);
	}
	return (
		<Button variant="secondary" size={size} icon="import" disabled={disabled || busy} onClick={onImport}>
			{busy ? 'Importing…' : 'Import'}
		</Button>
	);
}

function ExtCompendium() {
	const runtime = useRuntime();
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
	const [result, setResult] = useState<CompendiumResult<CompendiumMonster | CompendiumSpell> | null>(null);
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
					.filter((item) => item.kind === 'object' && item.fields[VAULT_OBJECT_SUBTYPE_KEY] === 'spell')
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
		if (docs || docsError) return;
		listDocuments()
			.then(setDocs)
			.catch(() => setDocsError('The Open5e source list could not be reached — only the bundled SRD is available offline.'));
	};
	const pendingDoc = docs?.find((d) => d.key === pendingDocKey) ?? null;

	const entries = result?.entries ?? [];
	const selected = entries.find((e) => e.key === selKey) ?? null;
	const sourceBadge = loading ? (
		<Badge status="neutral">searching…</Badge>
	) : result?.source === 'live' ? (
		<Badge status="success" icon="check">Live · Open5e API</Badge>
	) : result ? (
		<Badge status="warning" icon="warning">Offline — bundled SRD</Badge>
	) : (
		<Badge status="error" icon="warning">unavailable</Badge>
	);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
			<div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 18, alignItems: 'start' }}>
				<Panel title="Open5e compendium" action={sourceBadge}>
					{!canWrite && (
						<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter, marginBottom: 8 }}>
							Importing is DM-only and read-only while previewing — browsing works, the import buttons are disabled.
						</div>
					)}
					{/* kind pills */}
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
						{(
							[
								{ id: 'monster' as const, label: 'Monsters', icon: 'monster-claw' },
								{ id: 'spell' as const, label: 'Spells', icon: 'spell-sparkle' },
							]
						).map((t) => (
							<button
								key={t.id}
								type="button"
								aria-pressed={kind === t.id}
								onClick={() => {
									setKind(t.id);
									setSelKey(null);
									setConfirmKey(null);
								}}
								style={{
									display: 'inline-flex',
									alignItems: 'center',
									gap: 6,
									font: `12px ${T.sans}`,
									padding: '6px 11px',
									borderRadius: 8,
									cursor: 'pointer',
									border: `1px solid ${kind === t.id ? T.accBd : T.bd}`,
									background: kind === t.id ? T.accSub : T.surf,
									color: kind === t.id ? T.acc : T.sub,
								}}
							>
								<Icon name={t.icon} size={14} />
								{t.label}
								{kind === t.id && result && <span style={{ color: T.ter }}>{result.total}</span>}
							</button>
						))}
					</div>
					{/* search + filter */}
					<div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
						<span style={{ flex: 1, minWidth: 0 }}>
							<Input
								value={search}
								onChange={(e: { target: { value: string } }) => setSearch(e.target.value)}
								placeholder={kind === 'monster' ? 'Search monsters by name…' : 'Search spells by name…'}
								aria-label="Search the compendium by name"
							/>
						</span>
						<span style={{ flex: '0 0 130px' }}>
							{kind === 'monster' ? (
								<Select aria-label="Filter by challenge rating" options={CR_OPTIONS} value={cr} onChange={(e: { target: { value: string } }) => setCr(e.target.value)} />
							) : (
								<Select aria-label="Filter by spell level" options={LEVEL_OPTIONS} value={level} onChange={(e: { target: { value: string } }) => setLevel(e.target.value)} />
							)}
						</span>
					</div>
					{/* source document (non-SRD needs an explicit opt-in that shows the source's license) */}
					<div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px', border: `1px solid ${T.bd}`, borderRadius: 9, background: T.alt, marginBottom: 12 }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
							<span style={{ font: `12px ${T.sans}`, color: T.sub, flex: 1, minWidth: 0 }}>
								Source: <span style={{ font: `600 12px ${T.sans}`, color: T.ink }}>{activeDoc ? activeDoc.name : 'SRD 5.1'}</span>{' '}
								<span style={{ color: T.ter }}>· {activeDoc ? activeDoc.licenses.map((l) => l.name).join(', ') || 'see publisher' : 'CC-BY-4.0'}</span>
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
								{docsError && <div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>{docsError}</div>}
								{docs && (
									<>
										<Select
											aria-label="Choose a source document"
											options={docs.map((d) => ({ value: d.key, label: `${d.name} — ${d.publisher}` }))}
											value={pendingDocKey}
											onChange={(e: { target: { value: string } }) => setPendingDocKey(e.target.value)}
										/>
										{pendingDoc && (
											<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>
												License: <span style={{ color: T.sub }}>{pendingDoc.licenses.map((l) => l.name).join(', ') || 'see the publisher’s terms'}</span>
												{pendingDoc.permalink ? ` · ${pendingDoc.permalink}` : ''}. Content from this source is fetched live
												from the Open5e API and remains under its publisher’s license.
											</div>
										)}
										<div style={{ display: 'flex', gap: 6 }}>
											<Button
												variant="secondary"
												size="sm"
												disabled={!pendingDoc}
												onClick={() => {
													setActiveDoc(pendingDoc && pendingDoc.key !== SRD_DOCUMENT_KEY ? pendingDoc : null);
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
								{activeDoc.name} needs the live API — offline results below are the bundled SRD instead.
							</div>
						)}
					</div>
					{/* results */}
					{loading && (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 9 }} aria-label="Loading results">
							{[0, 1, 2, 3].map((i) => (
								<Skeleton key={i} height={62} />
							))}
						</div>
					)}
					{!loading && !result && (
						<EmptyState
							icon="warning"
							title="Compendium unavailable"
							description="Neither the Open5e API nor the bundled SRD dataset could be loaded. Try again."
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
									<div
										key={entry.key}
										role="button"
										tabIndex={0}
										aria-pressed={selKey === entry.key}
										aria-label={`Select ${entry.name}`}
										onClick={() => setSelKey(entry.key)}
										onKeyDown={(e) => {
											// Only when the CARD itself is focused — Enter on the nested Import button must
											// keep its native activation, not collapse into select.
											if (e.target !== e.currentTarget) return;
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												setSelKey(entry.key);
											}
										}}
										style={{
											display: 'flex',
											gap: 12,
											padding: 12,
											borderRadius: 10,
											cursor: 'pointer',
											textAlign: 'left',
											border: `1px solid ${selKey === entry.key ? T.accBd : T.bd}`,
											background: selKey === entry.key ? T.accSub : T.surf,
										}}
									>
										<div style={{ flex: 1, minWidth: 0 }}>
											<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
												<span style={{ font: `600 13.5px ${T.sans}` }}>{entry.name}</span>
												{dup && (
													<Badge status="success" icon="check">
														In vault
													</Badge>
												)}
											</div>
											<div style={{ font: `11.5px ${T.mono}`, color: T.ter, margin: '2px 0 0' }}>
												{kind === 'monster' ? monsterMeta(entry as CompendiumMonster) : spellMeta(entry as CompendiumSpell)}
											</div>
										</div>
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
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter, textAlign: 'center', padding: '2px 0 0' }}>
									Showing the first {entries.length} of {result.total} matches — refine the search to narrow it down.
								</div>
							)}
						</div>
					)}
				</Panel>
				{/* detail panel */}
				<Panel accent title={selected ? selected.name : 'Entry details'} action={selected && <Badge status="info">{kind === 'monster' ? 'Monster' : 'Spell'}</Badge>}>
					{!selected && (
						<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.ter }}>
							Select an entry to review its statblock before importing. Monsters land in the roster as DM-only
							quick-create characters (usable in the Encounter Builder); spells become DM-only vault objects on
							the Knowledge screen.
						</div>
					)}
					{selected && kind === 'monster' && (() => {
						const m = selected as CompendiumMonster;
						const scores = m.abilityScores;
						return (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
								<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{monsterMeta(m)} · {m.alignment}</div>
								{scores && (
									<div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
										{ABILITY_COLUMNS.map(([label, key]) => (
											<div key={key} style={{ textAlign: 'center', padding: '6px 2px', border: `1px solid ${T.bd}`, borderRadius: 8, background: T.surf }}>
												<div style={{ font: `600 10px ${T.sans}`, color: T.ter }}>{label}</div>
												<div style={{ font: `600 13px ${T.mono}` }}>{scores[key] ?? '—'}</div>
											</div>
										))}
									</div>
								)}
								<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
									<DetailLine label="Armor Class" value={m.ac != null ? `${m.ac}${m.acDetail ? ` (${m.acDetail})` : ''}` : undefined} />
									<DetailLine label="Hit Points" value={m.hp != null ? `${m.hp}${m.hitDice ? ` (${m.hitDice})` : ''}` : undefined} />
									<DetailLine
										label="Speed"
										value={Object.entries(m.speed ?? {}).filter(([, v]) => typeof v === 'number' && v > 0).map(([mode, v]) => `${mode} ${v} ft.`).join(', ') || undefined}
									/>
									<DetailLine
										label="Senses"
										value={[...Object.entries(m.senses ?? {}).map(([s, r]) => `${s} ${r} ft.`), ...(m.passivePerception != null ? [`passive Perception ${m.passivePerception}`] : [])].join(', ') || undefined}
									/>
									<DetailLine label="Languages" value={m.languages} />
									<DetailLine label="Damage immunities" value={m.damageImmunities} />
									<DetailLine label="Damage resistances" value={m.damageResistances} />
									<DetailLine label="Condition immunities" value={m.conditionImmunities} />
								</div>
								{((m.traits?.length ?? 0) > 0 || (m.actions?.length ?? 0) > 0) && (
									<div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', border: `1px solid ${T.bd}`, borderRadius: 10, background: T.surf }}>
										{(m.traits ?? []).map((t) => (
											<div key={`t-${t.name}`} style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
												<span style={{ font: `600 italic 12px ${T.sans}`, color: T.ink }}>{t.name}. </span>
												{t.desc}
											</div>
										))}
										{(m.actions ?? []).length > 0 && <div style={{ ...eb, marginTop: 2 }}>Actions</div>}
										{(m.actions ?? []).map((a) => (
											<div key={`a-${a.name}`} style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
												<span style={{ font: `600 12px ${T.sans}`, color: T.ink }}>
													{a.name}
													{a.actionType === 'LEGENDARY_ACTION' ? ' (legendary)' : ''}.{' '}
												</span>
												{a.desc}
											</div>
										))}
									</div>
								)}
								<ImportControl
									name={m.name}
									inVault={inVault(m.name)}
									busy={busyKey === m.key}
									disabled={!canWrite || (busyKey !== null && busyKey !== m.key)}
									confirming={confirmKey === m.key}
									onConfirmChange={(on) => setConfirmKey(on ? m.key : null)}
									onImport={() => void importEntry(m)}
									size="md"
								/>
							</div>
						);
					})()}
					{selected && kind === 'spell' && (() => {
						const s = selected as CompendiumSpell;
						return (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
								<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>
									{spellMeta(s)}
									{s.ritual ? ' · ritual' : ''}
								</div>
								<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
									<DetailLine label="Casting time" value={s.castingTime} />
									<DetailLine label="Range" value={s.range} />
									<DetailLine label="Components" value={s.components} />
									<DetailLine label="Duration" value={spellDuration(s)} />
									<DetailLine label="Classes" value={s.classes?.join(', ')} />
								</div>
								<div style={{ maxHeight: 300, overflowY: 'auto', font: `12.5px/1.6 ${T.sans}`, color: T.sub, padding: '10px 12px', border: `1px solid ${T.bd}`, borderRadius: 10, background: T.surf, whiteSpace: 'pre-line' }}>
									{s.desc}
									{s.higherLevel ? `\n\nAt higher levels. ${s.higherLevel}` : ''}
								</div>
								<ImportControl
									name={s.name}
									inVault={inVault(s.name)}
									busy={busyKey === s.key}
									disabled={!canWrite || (busyKey !== null && busyKey !== s.key)}
									confirming={confirmKey === s.key}
									onConfirmChange={(on) => setConfirmKey(on ? s.key : null)}
									onImport={() => void importEntry(s)}
									size="md"
								/>
							</div>
						);
					})()}
				</Panel>
			</div>
			{/* LEGAL: the license attribution for the rendered material must stay visible on this surface. */}
			{result && (
				<div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', border: `1px solid ${T.bd}`, borderRadius: 10, background: T.alt }}>
					<Badge status="neutral">{result.license}</Badge>
					<span style={{ font: `11px/1.6 ${T.sans}`, color: T.ter }}>{result.attribution}</span>
				</div>
			)}
		</div>
	);
}

function ExtObjects() {
	const O = EXT.objectTypes;
	const fts: Record<string, any> = Object.fromEntries(O.fieldTypes.map((f: any) => [f.id, f]));
	// Honest-local: no Core command for a custom-type schema editor on this surface — local draft state.
	const [fields, setFields] = useState<any[]>(O.draft.fields.map((f: any) => ({ ...f })));
	const addField = () =>
		setFields((fs) => [...fs, { label: `Field ${fs.length + 1}`, key: `field_${fs.length + 1}`, type: O.fieldTypes[0]?.id ?? 'text', required: false }]);
	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
			<Panel title="Object types" action={<Badge status="neutral">preview</Badge>}>
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter, marginBottom: 8 }}>
					Preview only — defining custom object types is not wired to a Core command on this surface.
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					{O.types.map((t: any) => (
						<div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: `1px solid ${T.bd}`, borderRadius: 10, background: T.surf }}>
							<span style={{ width: 36, height: 36, borderRadius: 9, background: T.alt, color: T.acc, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
								<Icon name={t.icon} size="md" />
							</span>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
									<span style={{ font: `600 13.5px ${T.sans}` }}>{t.name}</span>
									{t.builtin && <Badge status="neutral">Built-in</Badge>}
								</div>
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
									{t.from} · {t.fields} fields · {t.count} objects
								</div>
							</div>
							<Icon name="chevron-right" size={15} color={T.ter} />
						</div>
					))}
				</div>
			</Panel>
			<Panel accent title={`New type · ${O.draft.name}`}>
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					A schema-backed type — these fields become the form and the columns everywhere this type appears. Local draft.
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{fields.map((f: any, i: number) => {
						const ft = fts[f.type];
						return (
							<div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', border: `1px solid ${T.bd}`, borderRadius: 10, background: T.surf }}>
								<Icon name={ft?.icon || 'tag'} size={16} color={T.acc} />
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
										<span style={{ font: `600 12.5px ${T.sans}` }}>{f.label}</span>
										{f.required && (
											<span style={{ font: `9px ${T.sans}`, letterSpacing: '.06em', color: T.err, border: `1px solid ${T.bd}`, borderRadius: 4, padding: '1px 5px' }}>REQ</span>
										)}
									</div>
									<div style={{ font: `11px ${T.mono}`, color: T.ter }}>{f.key}</div>
								</div>
								<Badge status="neutral">{ft?.label || f.type}</Badge>
							</div>
						);
					})}
					<button
						type="button"
						onClick={addField}
						style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px', borderRadius: 10, border: `1.5px dashed ${T.bdS}`, background: 'transparent', cursor: 'pointer', color: T.ter, font: `600 12.5px ${T.sans}` }}
					>
						<Icon name="add" size={14} />
						Add field
					</button>
				</div>
			</Panel>
		</div>
	);
}

function ExtSystem() {
	const cs = EXT.campaignSystem;
	// Honest-local: swapping the campaign rules-system is not Core-backed on this surface — local selection.
	const [activeSystem, setActiveSystem] = useState<string>(cs.modules.find((m: any) => m.active)?.id ?? cs.active ?? cs.modules[0]?.id);
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel title="Campaign system" accent>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					The rules vocabulary the whole interface reads at runtime — stats, conditions, dice, action economy.
					Switching is a local preview here; the migration dry-run has no Core command on this surface.
				</div>
			</Panel>
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
				{cs.modules.map((m: any) => {
					const active = m.id === activeSystem;
					return (
						<div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderRadius: 12, border: `1px solid ${active ? T.accBd : T.bd}`, background: T.surf, boxShadow: active ? T.smd : 'none' }}>
							<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
								<span style={{ font: `700 15px ${T.disp}`, color: active ? T.acc : T.ink }}>{m.name}</span>
								{active ? (
									<Badge status="accent" icon="check">
										Active
									</Badge>
								) : (
									<Badge status="neutral">{m.from}</Badge>
								)}
							</div>
							<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub, flex: 1 }}>{m.desc}</div>
							{active ? (
								<Button variant="secondary" size="sm" disabled>
									Current system
								</Button>
							) : (
								<Button variant="primary" size="sm" icon="retry" onClick={() => setActiveSystem(m.id)}>
									Switch (preview)
								</Button>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function ExtTheme() {
	const TH = EXT.theme;
	const presetToTheme: Record<string, string> = { tavern: 'tavern', parchment: 'parchment', 'high-contrast': 'high-contrast' };
	// REAL: the live `data-theme` swap drives the actual document theme (DOM). Token import/export is local.
	const [theme, setTheme] = useState<string>(document.documentElement.getAttribute('data-theme') || 'tavern');
	const applyTheme = (v: string) => {
		setTheme(v);
		document.documentElement.setAttribute('data-theme', v);
	};
	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 18, alignItems: 'start' }}>
			<Panel title="Token overrides" action={<Badge status="neutral">live theme: {theme}</Badge>}>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
					{TH.presets.map((p: any) => (
						<button
							key={p.id}
							type="button"
							onClick={() => presetToTheme[p.id] && applyTheme(presetToTheme[p.id])}
							style={{
								font: `12px ${T.sans}`,
								padding: '6px 12px',
								borderRadius: 8,
								cursor: 'pointer',
								border: `1px solid ${theme === presetToTheme[p.id] ? T.accBd : T.bd}`,
								background: theme === presetToTheme[p.id] ? T.accSub : T.surf,
								color: theme === presetToTheme[p.id] ? T.acc : T.sub,
							}}
						>
							{p.label}
							{p.custom && ' ✎'}
						</button>
					))}
				</div>
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter, marginBottom: 12 }}>
					Theme swap is real (drives the document <span style={mono}>data-theme</span>). The token rows below are a
					display-only preview — there is no Core command for per-token overrides on this surface.
				</div>
				{TH.groups.map((g: any) => (
					<div key={g.label} style={{ marginBottom: 14 }}>
						<div style={{ ...eb, marginBottom: 8 }}>{g.label}</div>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
							{g.tokens.map((t: any) => (
								<div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
									<span style={{ width: 26, height: 26, borderRadius: 7, flex: '0 0 auto', background: t.swatch, border: `1px solid ${T.bd}` }} />
									<span style={{ flex: 1, font: `11.5px ${T.mono}`, color: T.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
									{t.edited && <Badge status="accent">edited</Badge>}
									<span style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{t.value}</span>
								</div>
							))}
						</div>
					</div>
				))}
			</Panel>
			<Panel title="Live preview">
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 12, background: T.bg, border: `1px solid ${T.bd}` }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
						<span style={{ width: 30, height: 30, borderRadius: 7, background: T.acc, color: T.accFg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
							<Icon name="dice" size="sm" />
						</span>
						<span style={{ font: `700 15px ${T.disp}` }}>Sample surface</span>
					</div>
					<HPBar current={27} max={38} label="Mara Quill" />
					<div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
						<Badge status="success" icon="check">
							Saved
						</Badge>
						<Badge status="warning" icon="warning">
							Stale
						</Badge>
						<Badge status="error" icon="close">
							Conflict
						</Badge>
						<VisibilityChip level="dm-only" compact />
					</div>
					<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub }}>
						Body copy renders in the secondary text token. Numbers like <span style={mono}>1d20+7</span> use the mono face.
					</div>
				</div>
			</Panel>
		</div>
	);
}

export function Extensions() {
	const [tab, setTab] = useState('plugins');
	const tabs = [
		{ id: 'plugins', label: 'Plugins', icon: 'widget' },
		{ id: 'compendium', label: 'Compendium', icon: 'search' },
		{ id: 'objects', label: 'Object types', icon: 'tag' },
		{ id: 'system', label: 'System', icon: 'retry' },
		{ id: 'theme', label: 'Theme studio', icon: 'theme' },
	];
	return (
		<Page max={1180}>
			<div style={{ marginBottom: 18 }}>
				<Tabs value={tab} onChange={setTab} tabs={tabs} />
			</div>
			{tab === 'plugins' && <ExtPlugins />}
			{tab === 'compendium' && <ExtCompendium />}
			{tab === 'objects' && <ExtObjects />}
			{tab === 'system' && <ExtSystem />}
			{tab === 'theme' && <ExtTheme />}
		</Page>
	);
}
