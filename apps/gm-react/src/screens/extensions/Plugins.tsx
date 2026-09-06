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
import { useI18n, type MessageKey } from '../../i18n';

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
const TRUST_LABEL: Record<string, MessageKey> = {
	trusted: 'extensions.plugins.trustTrusted',
	unreviewed: 'extensions.plugins.trustUnreviewed',
	denied: 'extensions.plugins.trustDenied',
};
const TRUST_RECOMMENDATION_LABEL: Record<string, MessageKey> = {
	'trusted-after-review': 'extensions.plugins.recommendTrust',
	'requires-review': 'extensions.trust.recommend.review',
	'deny-until-fixed': 'extensions.trust.recommend.deny',
};

const HOST_PERM_LABEL: Record<string, MessageKey> = {
	filesystem: 'extensions.trust.perm.filesystem',
	clipboard: 'extensions.trust.perm.clipboard',
	network: 'extensions.trust.perm.network',
	'source-adapter': 'extensions.trust.perm.sourceAdapter',
	asset: 'extensions.trust.perm.asset',
	'external-link': 'extensions.trust.perm.externalLink',
};

// Bundled starter library — packages the Core itself scaffolds (`scaffoldCustomWidgetPackageDraft`),
// so every entry is valid by construction and still goes through the full `widget.package.install`
// validation + trust pipeline. This is NOT a marketplace: nothing is fetched from anywhere.
// The name and description of a starter are written into the installed package definition, so they
// are durable vault state rather than screen copy: translating them would make what a campaign
// stores depend on the locale the DM happened to install in. They stay in the source language.
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
	const { t } = useI18n();
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
					t('extensions.plugins.enabled', { id: packageId }),
				);
			} else {
				finish(
					await runtime.dispatch({
						type: 'widget.package.disable',
						actorId: dmId,
						payload: { packageId, reason: 'Disabled by widget manager.' },
					}),
					t('extensions.plugins.disabled', { id: packageId }),
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
				t('extensions.plugins.removed', { id: packageId }),
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
				t('extensions.plugins.installedStarter', { name: entry.name }),
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
			Toaster.error(
				t('extensions.plugins.exportFailed', { id: packageId, reason: exported.reason }),
			);
			return;
		}
		setJsonDraft(JSON.stringify(exported.package, null, 2));
		Toaster.info(t('extensions.plugins.exported', { id: packageId }), { duration: 7000 });
	};

	const applyJson = () =>
		guard(async () => {
			if (jsonDraft.length > 1024 * 1024) {
				Toaster.error(t('extensions.plugins.tooLarge'));
				return;
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(jsonDraft);
			} catch (error) {
				Toaster.error(
					t('extensions.plugins.badJson', {
						reason: error instanceof Error ? error.message : String(error),
					}),
				);
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
				Toaster.error(t('extensions.plugins.missingId'));
				return;
			}
			const existing = runtime.state.widgets.packages[id];
			const isUpgrade = !!existing && !existing.removedAt;
			if (isUpgrade && id.startsWith('system.')) {
				Toaster.error(t('extensions.plugins.systemLocked'));
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
					? t('extensions.plugins.upgraded', { id })
					: t('extensions.plugins.installedPackage', { id }),
			);
			if (result.status === 'accepted') setJsonDraft('');
		});

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			{!canWrite && (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
					{t('extensions.plugins.readOnly')}
				</div>
			)}
			<Panel
				title={t('extensions.plugins.installedTitle')}
				action={
					<Badge status="neutral">
						{t('extensions.plugins.installedCount', { count: packages.length })}
					</Badge>
				}
			>
				<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.ter, marginBottom: 6 }}>
					{t('extensions.plugins.installedIntro')}
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					{packages.length === 0 && (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
							{t('extensions.plugins.none')}
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
											{TRUST_LABEL[rec.trust.state]
												? t(TRUST_LABEL[rec.trust.state])
												: rec.trust.state}
										</Badge>
										{isSystem && <Badge status="neutral">{t('extensions.objects.builtIn')}</Badge>}
										{needsReview && (
											<Badge status="warning" icon="warning">
												{t('extensions.plugins.needsReview')}
											</Badge>
										)}
										{review.customCodeWidgets.length > 0 && (
											<Badge status="info">{t('extensions.plugins.customCode')}</Badge>
										)}
										{rec.migrationStatus?.state === 'failed' && (
											<Badge status="error" icon="warning">
												{t('extensions.plugins.migrationFailed')}
											</Badge>
										)}
									</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter, marginBottom: 6 }}>
										{t('extensions.plugins.cardMeta', {
											version: def.version,
											widgets: widgetCount,
											recommendation: TRUST_RECOMMENDATION_LABEL[review.trustRecommendation]
												? t(TRUST_RECOMMENDATION_LABEL[review.trustRecommendation])
												: review.trustRecommendation,
										})}
									</div>
									<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
										{perms.length === 0 ? (
											<Badge status="neutral">{t('extensions.plugins.noPerms')}</Badge>
										) : (
											perms.map((p) => (
												<Badge key={p} status="accent">
													{HOST_PERM_LABEL[p] ? t(HOST_PERM_LABEL[p]) : p}
												</Badge>
											))
										)}
										{review.requestedNetworkDestinations.map((d: string) => (
											<Badge key={d} status="warning">
												{t('extensions.plugins.network', { destination: d })}
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
										aria-label={t('extensions.plugins.reviewLabel', { name: def.displayName })}
										disabled={!canWrite || busy}
										onClick={() => setReviewingId(def.id)}
									>
										{t('extensions.plugins.review')}
									</Button>
									<Switch
										checked={rec.enabled}
										// `!canWrite` is durable, so it stays native. `busy` is transient and flips
										// synchronously inside this switch's own change handler — natively disabling
										// there strands focus on `<body>` mid-toggle, so it takes the soft form.
										disabled={!canWrite}
										aria-disabled={busy || undefined}
										aria-label={t('extensions.plugins.enableLabel', { name: def.displayName })}
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
														{t('extensions.plugins.confirmRemove')}
													</Button>
													<Button
														variant="ghost"
														size="sm"
														onClick={() => setConfirmRemoveId(null)}
													>
														{t('extensions.compendium.keep')}
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
														{t('extensions.plugins.exportJson')}
													</Button>
													<Button
														variant="ghost"
														size="sm"
														icon="delete"
														disabled={!canWrite || busy}
														onClick={() => setConfirmRemoveId(def.id)}
													>
														{t('common.action.remove')}
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
			<Panel
				title={t('extensions.plugins.starterTitle')}
				action={<Badge status="neutral">{t('extensions.plugins.starterBadge')}</Badge>}
			>
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					{t('extensions.plugins.starterIntro')}
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
									<Badge status="info">{t('extensions.plugins.sandboxed')}</Badge>
								</div>
								<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub, flex: 1 }}>
									{entry.desc}
								</div>
								{installed ? (
									<Badge status="success" icon="check">
										{t('extensions.plugins.installed')}
									</Badge>
								) : (
									<Button
										variant="secondary"
										size="sm"
										icon="import"
										aria-label={t('extensions.plugins.installLabel', { name: entry.name })}
										disabled={!canWrite || busy}
										onClick={() => installStarter(entry)}
									>
										{t('extensions.plugins.install')}
									</Button>
								)}
							</div>
						);
					})}
				</div>
			</Panel>
			<Panel
				title={t('extensions.plugins.buildTitle')}
				action={<Badge status="neutral">{t('extensions.plugins.buildBadge')}</Badge>}
			>
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					{t('extensions.plugins.buildIntro')}
				</div>
				<div>
					<Button
						variant="primary"
						size="sm"
						icon="add"
						disabled={!canWrite}
						onClick={() => setBuilderOpen(true)}
					>
						{t('extensions.plugins.buildTitle')}
					</Button>
				</div>
			</Panel>
			<Panel title={t('extensions.plugins.jsonTitle')}>
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					{t('extensions.plugins.jsonIntro')}
				</div>
				<Textarea
					value={jsonDraft}
					onChange={(e: { target: { value: string } }) => setJsonDraft(e.target.value)}
					rows={10}
					placeholder={t('extensions.plugins.jsonPlaceholder')}
					aria-label={t('extensions.plugins.jsonField')}
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
					{t('extensions.plugins.installUpgrade')}
				</Button>
			</Panel>
			<Panel
				title={t('extensions.plugins.marketTitle')}
				action={<Badge status="neutral">{t('extensions.plugins.marketBadge')}</Badge>}
			>
				<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.ter }}>
					{t('extensions.plugins.marketBody')}
				</div>
			</Panel>
			{builderOpen && <WidgetBuilder onClose={() => setBuilderOpen(false)} />}
			{reviewingId && (
				<TrustReviewSheet packageId={reviewingId} onClose={() => setReviewingId(null)} />
			)}
		</div>
	);
}
