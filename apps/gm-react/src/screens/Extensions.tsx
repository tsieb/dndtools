import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	buildWidgetPackageReviewSummary,
	exportWidgetPackage,
	getContentItemsForActor,
	listCharactersForActor,
	listCustomObjectTypeSummaries,
	listVaultObjectSchemas,
	previewSystemSwitch,
	scaffoldCustomWidgetPackageDraft,
	suggestCustomObjectTypeId,
	VAULT_OBJECT_SUBTYPE_KEY,
	type CommandResult,
	type CustomObjectTypeDefinition,
	type SystemSwitchPreviewResult,
	type VaultObjectFieldType,
	type WidgetPackageDefinition,
} from '@dndtools/core';
import { Badge, Button, Checkbox, Dialog, EmptyState, HPBar, Icon, Input, SegmentedControl, Select, Skeleton, Switch, Tabs, Textarea, Toaster, VisibilityChip } from '../ds';
import { Page, Panel, T, eb, mono } from '../app/screen-kit';
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
 * REAL — the Object types tab renders the Core's declared vault-object schema registry
 * (`listVaultObjectSchemas`) with live per-subtype counts from the actor-filtered content read; the
 * System tab runs the real `previewSystemSwitch` dry-run and applies through the real
 * `widget.package.switch-system` command (fail-closed: a non-migratable vault or an unacknowledged
 * destructive drop blocks the switch); the Theme studio persists the preset choice through the same
 * mechanism Settings → Appearance uses and lists the LIVE token values of the active preset.
 *
 * HONEST LIMITS (no core command — each panel says so, no fake controls):
 *   - Community marketplace: browsing/fetching community packages needs a network backend — nothing
 *     is fetched; the panel says so and offers no fake controls.
 *   - Per-token theme overrides: presets are the architecture (ADR-011); token rows are read-only.
 *
 * Custom object types ARE now backed by the Core `content.define/update/delete-object-type`
 * commands (ADR-023): the Custom Types panel defines a type's field schema and creates instances of
 * it, dispatching through the runtime like every other panel.
 */

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
	const [jsonDraft, setJsonDraft] = useState('');
	const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
	// The live widget-package registry — the "plugins" of this app. A removed package is gone, not listed.
	const packages = useMemo(
		() => Object.values(runtime.state.widgets.packages).filter((rec: any) => !rec.removedAt),
		[runtime.state.widgets],
	);

	// Shared result surfacing — transient outcomes go through the app-wide Toaster (like every other
	// tab): success copy on accept, the Core rejection (with its per-field zod/validation issues) on
	// reject. A thrown dispatch (failed durable write) also lands here.
	const finish = (result: CommandResult, okText: string) => {
		if (result.status === 'accepted') {
			Toaster.success(okText);
		} else {
			const issues = (result.rejection.issues ?? []).map((i) => `${i.path}: ${i.message}`).join(' · ');
			Toaster.error(issues ? `${result.rejection.message} ${issues}` : result.rejection.message);
		}
	};
	const guard = (fn: () => Promise<void>) => {
		if (busy) return;
		setBusy(true);
		void fn()
			.catch((error: unknown) => Toaster.error(error instanceof Error ? error.message : String(error)))
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
			Toaster.error(`Package ${packageId} could not be exported (${exported.reason}).`);
			return;
		}
		setJsonDraft(JSON.stringify(exported.package, null, 2));
		Toaster.info(
			`Exported ${packageId} into the JSON box below — bump "version" (and declare "migrations" for placed widgets) to upgrade it.`,
			{ duration: 7000 },
		);
	};

	const applyJson = () =>
		guard(async () => {
			let parsed: unknown;
			try {
				parsed = JSON.parse(jsonDraft);
			} catch (error) {
				Toaster.error(`Not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
				return;
			}
			// Accept a raw package definition or the { package: ... } export wrapper.
			const definition = (
				parsed && typeof parsed === 'object' && 'package' in parsed ? (parsed as { package: unknown }).package : parsed
			) as WidgetPackageDefinition;
			const id = definition && typeof definition === 'object' ? definition.id : undefined;
			if (typeof id !== 'string' || !id) {
				Toaster.error('Package JSON needs a top-level "id" (or an export wrapper with "package.id").');
				return;
			}
			const existing = runtime.state.widgets.packages[id];
			const isUpgrade = !!existing && !existing.removedAt;
			if (isUpgrade && id.startsWith('system.')) {
				Toaster.error('System packages are code-defined — their definitions cannot be upgraded from JSON.');
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
											{kind === 'monster' && result ? <span style={{ opacity: 0.75 }}>{result.total}</span> : null}
										</>
									),
								},
								{
									value: 'spell',
									label: (
										<>
											<Icon name="spell-sparkle" size={14} />
											Spells
											{kind === 'spell' && result ? <span style={{ opacity: 0.75 }}>{result.total}</span> : null}
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

/* ---- Object types (REAL — the Core's declared vault-object schema registry + live counts) ------- */
const SUBTYPE_ICON: Record<string, string> = {
	note: 'note',
	character: 'players',
	map: 'atlas-map',
	handout: 'scroll',
	spell: 'spell-sparkle',
	encounter: 'monster-claw',
	'dice-table': 'dice',
	'audio-preset': 'play',
};

function ExtObjects() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const schemas = listVaultObjectSchemas();
	// Live per-subtype counts through the SAME visibility-respecting content read Knowledge lists with.
	const items = getContentItemsForActor(runtime.state.content, runtime.state.permissions, actorId);
	const countFor = (subtype: string): number =>
		subtype === 'note'
			? items.filter((i) => i.kind === 'note').length
			: items.filter((i) => i.kind === 'object' && i.fields[VAULT_OBJECT_SUBTYPE_KEY] === subtype).length;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel title="Object types" action={<Badge status="neutral">{schemas.length} schema-defined</Badge>}>
				<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter, marginBottom: 6 }}>
					The Core's declared vault-object schema registry — these fields drive the forms and columns
					everywhere a type appears. Counts are live from your vault (visibility-filtered).
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					{schemas.map((s) => {
						const count = countFor(s.subtype);
						return (
							<div key={s.subtype} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: `1px solid ${T.bd}`, borderRadius: 10, background: T.surf }}>
								<span style={{ width: 36, height: 36, borderRadius: 9, background: T.alt, color: T.acc, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
									<Icon name={SUBTYPE_ICON[s.subtype] ?? 'tag'} size="md" />
								</span>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
										<span style={{ font: `600 13.5px ${T.sans}` }}>{s.displayName}</span>
										<Badge status="neutral">Built-in</Badge>
										{s.dmOnlyFields.length > 0 && <Badge status="accent">{s.dmOnlyFields.length} DM-only {s.dmOnlyFields.length === 1 ? 'field' : 'fields'}</Badge>}
									</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
										<span style={mono}>{s.subtype}</span> · defaults to {s.defaultVisibility} · {s.requiredFields.length} required {s.requiredFields.length === 1 ? 'field' : 'fields'}
									</div>
								</div>
								<span style={{ font: `12px ${T.mono}`, color: count ? T.ink : T.ter }}>{count} in vault</span>
							</div>
						);
					})}
				</div>
			</Panel>
			<CustomObjectTypes />
		</div>
	);
}

/* ---- Custom object types (REAL — `content.define/update/delete-object-type` + `content.create/update-object`) */

const FIELD_KIND_OPTIONS: { value: VaultObjectFieldType; label: string }[] = [
	{ value: 'string', label: 'Text' },
	{ value: 'number', label: 'Number' },
	{ value: 'boolean', label: 'Boolean' },
	{ value: 'string-array', label: 'Text list' },
	{ value: 'object', label: 'Object' },
	{ value: 'object-array', label: 'Object list' },
];

interface FieldDraft {
	key: string;
	type: VaultObjectFieldType;
	required: boolean;
	dmOnly: boolean;
}

const emptyField = (): FieldDraft => ({ key: '', type: 'string', required: false, dmOnly: false });

function CustomObjectTypes() {
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	const previewing = !!runtime.preview;
	const isDm = runtime.state.permissions.actors[dmId]?.role === 'dm';
	const canWrite = isDm && !previewing;

	const summaries = useMemo(
		() => listCustomObjectTypeSummaries(runtime.state.content.customObjectTypes),
		[runtime.state.content.customObjectTypes],
	);
	const items = getContentItemsForActor(runtime.state.content, runtime.state.permissions, dmId);
	const countFor = (typeId: string): number =>
		items.filter((i) => i.kind === 'object' && i.fields[VAULT_OBJECT_SUBTYPE_KEY] === typeId).length;

	// The type-authoring form. `editId` non-null ⇒ we are updating an existing type (revision bump) rather
	// than defining a new one.
	const [editId, setEditId] = useState<string | null>(null);
	const [label, setLabel] = useState('');
	const [fields, setFields] = useState<FieldDraft[]>([emptyField()]);
	const [busy, setBusy] = useState(false);
	const [instanceOf, setInstanceOf] = useState<CustomObjectTypeDefinition | null>(null);

	const resetForm = () => {
		setEditId(null);
		setLabel('');
		setFields([emptyField()]);
	};

	const startEdit = (def: CustomObjectTypeDefinition) => {
		setEditId(def.id);
		setLabel(def.label);
		setFields(
			def.fields.length
				? def.fields.map((f) => ({ key: f.key, type: f.type, required: f.required, dmOnly: f.dmOnly }))
				: [emptyField()],
		);
	};

	const targetId = editId ?? suggestCustomObjectTypeId(label);
	const declaredFields = fields.filter((f) => f.key.trim() !== '');
	const canSubmit = canWrite && !busy && label.trim() !== '' && targetId !== 'custom:';

	const submitType = async () => {
		if (!canSubmit) return;
		setBusy(true);
		try {
			const payload = {
				id: targetId,
				label: label.trim(),
				fields: declaredFields.map((f) => ({
					key: f.key.trim(),
					type: f.type,
					required: f.required,
					dmOnly: f.dmOnly,
				})),
			};
			const res = await runtime.dispatch(
				editId
					? { type: 'content.update-object-type', actorId: dmId, payload }
					: { type: 'content.define-object-type', actorId: dmId, payload },
			);
			if (res.status === 'rejected') {
				const issues = res.rejection.issues?.map((i) => `${i.path}: ${i.message}`).join(' · ');
				Toaster.error(issues ? `${res.rejection.message} ${issues}` : res.rejection.message);
				return;
			}
			Toaster.success(editId ? `Updated "${payload.label}"` : `Defined "${payload.label}"`);
			resetForm();
		} catch (error) {
			Toaster.error(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	};

	const deleteType = async (def: CustomObjectTypeDefinition) => {
		if (!canWrite || busy) return;
		setBusy(true);
		try {
			const res = await runtime.dispatch({
				type: 'content.delete-object-type',
				actorId: dmId,
				payload: { id: def.id },
			});
			if (res.status === 'rejected') {
				Toaster.error(res.rejection.message);
				return;
			}
			Toaster.success(`Deleted "${def.label}"`);
			if (editId === def.id) resetForm();
		} catch (error) {
			Toaster.error(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<Panel
				title="Custom object types"
				action={<Badge status={summaries.length ? 'accent' : 'neutral'}>{summaries.length} defined</Badge>}
			>
				<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter, marginBottom: 6 }}>
					Define your own vault-object types with a small field schema. A custom type is first-class — its
					objects create, validate, and list alongside the built-in types above. Deleting a type is blocked
					while any of its objects still exist.
				</div>
				{summaries.length === 0 ? (
					<div style={{ font: `12px ${T.sans}`, color: T.ter, padding: '4px 0' }}>No custom types yet.</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						{summaries.map((s) => {
							const def = runtime.state.content.customObjectTypes[s.id];
							const count = countFor(s.id);
							return (
								<div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: `1px solid ${T.bd}`, borderRadius: 10, background: T.surf }}>
									<span style={{ width: 36, height: 36, borderRadius: 9, background: T.alt, color: T.acc, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
										<Icon name="tag" size="md" />
									</span>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
											<span style={{ font: `600 13.5px ${T.sans}` }}>{s.label}</span>
											<Badge status="neutral">Custom</Badge>
											{s.dmOnlyFields.length > 0 && <Badge status="accent">{s.dmOnlyFields.length} DM-only {s.dmOnlyFields.length === 1 ? 'field' : 'fields'}</Badge>}
										</div>
										<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
											<span style={mono}>{s.id}</span> · {s.fieldCount} {s.fieldCount === 1 ? 'field' : 'fields'} · defaults to {s.defaultVisibility}
										</div>
									</div>
									<span style={{ font: `12px ${T.mono}`, color: count ? T.ink : T.ter }}>{count} in vault</span>
									{def && (
										<Button variant="secondary" size="sm" icon="add" disabled={!canWrite || busy} onClick={() => setInstanceOf(def)}>
											New
										</Button>
									)}
									{def && (
										<Button variant="ghost" size="sm" icon="edit" disabled={!canWrite || busy} onClick={() => startEdit(def)}>
											Edit
										</Button>
									)}
									{def && (
										<Button variant="ghost" size="sm" icon="delete" disabled={!canWrite || busy} onClick={() => deleteType(def)}>
											Delete
										</Button>
									)}
								</div>
							);
						})}
					</div>
				)}
			</Panel>

			<Panel title={editId ? `Edit type · ${editId}` : 'Define a new type'} accent={!!editId}>
				{!canWrite && (
					<div style={{ font: `12px ${T.sans}`, color: T.ter, marginBottom: 4 }}>
						{previewing ? 'Exit preview to author types.' : 'Only the DM may define custom object types.'}
					</div>
				)}
				<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
					<span style={{ flex: 1, minWidth: 160 }}>
						<label style={{ font: `11.5px ${T.sans}`, color: T.sub, display: 'block', marginBottom: 4 }}>Label</label>
						<Input
							value={label}
							onChange={(e: { target: { value: string } }) => setLabel(e.target.value)}
							placeholder="e.g. Tavern"
							aria-label="Custom type label"
							disabled={!canWrite}
						/>
					</span>
					<span style={{ font: `11.5px ${T.mono}`, color: T.ter, paddingBottom: 8 }}>{targetId}</span>
				</div>

				<div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
					<span style={{ font: `11.5px ${T.sans}`, color: T.sub }}>Fields</span>
					{fields.map((f, i) => (
						<div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
							<span style={{ flex: 1, minWidth: 120 }}>
								<Input
									value={f.key}
									onChange={(e: { target: { value: string } }) =>
										setFields((prev) => prev.map((p, j) => (j === i ? { ...p, key: e.target.value } : p)))
									}
									placeholder="field key (e.g. proprietor)"
									aria-label={`Field ${i + 1} key`}
									disabled={!canWrite}
								/>
							</span>
							<span style={{ flex: '0 0 130px' }}>
								<Select
									aria-label={`Field ${i + 1} kind`}
									options={FIELD_KIND_OPTIONS}
									value={f.type}
									onChange={(e: { target: { value: string } }) =>
										setFields((prev) => prev.map((p, j) => (j === i ? { ...p, type: e.target.value as VaultObjectFieldType } : p)))
									}
								/>
							</span>
							<Checkbox
								checked={f.required}
								onChange={(v: boolean) => setFields((prev) => prev.map((p, j) => (j === i ? { ...p, required: v } : p)))}
								label="Required"
							/>
							<Checkbox
								checked={f.dmOnly}
								onChange={(v: boolean) => setFields((prev) => prev.map((p, j) => (j === i ? { ...p, dmOnly: v } : p)))}
								label="DM-only"
							/>
							<Button
								variant="ghost"
								size="sm"
								icon="delete"
								disabled={!canWrite || fields.length === 1}
								onClick={() => setFields((prev) => (prev.length === 1 ? prev : prev.filter((_, j) => j !== i)))}
								aria-label={`Remove field ${i + 1}`}
							/>
						</div>
					))}
					<span>
						<Button variant="ghost" size="sm" icon="add" disabled={!canWrite || fields.length >= 40} onClick={() => setFields((prev) => [...prev, emptyField()])}>
							Add field
						</Button>
					</span>
				</div>

				<div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
					<Button variant="primary" size="sm" icon={editId ? 'check' : 'add'} disabled={!canSubmit} onClick={submitType}>
						{busy ? 'Saving…' : editId ? 'Save changes' : 'Define type'}
					</Button>
					{editId && (
						<Button variant="ghost" size="sm" onClick={resetForm} disabled={busy}>
							Cancel edit
						</Button>
					)}
				</div>
			</Panel>

			{instanceOf && (
				<CustomObjectInstanceDialog def={instanceOf} onClose={() => setInstanceOf(null)} />
			)}
		</>
	);
}

/* ---- Create an instance of a custom type (dispatches `content.create-object` with the custom subtype) */
function CustomObjectInstanceDialog({ def, onClose }: { def: CustomObjectTypeDefinition; onClose: () => void }) {
	const runtime = useRuntime();
	const navigate = useNavigate();
	const dmId = runtime.defaultActorId;
	const [title, setTitle] = useState('');
	const [values, setValues] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);

	const setValue = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

	// Coerce a form string into the field's declared kind (fail-closed validation still runs in the Core).
	const coerce = (type: VaultObjectFieldType, raw: string): unknown => {
		const trimmed = raw.trim();
		if (trimmed === '') return undefined;
		if (type === 'number') return Number(trimmed);
		if (type === 'boolean') return trimmed === 'true';
		if (type === 'string-array') return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
		return trimmed;
	};

	const create = async () => {
		if (busy || title.trim() === '') return;
		setBusy(true);
		try {
			const built: Record<string, unknown> = {};
			for (const f of def.fields) {
				const v = coerce(f.type, values[f.key] ?? '');
				if (v !== undefined) built[f.key] = v;
			}
			const res = await runtime.dispatch({
				type: 'content.create-object',
				actorId: dmId,
				payload: { subtype: def.id, title: title.trim(), fields: built },
			});
			if (res.status === 'rejected') {
				const issues = res.rejection.issues?.map((i) => `${i.path}: ${i.message}`).join(' · ');
				Toaster.error(issues ? `${res.rejection.message} ${issues}` : res.rejection.message);
				return;
			}
			const id = eventField(res, 'content.object-changed', 'itemId');
			Toaster.success(
				`Created ${title.trim()} (DM-only)`,
				id ? { action: 'Open', onAction: () => navigate(`/knowledge/${id}`) } : undefined,
			);
			onClose();
		} catch (error) {
			Toaster.error(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog
			open
			onClose={onClose}
			title={`New ${def.label}`}
			description={def.id}
			size="md"
			footer={
				<>
					<Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>Cancel</Button>
					<Button variant="primary" size="sm" icon="add" disabled={busy || title.trim() === ''} onClick={create}>
						{busy ? 'Creating…' : 'Create'}
					</Button>
				</>
			}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
				<span>
					<label style={{ font: `11.5px ${T.sans}`, color: T.sub, display: 'block', marginBottom: 4 }}>Title</label>
					<Input value={title} onChange={(e: { target: { value: string } }) => setTitle(e.target.value)} placeholder="Title" aria-label="Object title" />
				</span>
				{def.fields.map((f) => (
					<span key={f.key}>
						<label style={{ font: `11.5px ${T.sans}`, color: T.sub, display: 'flex', gap: 6, marginBottom: 4 }}>
							{f.key}
							<span style={{ color: T.ter }}>· {f.type}</span>
							{f.required && <span style={{ color: T.acc }}>required</span>}
							{f.dmOnly && <span style={{ color: T.acc }}>DM-only</span>}
						</label>
						{f.type === 'boolean' ? (
							<Select
								aria-label={f.key}
								options={[{ value: '', label: '—' }, { value: 'true', label: 'True' }, { value: 'false', label: 'False' }]}
								value={values[f.key] ?? ''}
								onChange={(e: { target: { value: string } }) => setValue(f.key, e.target.value)}
							/>
						) : (
							<Input
								value={values[f.key] ?? ''}
								onChange={(e: { target: { value: string } }) => setValue(f.key, e.target.value)}
								placeholder={f.type === 'string-array' ? 'comma-separated' : f.type}
								aria-label={f.key}
							/>
						)}
					</span>
				))}
			</div>
		</Dialog>
	);
}

/* ---- System (REAL — `previewSystemSwitch` dry-run gating the `widget.package.switch-system` command) */
const SWITCH_UNAVAILABLE_COPY: Record<string, string> = {
	'package-not-found': 'That package is not installed.',
	'package-removed': 'That package has been removed — reinstall it first.',
	'package-disabled': 'That package is disabled — enable it on the Plugins tab first.',
	'already-active': 'That package is already the active system.',
};
const FINDING_TONE: Record<string, 'success' | 'warning' | 'error'> = { keep: 'success', remap: 'warning', drop: 'error' };

function SystemSwitchDialog({
	targetId,
	targetName,
	preview,
	busy,
	canWrite,
	onApply,
	onClose,
}: {
	targetId: string;
	targetName: string;
	preview: SystemSwitchPreviewResult;
	busy: boolean;
	canWrite: boolean;
	onApply: (acknowledgeLoss: boolean) => void;
	onClose: () => void;
}) {
	const [ack, setAck] = useState(false);
	const available = preview.kind === 'available';
	const blocked = available && !preview.vault.canMigrate;
	const destructive = available && preview.destructive;
	const canApply = available && !blocked && (!destructive || ack) && canWrite && !busy;
	return (
		<Dialog
			open
			onClose={onClose}
			title={`Switch to ${targetName}`}
			description={`Migration dry-run · ${targetId}`}
			tone={destructive ? 'danger' : undefined}
			size="md"
			footer={
				<>
					<Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>Cancel</Button>
					<Button
						variant={destructive ? 'danger' : 'primary'}
						size="sm"
						icon="check"
						disabled={!canApply}
						onClick={() => onApply(destructive && ack)}
					>
						{busy ? 'Switching…' : 'Apply switch'}
					</Button>
				</>
			}
		>
			{!available && (
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{SWITCH_UNAVAILABLE_COPY[preview.reason] ?? 'The switch is unavailable.'} Nothing was changed.
				</div>
			)}
			{available && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, font: `12.5px ${T.sans}`, color: T.sub }}>
						<Icon name={blocked ? 'error' : 'success'} size={16} color={blocked ? T.err : T.ok} />
						{blocked
							? 'The vault cannot be safely migrated — the switch is blocked (fail-closed).'
							: 'Vault migration dry-run is clean.'}
					</div>
					{blocked && (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
							{preview.vault.blockingIssues.map((issue, i) => (
								<div key={i} style={{ font: `12px/1.5 ${T.sans}`, color: T.err }}>{issue.documentId}: {issue.reason}</div>
							))}
						</div>
					)}
					{preview.findings.length === 0 ? (
						<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>No widget-vocabulary changes — the current system declares no types the target lacks.</div>
					) : (
						<div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${T.bd}`, borderRadius: 10, overflow: 'hidden' }}>
							{preview.findings.map((f, i) => (
								<div key={f.widgetType} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? `1px solid ${T.bd}` : 'none', background: i % 2 ? T.alt : 'transparent' }}>
									<span style={{ font: `600 12.5px ${T.mono}`, width: 140, flex: '0 0 auto' }}>{f.widgetType}</span>
									<Badge status={FINDING_TONE[f.effect] ?? 'neutral'}>{f.effect}</Badge>
									<span style={{ font: `11.5px ${T.mono}`, color: T.ter, width: 60, flex: '0 0 auto' }}>×{f.instanceCount}</span>
									<span style={{ flex: 1, font: `12px/1.4 ${T.sans}`, color: T.sub }}>{f.note}</span>
								</div>
							))}
						</div>
					)}
					{destructive && !blocked && (
						<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, border: `1px solid ${T.accBd}`, background: T.accSub }}>
							<div style={{ flex: 1, font: `12px/1.5 ${T.sans}`, color: T.sub }}>
								Dropped types above have live widgets on your scenes — they would be disabled (recoverable
								by switching back). The command fails closed unless you acknowledge this.
							</div>
							<Checkbox checked={ack} onChange={(v: boolean) => setAck(v)} label="I understand" />
						</div>
					)}
					{preview.clean && (
						<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ok }}>Clean dry-run: the switch applies without losing anything.</div>
					)}
				</div>
			)}
		</Dialog>
	);
}

