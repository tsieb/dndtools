import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	exportWidgetPackage,
	getContentItemsForActor,
	type WidgetPackageDefinition,
} from '@dndtools/core';
import { Badge, Button, Dialog, EmptyState, Icon, Input, Skeleton, Stat, Switch, Tabs, Textarea, Toaster, VisibilityChip } from '../ds';
import { Page, Panel, T, eb } from '../app/screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';
import { useAuth } from '../cloud/AuthContext';
import { isAccountApiConfigured } from '../cloud/config';
import {
	deleteModule,
	getModule,
	listModules,
	publishModule,
	type ModuleListing,
} from '../cloud/appApi';
import { downloadJsonFile, downloadTextFile, fileDateStamp } from '../platform/download';

/**
 * Community — discover/publish marketplace modules and export your work.
 *
 * REAL WIRING:
 *   - Discover / Publish: the app-api marketplace (list/fetch/publish/delete). Installing runs the
 *     EXISTING `widget.package.install`/`upgrade` review flow — packages land unreviewed with every
 *     host permission denied (fail-closed), enabled later in Extensions → Plugins. Fail-closed gate
 *     when the cloud backend isn't configured or the user is signed out.
 *   - Export: dispatches the real `content.export` (mode + item-type scope are REAL core params) and
 *     DOWNLOADS the result — one markdown file exports as .md, multiple as a .json bundle.
 *   - Wiki eligibility counts come from the live actor-filtered content read.
 *
 * HONEST STUB (clearly noted in-panel): wiki HOSTING has no backend — eligibility is real, the
 * publish button is a local preview.
 */

const errText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Something went wrong — try again.');

/** ARIA radio-group contract (mirrors Onboarding's): arrows move selection (selection follows
 * focus, wrapping), Tab skips the group as one stop. */
function radioGroupKeyDown(e: React.KeyboardEvent) {
	if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) return;
	const radios = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
	const at = radios.indexOf(e.target as HTMLElement);
	if (at === -1 || radios.length < 2) return;
	e.preventDefault();
	const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
	const next = radios[(at + delta + radios.length) % radios.length];
	next.focus();
	next.click();
}

// Wiki access vocabulary for the preview-only publish settings (hosting has no backend — noted in-panel).
const WIKI_ACCESS_MODES = [
	{ value: 'public', label: 'Public', note: 'Indexed by search engines' },
	{ value: 'unlisted', label: 'Unlisted', note: 'Direct link only, not indexed' },
	{ value: 'password', label: 'Password', note: 'Visitors enter a password once' },
] as const;

export function Community() {
	const [tab, setTab] = useState('discover');
	const tabs = [
		{ id: 'discover', label: 'Discover', icon: 'globe' },
		{ id: 'export', label: 'Export', icon: 'send' },
		{ id: 'publish', label: 'Publish', icon: 'upload' },
		{ id: 'wiki', label: 'Campaign wiki', icon: 'knowledge-book' },
	];
	return (
		<Page max={1200}>
			<div style={{ marginBottom: 18 }}><Tabs value={tab} onChange={setTab} tabs={tabs} /></div>
			{tab === 'discover' && <CommDiscover />}
			{tab === 'export' && <CommExport />}
			{tab === 'publish' && <CommPublish />}
			{tab === 'wiki' && <CommWiki />}
		</Page>
	);
}

