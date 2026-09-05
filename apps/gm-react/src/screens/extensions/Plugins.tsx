import { useMemo, useState } from 'react';
import {
	buildWidgetPackageReviewSummary,
	exportWidgetPackage,
	scaffoldCustomWidgetPackageDraft,
	type CommandResult,
	type WidgetPackageDefinition,
} from '@dndtools/core';
import { Badge, Button, Icon, Switch, Textarea, Toaster } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
/* ── RC-WID-2.1: the widget builder overlay is launched from this panel ─────────────────────── */
import { WidgetBuilder } from './WidgetBuilder';
/* ── RC-WID-1.5: the trust review sheet is opened from each installed package card ───────────── */
import { TrustReviewSheet } from './TrustReviewSheet';

/**
 * Plugins — the live widget-package registry (`runtime.state.widgets`). The installed list renders
 * the actual registry records with the capability/host-permission profile computed by
 * `buildWidgetPackageReviewSummary` and their trust posture; install (bundled starter library or
 * pasted package JSON), enable, disable, remove and upgrade all dispatch the real
 * `widget.package.*` commands (DM-only).
 */

const TRUST_TONE: Record<string, string> = {
	trusted: 'success',
	unreviewed: 'warning',
	denied: 'error',
};
// Machine tokens from the trust/review model, rendered as spoken labels.
const TRUST_LABEL: Record<string, string> = {
	trusted: 'Trusted',
	unreviewed: 'Unreviewed',
	denied: 'Denied',
};
const TRUST_RECOMMENDATION_LABEL: Record<string, string> = {
	'trusted-after-review': 'Trust after review',
	'requires-review': 'Requires review',
	'deny-until-fixed': 'Deny until fixed',
};

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