function ExtSystem() {
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	const previewing = !!runtime.preview;
	const isDm = runtime.state.permissions.actors[dmId]?.role === 'dm';
	const canWrite = isDm && !previewing;
	const widgets = runtime.state.widgets;
	const packages = useMemo(
		() => Object.values(widgets.packages).filter((rec) => !rec.removedAt),
		[widgets],
	);
	const activeId = widgets.activeSystemPackageId ?? null;
	const [targetId, setTargetId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	// The PURE dry-run behind the command — recomputed live from the same state the command validates.
	const preview = targetId ? previewSystemSwitch(widgets, runtime.state.scenes, targetId) : null;
	const targetName = targetId ? (widgets.packages[targetId]?.package.displayName ?? targetId) : '';

	const apply = (acknowledgeLoss: boolean) => {
		if (!targetId || busy) return;
		setBusy(true);
		void runtime
			.dispatch({ type: 'widget.package.switch-system', actorId: dmId, payload: { packageId: targetId, acknowledgeLoss } })
			.then((res: CommandResult) => {
				if (res.status === 'accepted') {
					Toaster.success(`Active system switched to ${targetName}.`);
					setTargetId(null);
				} else {
					Toaster.error(res.rejection.message);
				}
			})
			.catch((error: unknown) => Toaster.error(error instanceof Error ? error.message : String(error)))
			.finally(() => setBusy(false));
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel title="Campaign system" accent>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					The widget vocabulary the whole interface reads at runtime. Switching runs the Core's
					non-destructive dry-run first and fails closed on anything unsafe — a switch that would drop
					live widgets needs your explicit acknowledgment.
					{activeId === null && ' No explicit system package is set yet; the built-in scene widgets act as the default until you switch.'}
				</div>
				{!canWrite && (
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>Switching is DM-only and read-only while previewing.</div>
				)}
			</Panel>
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
				{packages.map((rec) => {
					const def = rec.package;
					const active = def.id === activeId;
					return (
						<div key={def.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderRadius: 12, border: `1px solid ${active ? T.accBd : T.bd}`, background: T.surf, boxShadow: active ? T.smd : 'none' }}>
							<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
								<span style={{ font: `700 15px ${T.disp}`, color: active ? T.acc : T.ink }}>{def.displayName}</span>
								{active ? (
									<Badge status="accent" icon="check">Active</Badge>
								) : rec.enabled ? (
									<Badge status="neutral">v{def.version}</Badge>
								) : (
									<Badge status="warning">disabled</Badge>
								)}
							</div>
							<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{def.id}</div>
							<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub, flex: 1 }}>
								{def.widgets.length} {def.widgets.length === 1 ? 'widget type' : 'widget types'} declared.
							</div>
							{active ? (
								<Button variant="secondary" size="sm" disabled>Current system</Button>
							) : (
								<Button variant="primary" size="sm" icon="retry" disabled={busy} onClick={() => setTargetId(def.id)}>
									Preview switch
								</Button>
							)}
						</div>
					);
				})}
			</div>
			<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
				Want a system that isn't listed? Install its widget package on the Plugins tab (starter library or
				package JSON) — every installed, enabled package can be previewed as the active system.
			</div>
			{targetId && preview && (
				<SystemSwitchDialog
					targetId={targetId}
					targetName={targetName}
					preview={preview}
					busy={busy}
					canWrite={canWrite}
					onApply={apply}
					onClose={() => setTargetId(null)}
				/>
			)}
		</div>
	);
}