/** Fail-closed marketplace gate: local-only build, or signed out. */
function MarketplaceGate({ verb }: { verb: string }) {
	const auth = useAuth();
	if (!isAccountApiConfigured) {
		return (
			<Panel title="Module marketplace" action={<Badge status="neutral">Local-only build</Badge>}>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					This build isn’t connected to a cloud backend, so there is no marketplace to {verb}. You can
					still install packages by pasting their JSON in Extensions → Plugins.
				</div>
			</Panel>
		);
	}
	return (
		<Panel title="Module marketplace" action={<Badge status="neutral">Signed out</Badge>}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
				<div style={{ flex: '1 1 240px', font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					Sign in to {verb} community modules. Everything else in the app works without an account.
				</div>
				<Button variant="primary" size="sm" icon="UserCircle" onClick={() => auth.openAuthModal()}>Sign in</Button>
			</div>
		</Panel>
	);
}

const kb = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);

function CommDiscover() {
	const runtime = useRuntime();
	const auth = useAuth();
	const dmId = runtime.defaultActorId;
	const cloudReady = isAccountApiConfigured && auth.status === 'signed-in';
	const [modules, setModules] = useState<ModuleListing[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [selId, setSelId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [review, setReview] = useState<{ listing: ModuleListing; definition: WidgetPackageDefinition; isUpgrade: boolean } | null>(null);
	// Removing a listing deletes it server-side for everyone (no undo exists), so it confirms first.
	const [confirmRemove, setConfirmRemove] = useState<ModuleListing | null>(null);

	const load = useCallback(() => {
		setFailed(false);
		listModules()
			.then(setModules)
			.catch(() => setFailed(true));
	}, []);
	useEffect(() => {
		if (cloudReady) load();
	}, [cloudReady, load]);

	if (!cloudReady) return <MarketplaceGate verb="browse and install" />;

	const sel = modules?.find((m) => m.moduleId === selId) ?? modules?.[0] ?? null;

	// Fetch the payload, sanity-check the definition shape, then hand off to the review dialog. The
	// core install command re-validates the full definition fail-closed — this check is only so the
	// dialog can show honest facts (id/widget count) before the user commits.
	const startInstall = (listing: ModuleListing) => {
		setBusy(true);
		getModule(listing.moduleId)
			.then((full) => {
				const def = full.package as WidgetPackageDefinition;
				if (!def || typeof def !== 'object' || typeof def.id !== 'string' || !def.id) {
					Toaster.error('This module’s payload is not a valid widget package.');
					return;
				}
				const existing = runtime.state.widgets.packages[def.id];
				const isUpgrade = !!existing && !existing.removedAt;
				if (isUpgrade && def.id.startsWith('system.')) {
					Toaster.error('This module clashes with a code-defined system package and can’t be installed.');
					return;
				}
				setReview({ listing, definition: def, isUpgrade });
			})
			.catch((e: unknown) => Toaster.error(errText(e)))
			.finally(() => setBusy(false));
	};

	const confirmInstall = async () => {
		if (!review) return;
		setBusy(true);
		try {
			const result = await runtime.dispatch({
				type: review.isUpgrade ? 'widget.package.upgrade' : 'widget.package.install',
				actorId: dmId,
				payload: { package: review.definition },
			});
			if (result.status === 'accepted') {
				Toaster.success(
					review.isUpgrade
						? `Upgraded ${review.definition.id} — declared migrations ran against placed widgets.`
						: `Installed ${review.definition.id} — unreviewed, every host permission denied (fail-closed). Enable it in Extensions → Plugins.`,
				);
				setReview(null);
			} else {
				Toaster.error(result.rejection.message);
			}
		} finally {
			setBusy(false);
		}
	};

	const removeListing = (listing: ModuleListing) => {
		setBusy(true);
		deleteModule(listing.moduleId)
			.then(() => {
				setConfirmRemove(null);
				Toaster.success('Listing removed from the marketplace.');
				setModules((list) => (list ? list.filter((m) => m.moduleId !== listing.moduleId) : list));
			})
			.catch((e: unknown) => Toaster.error(errText(e)))
			.finally(() => setBusy(false));
	};

	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18, alignItems: 'start' }}>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
				{failed ? (
					<Panel title="Modules">
						<EmptyState
							inset
							icon="warning"
							title="Couldn’t load the marketplace"
							description="Check your connection and try again."
							action={<Button variant="secondary" size="sm" icon="retry" onClick={load}>Retry</Button>}
						/>
					</Panel>
				) : modules === null ? (
					<Panel title="Modules">
						<div role="status" aria-label="Loading modules" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
							<Skeleton height={96} />
							<Skeleton height={96} />
						</div>
					</Panel>
				) : modules.length === 0 ? (
					<EmptyState icon="globe" title="No modules published yet" description="Anything you publish from the Publish tab appears here for every signed-in player and DM." />
				) : (
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 14 }}>
						{modules.map((m) => (
							<button key={m.moduleId} type="button" onClick={() => setSelId(m.moduleId)} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderRadius: 12, cursor: 'pointer', textAlign: 'left', border: `1px solid ${sel?.moduleId === m.moduleId ? T.accBd : T.bd}`, background: T.surf, boxShadow: sel?.moduleId === m.moduleId ? T.smd : 'none' }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
									<span style={{ font: `700 14px ${T.disp}`, flex: 1, minWidth: 0 }}>{m.name}</span>
									{m.owned && <Badge status="accent">Yours</Badge>}
								</div>
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>v{m.version} · {kb(m.size)} · {new Date(m.publishedAt).toLocaleDateString()}</div>
								<div style={{ font: `12px/1.45 ${T.sans}`, color: T.sub, flex: 1 }}>{m.summary}</div>
							</button>
						))}
					</div>
				)}
			</div>
			{sel && (
				<Panel accent title={sel.name} action={<Badge status="neutral">v{sel.version}</Badge>}>
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>published {new Date(sel.publishedAt).toLocaleDateString()} · {kb(sel.size)} · hash {sel.contentHash.slice(0, 12)}…</div>
					<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub }}>{sel.summary}</div>
					<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
						Installing runs the standard package review flow: the package arrives disabled and
						unreviewed, with every host permission denied until you enable it in Extensions → Plugins.
					</div>
					<Button variant="primary" size="md" icon="import" disabled={busy} onClick={() => startInstall(sel)}>Install to vault</Button>
					{sel.owned && (
						<Button variant="ghost" size="sm" icon="trash" disabled={busy} onClick={() => setConfirmRemove(sel)}>Remove listing</Button>
					)}
				</Panel>
			)}
			<Dialog
				open={confirmRemove !== null}
				onClose={() => setConfirmRemove(null)}
				title="Remove this listing?"
				description="Deleted from the marketplace server-side — this cannot be undone."
				tone="danger"
				size="sm"
				footer={
					<>
						<Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirmRemove(null)}>Cancel</Button>
						<Button variant="danger" size="sm" icon="trash" disabled={busy} onClick={() => confirmRemove && removeListing(confirmRemove)}>{busy ? 'Removing…' : 'Remove listing'}</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					<strong style={{ color: T.ink }}>{confirmRemove?.name}</strong> disappears from Discover for everyone. Copies already installed in vaults keep working — you can publish it again later.
				</div>
			</Dialog>
			<Dialog
				open={review !== null}
				onClose={() => setReview(null)}
				title={review?.isUpgrade ? 'Upgrade this package?' : 'Install this package?'}
				description="Review what you’re adding to the vault before it lands."
				icon="import"
				size="md"
				footer={
					<>
						<Button variant="secondary" size="sm" disabled={busy} onClick={() => setReview(null)}>Cancel</Button>
						<Button variant="primary" size="sm" icon="import" disabled={busy} onClick={() => void confirmInstall()}>
							{busy ? 'Working…' : review?.isUpgrade ? 'Upgrade package' : 'Install package'}
						</Button>
					</>
				}
			>
				{review && (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 8, font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
						<div><strong style={{ color: T.ink }}>{review.definition.displayName ?? review.definition.id}</strong> · v{review.definition.version}</div>
						<div>{Array.isArray(review.definition.widgets) ? review.definition.widgets.length : 0} widget{Array.isArray(review.definition.widgets) && review.definition.widgets.length === 1 ? '' : 's'} · package id <code style={{ font: `11.5px ${T.mono}` }}>{review.definition.id}</code></div>
						<div style={{ color: T.ter, font: `11.5px/1.5 ${T.sans}` }}>
							{review.isUpgrade
								? 'This upgrades your installed copy — declared migrations run against every placed widget.'
								: 'It installs fail-closed: disabled, unreviewed, and with every host permission denied until you enable it.'}
						</div>
					</div>
				)}
			</Dialog>
		</div>
	);
}