export function ExtPlugins() {
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	const previewing = !!runtime.preview;
	const isDm = runtime.state.permissions.actors[dmId]?.role === 'dm';
	const canWrite = isDm && !previewing;
	const [busy, setBusy] = useState(false);
	const [jsonDraft, setJsonDraft] = useState('');
	const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
	// RC-WID-2.1 — the builder is a full-screen overlay over this panel, not a route (same shape as
	// the map editor over Atlas), so it is opened and closed from here.
	const [builderOpen, setBuilderOpen] = useState(false);
	// RC-WID-1.5 — the package currently open in the trust review sheet, by id.
	const [reviewingId, setReviewingId] = useState<string | null>(null);
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
			const issues = (result.rejection.issues ?? [])
				.map((i) => `${i.path}: ${i.message}`)
				.join(' · ');
			Toaster.error(issues ? `${result.rejection.message} ${issues}` : result.rejection.message);
		}
	};
	const guard = (fn: () => Promise<void>) => {
		if (busy) return;
		setBusy(true);
		void fn()
			.catch((error: unknown) =>
				Toaster.error(error instanceof Error ? error.message : String(error)),
			)
			.finally(() => setBusy(false));
	};

	const setEnabled = (packageId: string, enabled: boolean) =>
		guard(async () => {
			if (enabled) {
				finish(
					await runtime.dispatch({
						type: 'widget.package.enable',
						actorId: dmId,
						payload: { packageId },
					}),
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
				await runtime.dispatch({
					type: 'widget.package.remove',
					actorId: dmId,
					payload: { packageId },
				}),
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
				`Installed ${entry.name} in a disabled, restricted state. Review it above before enabling it.`,
			);
		});

	// Prefill the JSON box with a card's real definition — the working upgrade path: export, bump
	// `version` (declare `migrations` for placed widgets), paste back, and Install/upgrade.
	const exportToDraft = (packageId: string) => {
		const exported = exportWidgetPackage(
			runtime.state.widgets,
			{ ids: () => runtime.newId() },
			packageId,
		);
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
			if (jsonDraft.length > 1024 * 1024) {
				Toaster.error('That package file is too large. The limit is 1 MB.');
				return;
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(jsonDraft);
			} catch (error) {
				Toaster.error(`Not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
				return;
			}
			// Accept a raw package definition or the { package: ... } export wrapper.
			const definition = (
				parsed && typeof parsed === 'object' && 'package' in parsed
					? (parsed as { package: unknown }).package
					: parsed
			) as WidgetPackageDefinition;
			const id = definition && typeof definition === 'object' ? definition.id : undefined;
			if (typeof id !== 'string' || !id) {
				Toaster.error(
					'Package JSON needs a top-level "id" (or an export wrapper with "package.id").',
				);
				return;
			}
			const existing = runtime.state.widgets.packages[id];
			const isUpgrade = !!existing && !existing.removedAt;
			if (isUpgrade && id.startsWith('system.')) {
				Toaster.error('Built-in system packages cannot be replaced with a package file.');
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
					? `Upgraded ${id} and updated its placed widgets.`
					: `Installed ${id} in a disabled, restricted state. Review it above before enabling it.`,
			);
			if (result.status === 'accepted') setJsonDraft('');
		});

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			{!canWrite && (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
					Package management is DM-only and read-only while previewing — the controls below are
					disabled.
				</div>
			)}
			<Panel
				title="Installed packages"
				action={<Badge status="neutral">{packages.length} installed</Badge>}
			>
				<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.ter, marginBottom: 6 }}>
					Each package is isolated and receives only the permissions shown below. Changes to
					installed packages are saved with this campaign.
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					{packages.length === 0 && (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
							No widget packages installed.
						</div>
					)}
					{packages.map((rec: any) => {
						const def = rec.package;
						const isSystem = def.id.startsWith('system.');
						const review = buildWidgetPackageReviewSummary(def);
						// RC-WID-1.5 — "needs review" is now the RECORDED trust state, not the analysis:
						// once the DM has reviewed a package the card stops asking them to review it, and
						// the analysis' recommendation stays visible on its own line below.
						const needsReview = rec.trust.state === 'unreviewed';
						const perms: string[] = review.requestedHostPermissions;
						const widgetCount = def.widgets.length;
						return (
							<div
								key={def.id}
								data-testid={`package-card-${def.id}`}
								style={{
									display: 'flex',
									gap: 12,
									padding: 13,
									border: `1px solid ${needsReview ? T.accBd : T.bd}`,
									borderRadius: 11,
									background: T.surf,
								}}
							>
								<span
									style={{
										width: 38,
										height: 38,
										borderRadius: 9,
										background: T.accSub,
										color: T.acc,
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										flex: '0 0 auto',
									}}
								>
									<Icon name="widget" size="md" />
								</span>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
										<span style={{ font: `600 13.5px ${T.sans}` }}>{def.displayName}</span>
										<Badge status={TRUST_TONE[rec.trust.state] as 'neutral'}>
											{TRUST_LABEL[rec.trust.state] ?? rec.trust.state}
										</Badge>
										{isSystem && <Badge status="neutral">Built-in</Badge>}
										{needsReview && (
											<Badge status="warning" icon="warning">
												Needs review
											</Badge>
										)}
										{review.customCodeWidgets.length > 0 && (
											<Badge status="info">Custom code</Badge>
										)}
										{rec.migrationStatus?.state === 'failed' && (
											<Badge status="error" icon="warning">
												Migration failed
											</Badge>
										)}
									</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter, marginBottom: 6 }}>
										v{def.version} · {widgetCount} {widgetCount === 1 ? 'widget' : 'widgets'} ·{' '}
										{TRUST_RECOMMENDATION_LABEL[review.trustRecommendation] ??
											review.trustRecommendation}
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
												Network: {d}
											</Badge>
										))}
									</div>
								</div>
								<div
									style={{
										display: 'flex',
										flexDirection: 'column',
										alignItems: 'flex-end',
										gap: 8,
										flex: '0 0 auto',
									}}
								>
									{/* RC-WID-1.5 — every package is reviewable, including one already trusted: a
									    review can be revisited, tightened, or reversed. */}
									<Button
										variant={needsReview ? 'secondary' : 'ghost'}
										size="sm"
										icon="permissions"
										// Every card carries a "Review" button, so the visible word alone is not a
										// distinguishing accessible name — the package name goes in the label.
										aria-label={`Review ${def.displayName}`}
										disabled={!canWrite || busy}
										onClick={() => setReviewingId(def.id)}
									>
										Review
									</Button>
									<Switch
										checked={rec.enabled}
										// `!canWrite` is durable, so it stays native. `busy` is transient and flips
										// synchronously inside this switch's own change handler — natively disabling
										// there strands focus on `<body>` mid-toggle, so it takes the soft form.
										disabled={!canWrite}
										aria-disabled={busy || undefined}
										aria-label={`Enable ${def.displayName}`}
										onChange={() => setEnabled(def.id, !rec.enabled)}
									/>
									{/* System packages are code-defined: no remove (the board's own widgets) and no JSON
									    round-trip (their `builtin` runtime is rejected by the installer by design). */}
									{!isSystem && (
										<div style={{ display: 'flex', gap: 6 }}>
											{confirmRemoveId === def.id ? (
												<>
													<Button
														variant="danger"
														size="sm"
														// The trigger unmounts itself to make room for this pair, dropping focus
														// to <body> — a keyboard user had to Tab back in from the top of the page
														// to answer a destructive prompt. `ImportControl` in the Compendium panel already
														// does this; the fix never propagated.
														autoFocus
														disabled={!canWrite || busy}
														onClick={() => removePackage(def.id)}
													>
														Confirm remove
													</Button>
													<Button
														variant="ghost"
														size="sm"
														onClick={() => setConfirmRemoveId(null)}
													>
														Keep
													</Button>
												</>
											) : (
												<>
													<Button
														variant="ghost"
														size="sm"
														icon="upload"
														onClick={() => exportToDraft(def.id)}
													>
														Export JSON
													</Button>
													<Button
														variant="ghost"
														size="sm"
														icon="delete"
														disabled={!canWrite || busy}
														onClick={() => setConfirmRemoveId(def.id)}
													>
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
					These packages are bundled with Lamplight and need no network connection. Each installs
					disabled with all host permissions blocked; review it in the installed list before
					enabling it.
				</div>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))',
						gap: 12,
					}}
				>
					{STARTER_LIBRARY.map((entry) => {
						const rec = runtime.state.widgets.packages[entry.packageId];
						const installed = !!rec && !rec.removedAt;
						return (
							<div
								key={entry.packageId}
								style={{
									display: 'flex',
									flexDirection: 'column',
									gap: 8,
									padding: 13,
									border: `1px solid ${T.bd}`,
									borderRadius: 11,
									background: T.surf,
								}}
							>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
									<span style={{ font: `600 13px ${T.sans}`, flex: 1, minWidth: 0 }}>
										{entry.name}
									</span>
									<Badge status="info">sandboxed</Badge>
								</div>
								<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub, flex: 1 }}>
									{entry.desc}
								</div>
								{installed ? (
									<Badge status="success" icon="check">
										Installed
									</Badge>
								) : (
									<Button
										variant="secondary"
										size="sm"
										icon="import"
										aria-label={`Install ${entry.name}`}
										disabled={!canWrite || busy}
										onClick={() => installStarter(entry)}
									>
										Install
									</Button>
								)}
							</div>
						);
					})}
				</div>
			</Panel>
			<Panel title="Build a widget" action={<Badge status="neutral">no code needed</Badge>}>
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					Describe a widget step by step — what it shows, what it can do, how it looks — and
					Lamplight builds the package for you. It installs disabled, like any other package.
				</div>
				<div>
					<Button
						variant="primary"
						size="sm"
						icon="add"
						disabled={!canWrite}
						onClick={() => setBuilderOpen(true)}
					>
						Build a widget
					</Button>
				</div>
			</Panel>
			<Panel title="Install or upgrade from JSON">
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					Paste a widget-package definition (or an export from a card above). A new id installs; an
					already-installed id upgrades in place. Lamplight validates the package and safely runs
					any declared upgrade steps.
				</div>
				<Textarea
					value={jsonDraft}
					onChange={(e: { target: { value: string } }) => setJsonDraft(e.target.value)}
					rows={10}
					placeholder='{ "id": "my-package", "version": "1.0.0", "displayName": "My Package", "widgets": [ … ] }'
					aria-label="Widget package definition JSON"
					maxLength={1024 * 1024}
					style={{ fontFamily: T.mono, fontSize: 12 }}
				/>
				<Button
					variant="primary"
					size="sm"
					icon="import"
					disabled={!canWrite || busy || !jsonDraft.trim()}
					onClick={applyJson}
				>
					Install / upgrade package
				</Button>
			</Panel>
			<Panel title="Community marketplace" action={<Badge status="neutral">Unavailable</Badge>}>
				<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.ter }}>
					The community marketplace is not available in this edition. Install from the starter
					library or add a trusted package file above instead.
				</div>
			</Panel>
			{builderOpen && <WidgetBuilder onClose={() => setBuilderOpen(false)} />}
			{reviewingId && (
				<TrustReviewSheet packageId={reviewingId} onClose={() => setReviewingId(null)} />
			)}
		</div>
	);
}