/* ---- Theme studio (REAL — persisted preset choice + the LIVE token values of the active preset) --- */
// Mirrors Settings → Appearance: the same localStorage key index.html restores pre-paint, and the
// same dark-theme set so the native color-scheme (scrollbars, form controls) stays in sync.
const THEME_STORE_KEY = 'dndtools:react:theme';
const DARK_PRESETS = new Set(['tavern', 'high-contrast']);
const THEME_PRESETS = [
	{ id: 'tavern', label: 'Tavern', desc: 'Candle-lit dark (default)' },
	{ id: 'parchment', label: 'Parchment', desc: 'Warm vellum light' },
	{ id: 'high-contrast', label: 'High contrast', desc: 'The accessibility floor' },
];
// The semantic tokens the design system actually drives — read LIVE off the document, never authored.
const TOKEN_GROUPS: { label: string; tokens: string[] }[] = [
	{ label: 'Surfaces', tokens: ['--color-bg', '--color-surface', '--color-surface-raised', '--color-surface-sunken', '--color-border'] },
	{ label: 'Text', tokens: ['--color-text-primary', '--color-text-secondary', '--color-text-tertiary'] },
	{ label: 'Accent & status', tokens: ['--color-accent', '--color-accent-subtle', '--color-status-success', '--color-status-warning', '--color-status-error'] },
];