function CommExport() {
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	const [priv, setPriv] = useState(false);
	const [result, setResult] = useState<{ exported: number; omitted: number; mode: string; file: string } | null>(null);
	// Busy latch: the export dispatch is async, and an unbuffered double-click would dispatch (and
	// download) twice.
	const [exporting, setExporting] = useState(false);

	// REAL counts from the live actor-filtered content read (the DM sees every item).
	const items = useMemo(() => getContentItemsForActor(runtime.state.content, runtime.state.permissions, dmId), [runtime.state.content, runtime.state.permissions, dmId]);
	const dmOnlyCount = items.filter((i) => i.visibility === 'dm-only').length;
	const playerCount = items.length - dmOnlyCount;

	// REAL type scope: distinct item kinds with live counts; the selection feeds core's `itemTypes`
	// export parameter (scoping can only NARROW the visibility-filtered export, never widen it).
	const kinds = useMemo(() => {
		const counts = new Map<string, number>();
		for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
		return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	}, [items]);
	const [offKinds, setOffKinds] = useState<Record<string, boolean>>({});
	const selectedKinds = kinds.map(([k]) => k).filter((k) => !offKinds[k]);
	const allSelected = selectedKinds.length === kinds.length;

	const runExport = async () => {
		if (exporting) return;
		setExporting(true);
		try {
			await doExport();
		} finally {
			setExporting(false);
		}
	};

	const doExport = async () => {
		// REAL: core `content.export` selects by VISIBILITY MODE — `dm-backup` keeps DM-only content,
		// `portable` redacts it — narrowed by the selected item types.
		const res = await runtime.dispatch({
			type: 'content.export',
			actorId: dmId,
			payload: {
				mode: priv ? 'dm-backup' : 'portable',
				...(allSelected ? {} : { itemTypes: selectedKinds }),
			},
		});
		if (res.status !== 'accepted') {
			Toaster.error(res.rejection.message);
			return;
		}
		const ev = res.events.find((e: any) => e.kind === 'content.exported') as any;
		if (!ev) return;
		const files: { path: string; markdown: string }[] = ev.export?.files ?? [];
		const mode: string = ev.mode;
		let fileName: string;
		if (files.length === 1) {
			// A single note downloads as plain markdown, named by its stable export path.
			fileName = files[0].path.split('/').pop() || `export-${fileDateStamp()}.md`;
			downloadTextFile(fileName, files[0].markdown, 'text/markdown');
		} else {
			// Multiple files ship as one JSON bundle (round-trips through the Knowledge import).
			fileName = `dndtools-export-${mode}-${fileDateStamp()}.json`;
			downloadJsonFile(fileName, {
				format: 'dndtools-content-export',
				version: 1,
				mode,
				files,
			});
		}
		setResult({ exported: ev.exportedItems, omitted: ev.omittedForVisibility, mode, file: fileName });
	};

	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
			<Panel title="What to export">
				<div style={{ ...eb }}>Content types <span style={{ color: T.ter, font: `11px ${T.sans}` }}>(live counts — feeds core’s export scope)</span></div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{kinds.length === 0 ? (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>Nothing to export yet — create notes and content in Knowledge first.</div>
					) : (
						kinds.map(([kind, count]) => (
							<label key={kind} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', border: `1px solid ${T.bd}`, borderRadius: 9, cursor: 'pointer' }}>
								<Switch checked={!offKinds[kind]} onChange={() => setOffKinds((s) => ({ ...s, [kind]: !s[kind] }))} />
								<span style={{ flex: 1, font: `12.5px ${T.sans}`, textTransform: 'capitalize' }}>{kind}</span>
								<span style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{count}</span>
							</label>
						))
					)}
				</div>
				<label style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 11px', borderRadius: 9, background: priv ? 'var(--color-visibility-dm-subtle)' : T.alt, border: `1px solid ${priv ? 'var(--color-visibility-dm)' : T.bd}`, cursor: 'pointer', marginTop: 4 }}>
					<Switch checked={priv} onChange={() => setPriv((p: boolean) => !p)} />
					<span style={{ flex: 1 }}><span style={{ display: 'flex', alignItems: 'center', gap: 6, font: `600 12.5px ${T.sans}` }}>Include DM-only content <VisibilityChip level="dm-only" compact /></span><span style={{ font: `11px ${T.sans}`, color: T.ter }}>Off → <code>portable</code> mode (secrets redacted). On → <code>dm-backup</code> mode.</span></span>
				</label>
			</Panel>
			<Panel accent title="Export">
				<div style={{ display: 'flex', alignItems: 'center', gap: 10, font: `12.5px ${T.sans}`, color: T.sub }}>
					<Icon name="check" size={16} color={T.ok} /><span>{items.length} vault items · {playerCount} player-visible · {dmOnlyCount} DM-only</span>
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 9, background: T.sunken, border: `1px solid ${T.bd}`, marginTop: 6 }}>
					<Icon name="download" size={16} color={T.acc} />
					<span style={{ flex: 1, font: `12px ${T.mono}`, color: T.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
						{priv ? 'dm-backup' : 'portable'} · {allSelected ? 'all types' : `${selectedKinds.length}/${kinds.length} types`} · downloads .md / .json
					</span>
				</div>
				<Button variant="primary" size="md" icon="download" disabled={items.length === 0 || selectedKinds.length === 0 || exporting} onClick={() => void runExport()}>
					{exporting ? 'Exporting…' : 'Export & download'}
				</Button>
				{result ? (
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, font: `12px ${T.sans}`, color: T.sub }}>
						<Icon name="check" size={15} color={T.ok} />
						<span>Downloaded <code style={{ font: `11.5px ${T.mono}` }}>{result.file}</code> — {result.exported} {result.exported === 1 ? 'item' : 'items'} in <strong>{result.mode}</strong> mode · {result.omitted} omitted for visibility.</span>
					</div>
				) : (
					<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>One note exports as markdown; more become a JSON bundle you can re-import in Knowledge.</div>
				)}
			</Panel>
		</div>
	);
}