function ExtTheme() {
	const [theme, setTheme] = useState<string>(document.documentElement.getAttribute('data-theme') || 'tavern');
	// REAL + PERSISTED: the same data-theme attr + localStorage key Settings → Appearance writes, so
	// the choice survives reload (index.html restores it pre-paint) and both surfaces always agree.
	const applyTheme = (v: string) => {
		setTheme(v);
		document.documentElement.setAttribute('data-theme', v);
		document.documentElement.style.colorScheme = DARK_PRESETS.has(v) ? 'dark' : 'light';
		try {
			window.localStorage.setItem(THEME_STORE_KEY, v);
		} catch {
			/* ignore */
		}
	};
	// The LIVE computed value of each token under the active preset (recomputed on theme change —
	// the `theme` read below is the dependency that forces the re-read after the attr flips).
	const tokenValues = useMemo(() => {
		const attr = document.documentElement.getAttribute('data-theme') ?? theme;
		void attr;
		const styles = getComputedStyle(document.documentElement);
		const out: Record<string, string> = {};
		for (const g of TOKEN_GROUPS) for (const name of g.tokens) out[name] = styles.getPropertyValue(name).trim() || '—';
		return out;
	}, [theme]);
	const tokenValue = (name: string) => tokenValues[name] ?? '—';
	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 18, alignItems: 'start' }}>
			<Panel title="Theme preset" action={<Badge status="neutral">active: {theme}</Badge>}>
				<div style={{ marginBottom: 14 }}>
					<SegmentedControl
						ariaLabel="Theme preset"
						value={theme}
						onChange={applyTheme}
						options={THEME_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
					/>
					<div style={{ font: `11px ${T.sans}`, color: T.ter, marginTop: 6 }}>
						{THEME_PRESETS.find((p) => p.id === theme)?.desc}
					</div>
				</div>
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter, marginBottom: 12 }}>
					The preset choice is real and persists (the same setting as Settings → Appearance). Presets are the
					theming architecture — per-token overrides aren't supported, so the rows below are the live,
					read-only token values of the active preset.
				</div>
				{TOKEN_GROUPS.map((g) => (
					<div key={g.label} style={{ marginBottom: 14 }}>
						<div style={{ ...eb, marginBottom: 8 }}>{g.label}</div>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
							{g.tokens.map((name) => (
								<div key={name} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
									<span style={{ width: 26, height: 26, borderRadius: 7, flex: '0 0 auto', background: `var(${name})`, border: `1px solid ${T.bd}` }} />
									<span style={{ flex: 1, font: `11.5px ${T.mono}`, color: T.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
									<span style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{tokenValue(name)}</span>
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