function CommPublish() {
	const runtime = useRuntime();
	const auth = useAuth();
	const cloudReady = isAccountApiConfigured && auth.status === 'signed-in';
	const [mine, setMine] = useState<ModuleListing[] | null>(null);
	// Failure is its own state — `mine === null` means LOADING, so folding errors into it would
	// leave a permanent fake "Loading…" after a failed fetch.
	const [mineFailed, setMineFailed] = useState(false);
	const [busy, setBusy] = useState(false);
	const [draft, setDraft] = useState<{ packageId: string; name: string; summary: string; version: string } | null>(null);
	// Unpublishing deletes the listing server-side for everyone (no undo exists), so it confirms first.
	const [confirmUnpublish, setConfirmUnpublish] = useState<ModuleListing | null>(null);

	const packages = useMemo(
		() =>
			Object.values(runtime.state.widgets.packages)
				.filter((rec) => !rec.removedAt && !rec.package.id.startsWith('system.'))
				.map((rec) => rec.package),
		[runtime.state.widgets],
	);

	const loadMine = useCallback(() => {
		setMineFailed(false);
		setMine(null);
		listModules()
			.then((all) => setMine(all.filter((m) => m.owned)))
			.catch(() => setMineFailed(true));
	}, []);
	useEffect(() => {
		if (cloudReady) loadMine();
	}, [cloudReady, loadMine]);

	if (!cloudReady) return <MarketplaceGate verb="publish" />;

	const openDraft = (def: WidgetPackageDefinition) =>
		setDraft({ packageId: def.id, name: def.displayName ?? def.id, summary: '', version: def.version });

	const publish = () => {
		if (!draft) return;
		if (!draft.name.trim() || !draft.summary.trim() || !draft.version.trim()) {
			Toaster.error('Name, summary and version are all required.');
			return;
		}
		const exported = exportWidgetPackage(runtime.state.widgets, { ids: () => runtime.newId() }, draft.packageId);
		if ('kind' in exported) {
			Toaster.error(`Package ${draft.packageId} could not be exported (${exported.reason}).`);
			return;
		}
		setBusy(true);
		publishModule({ name: draft.name.trim(), summary: draft.summary.trim(), version: draft.version.trim(), package: exported.package })
			.then(() => {
				Toaster.success(`Published ${draft.name.trim()} to the marketplace.`);
				setDraft(null);
				loadMine();
			})
			.catch((e: unknown) => Toaster.error(errText(e)))
			.finally(() => setBusy(false));
	};

	const unpublish = (listing: ModuleListing) => {
		setBusy(true);
		deleteModule(listing.moduleId)
			.then(() => {
				setConfirmUnpublish(null);
				Toaster.success('Listing removed from the marketplace.');
				setMine((list) => (list ? list.filter((m) => m.moduleId !== listing.moduleId) : list));
			})
			.catch((e: unknown) => Toaster.error(errText(e)))
			.finally(() => setBusy(false));
	};

	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, alignItems: 'start' }}>
			<Panel title="Publish an installed package">
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					Publishing shares one of your installed widget packages (its full exported definition) with
					every signed-in user. System packages are code-defined and can’t be published.
				</div>
				{packages.length === 0 ? (
					<EmptyState icon="widget" title="No publishable packages" description="Install or author a widget package in Extensions → Plugins first — system packages stay private." />
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{packages.map((def, i) => (
							<div key={def.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
								<span style={{ width: 34, height: 34, borderRadius: 8, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: T.alt, color: T.acc }}><Icon name="widget" size="sm" /></span>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ font: `600 13px ${T.sans}` }}>{def.displayName ?? def.id}</div>
									<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{def.id} · v{def.version} · {def.widgets.length} widget{def.widgets.length === 1 ? '' : 's'}</div>
								</div>
								<Button variant="secondary" size="sm" icon="upload" disabled={busy} onClick={() => openDraft(def)}>Publish</Button>
							</div>
						))}
					</div>
				)}
			</Panel>
			<Panel accent title="Your listings">
				{mineFailed ? (
					<EmptyState
						inset
						icon="warning"
						title="Couldn’t load your listings"
						description="Check your connection and try again."
						action={<Button variant="secondary" size="sm" icon="retry" onClick={loadMine}>Retry</Button>}
					/>
				) : mine === null ? (
					<div role="status" aria-label="Loading your listings" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						<Skeleton height={44} />
						<Skeleton height={44} />
					</div>
				) : mine.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>Nothing published yet.</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{mine.map((m, i) => (
							<div key={m.moduleId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ font: `600 13px ${T.sans}` }}>{m.name}</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>v{m.version} · {new Date(m.publishedAt).toLocaleDateString()}</div>
								</div>
								<Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmUnpublish(m)}>Remove</Button>
							</div>
						))}
					</div>
				)}
			</Panel>
			<Dialog
				open={confirmUnpublish !== null}
				onClose={() => setConfirmUnpublish(null)}
				title="Remove this listing?"
				description="Deleted from the marketplace server-side — this cannot be undone."
				tone="danger"
				size="sm"
				footer={
					<>
						<Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirmUnpublish(null)}>Cancel</Button>
						<Button variant="danger" size="sm" icon="trash" disabled={busy} onClick={() => confirmUnpublish && unpublish(confirmUnpublish)}>{busy ? 'Removing…' : 'Remove listing'}</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					<strong style={{ color: T.ink }}>{confirmUnpublish?.name}</strong> disappears from Discover for everyone. Copies already installed in vaults keep working — your local package stays, so you can publish it again later.
				</div>
			</Dialog>
			<Dialog
				open={draft !== null}
				onClose={() => setDraft(null)}
				title="Publish to the marketplace"
				description="Shown to everyone browsing Discover — write it for a stranger’s table."
				icon="upload"
				size="md"
				footer={
					<>
						<Button variant="secondary" size="sm" disabled={busy} onClick={() => setDraft(null)}>Cancel</Button>
						<Button variant="primary" size="sm" icon="upload" disabled={busy} onClick={publish}>{busy ? 'Publishing…' : 'Publish module'}</Button>
					</>
				}
			>
				{draft && (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						<Input value={draft.name} onChange={(e: { target: { value: string } }) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))} placeholder="Module name" aria-label="Module name" maxLength={80} />
						<Textarea value={draft.summary} onChange={(e: { target: { value: string } }) => setDraft((d) => (d ? { ...d, summary: e.target.value } : d))} placeholder="What does this add to a table? (required)" aria-label="Module summary" rows={3} maxLength={280} />
						<Input value={draft.version} onChange={(e: { target: { value: string } }) => setDraft((d) => (d ? { ...d, version: e.target.value } : d))} placeholder="Version (e.g. 1.0.0)" aria-label="Module version" maxLength={20} />
					</div>
				)}
			</Dialog>
		</div>
	);
}

function CommWiki() {
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	const [access, setAccess] = useState<string>('unlisted');
	// Honest-local: hosting a public wiki has no backend — local preview only (noted in-panel).
	const [published, setPublished] = useState(false);

	// REAL: only player-visible notes are eligible for a published wiki (DM-only blocks are stripped).
	const items = useMemo(() => getContentItemsForActor(runtime.state.content, runtime.state.permissions, dmId), [runtime.state.content, runtime.state.permissions, dmId]);
	const notes = items.filter((i) => i.kind === 'note');
	const eligibleNotes = notes.filter((i) => i.visibility === 'player-visible');
	const eligible = eligibleNotes.length;

	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 18, alignItems: 'start' }}>
			<Panel title="Publish settings">
				<div style={{ ...eb }}>Public address</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 9, background: T.alt, border: `1px solid ${T.bd}` }}>
					<Icon name="globe" size={15} color={T.acc} /><span style={{ font: `12.5px ${T.mono}`, color: T.ter, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Assigned at publish — hosting is preview-only</span>
				</div>
				<div style={{ ...eb, marginTop: 10 }}>Access</div>
				<div role="radiogroup" aria-label="Wiki access" onKeyDown={radioGroupKeyDown} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{WIKI_ACCESS_MODES.map((m) => (
						<button key={m.value} type="button" role="radio" aria-checked={access === m.value} tabIndex={access === m.value ? 0 : -1} onClick={() => setAccess(m.value)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left', border: `1px solid ${access === m.value ? T.accBd : T.bd}`, background: access === m.value ? T.accSub : T.surf }}>
							<span style={{ width: 16, height: 16, borderRadius: '50%', flex: '0 0 auto', border: `2px solid ${access === m.value ? T.acc : T.bdS}`, background: access === m.value ? T.acc : 'transparent' }} />
							<span style={{ flex: 1 }}><div style={{ font: `600 12.5px ${T.sans}` }}>{m.label}</div><div style={{ font: `11px ${T.sans}`, color: T.ter }}>{m.note}</div></span>
						</button>
					))}
				</div>
				<div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
					<Stat label="Eligible pages" value={`${eligible}/${notes.length}`} icon="knowledge-book" />
					<Stat label="Theme" value="Parchment" icon="theme" />
				</div>
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
					Eligibility is real — only player-visible notes publish; DM-only blocks are stripped. Hosting itself is preview-only.
				</div>
				<Button variant="primary" size="md" icon="upload" disabled={published} onClick={() => setPublished(true)}>
					{published ? 'Published (preview)' : 'Publish wiki'}
				</Button>
			</Panel>
			<Panel title="Reading preview">
				<div data-theme="parchment" style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid var(--color-border)`, background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
					<div style={{ padding: '18px 20px', borderBottom: `1px solid var(--color-border)`, background: 'var(--color-surface)' }}>
						<div style={{ font: `700 19px var(--font-display)`, color: 'var(--color-text-primary)' }}>Your campaign wiki</div>
						<div style={{ font: `12px var(--font-sans)`, color: 'var(--color-text-tertiary)' }}>A campaign wiki · {eligible} {eligible === 1 ? 'page' : 'pages'}</div>
					</div>
					<div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
						<div style={{ font: `600 12px var(--font-sans)`, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Player-visible pages</div>
						{eligibleNotes.slice(0, 3).map((n) => (
							<div key={n.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
								<span style={{ flex: 1, font: `13.5px var(--font-sans)`, color: 'var(--color-text-primary)' }}>{n.title}</span>
								<span style={{ font: `11px var(--font-sans)`, color: 'var(--color-text-tertiary)' }}>{new Date(n.updatedAt).toLocaleDateString()}</span>
							</div>
						))}
						{eligible === 0 && (
							<div style={{ font: `12.5px var(--font-sans)`, color: 'var(--color-text-tertiary)' }}>
								No player-visible notes yet — mark notes player-visible in Knowledge to include them.
							</div>
						)}
						{eligible > 3 && (
							<div style={{ font: `11px var(--font-sans)`, color: 'var(--color-text-tertiary)' }}>… and {eligible - 3} more</div>
						)}
					</div>
				</div>
				<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>Only player-visible notes appear. DM-only blocks are stripped from the published page.</div>
			</Panel>
		</div>
	);
}
