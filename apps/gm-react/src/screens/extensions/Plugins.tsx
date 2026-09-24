import { useMemo, useState } from 'react';
import { STARTER_WIDGET_LIBRARY, type WidgetPackageDefinition } from '@dndtools/core';
import { Badge, Button, EmptyState, Textarea } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
/* ── RC-WID-2.1: the widget builder overlay is launched from this panel ─────────────────────── */
import { WidgetBuilder } from './WidgetBuilder';
import { GenerateDialog } from '../../app/widgetBuilder/GenerateDialog';
/* ── RC-WID-1.5: the trust review sheet is opened from each installed package card ───────────── */
import { TrustReviewSheet } from './TrustReviewSheet';
import { useI18n } from '../../i18n';
import { hasMarketplaceBackend } from '../community/shared';
import { PluginPackageCard } from './PluginPackageCard';
import { ReadOnlyNote } from './shared';
import { usePackageActions } from './usePackageActions';

/**
 * Plugins — the live widget-package registry (`runtime.state.widgets`). The installed list renders
 * the actual registry records with the capability/host-permission profile computed by
 * `buildWidgetPackageReviewSummary` and their trust posture; install (bundled starter library or
 * pasted package JSON), enable, disable, remove and upgrade all dispatch the real
 * `widget.package.*` commands (DM-only).
 */

// Bundled starter library — RC-WID-1.6. The seven packages live in the Core
// (`packages/core/src/state/starter-widgets/`), because what a starter IS — its template, its data
// queries, its declared commands — is package definition, not screen code. This tab only lists them
// and dispatches the ordinary `widget.package.install`. This is NOT a marketplace: nothing is
// fetched from anywhere.
// Each starter's name and description are written into the installed package definition, so they are
// durable vault state rather than screen copy: translating them would make what a campaign stores
// depend on the locale the DM happened to install in. They stay in the source language.

export function ExtPlugins() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	const isDm = runtime.state.permissions.actors[dmId]?.role === 'dm';
	const canWrite = isDm && !runtime.preview;
	const {
		busy,
		jsonDraft,
		setJsonDraft,
		setEnabled,
		removePackage,
		installStarter,
		exportPackage,
		applyJson,
	} = usePackageActions();
	const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
	// RC-WID-2.1 — the builder is a full-screen overlay over this panel, not a route (same shape as
	// the map editor over Atlas), so it is opened and closed from here.
	const [builderOpen, setBuilderOpen] = useState(false);
	// RC-WID-2.7 — "New version" opens the SAME overlay pre-filled from an installed package (a
	// bumped semver, a generated migration entry) instead of a blank draft; null means "Build a
	// widget" (new).
	const [builderEditId, setBuilderEditId] = useState<string | null>(null);
	// RC-WID-3.2 — a package the assistant proposed, held here only until the builder opens on it.
	// It is not installed and nothing durable has changed; closing the builder discards it.
	const [generated, setGenerated] = useState<WidgetPackageDefinition | null>(null);
	const [generateOpen, setGenerateOpen] = useState(false);
	const closeBuilder = () => {
		setBuilderOpen(false);
		setBuilderEditId(null);
		setGenerated(null);
	};
	// RC-WID-1.5 — the package currently open in the trust review sheet, by id.
	const [reviewingId, setReviewingId] = useState<string | null>(null);
	// The live widget-package registry — the "plugins" of this app. A removed package is gone, not listed.
	const packages = useMemo(
		() => Object.values(runtime.state.widgets.packages).filter((rec) => !rec.removedAt),
		[runtime.state.widgets],
	);

	// RC-WID-2.7 — "New version": open the builder pre-filled from this package. `readPackage`
	// already bumps the patch version and `generateMigration` already writes the migration entry;
	// this is only the entry point into that existing edit path from the installed list.
	const newVersion = (packageId: string) => {
		setBuilderEditId(packageId);
		setBuilderOpen(true);
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
			{!canWrite && <ReadOnlyNote>{t('extensions.plugins.readOnly')}</ReadOnlyNote>}
			<Panel
				title={t('extensions.plugins.installedTitle')}
				action={
					<Badge status="neutral">
						{t('extensions.plugins.installedCount', { count: packages.length })}
					</Badge>
				}
			>
				<div
					style={{
						font: `var(--text-sm)/1.55 ${T.sans}`,
						color: T.sub,
						marginBottom: 'var(--space-1-5)',
					}}
				>
					{t('extensions.plugins.installedIntro')}
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
					{packages.length === 0 && (
						<EmptyState icon="widget" title={t('extensions.plugins.none')} />
					)}
					{packages.map((rec) => (
						<PluginPackageCard
							key={rec.package.id}
							rec={rec}
							canWrite={canWrite}
							busy={busy}
							confirmingRemove={confirmRemoveId === rec.package.id}
							onReview={() => setReviewingId(rec.package.id)}
							onToggle={() => setEnabled(rec.package.id, !rec.enabled)}
							onExport={() => exportPackage(rec.package.id)}
							onNewVersion={() => newVersion(rec.package.id)}
							onAskRemove={() => setConfirmRemoveId(rec.package.id)}
							onRemove={() => {
								setConfirmRemoveId(null);
								removePackage(rec.package.id);
							}}
							onKeep={() => setConfirmRemoveId(null)}
						/>
					))}
				</div>
			</Panel>
			<Panel
				title={t('extensions.plugins.starterTitle')}
				action={<Badge status="neutral">{t('extensions.plugins.starterBadge')}</Badge>}
			>
				<div
					style={{
						font: `var(--text-xs)/1.5 ${T.sans}`,
						color: T.sub,
						marginBottom: 'var(--space-1)',
					}}
				>
					{t('extensions.plugins.starterIntro')}
				</div>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))',
						gap: 'var(--space-3)',
					}}
				>
					{STARTER_WIDGET_LIBRARY.map((entry) => {
						const rec = runtime.state.widgets.packages[entry.packageId];
						const installed = !!rec && !rec.removedAt;
						return (
							<div
								key={entry.packageId}
								style={{
									display: 'flex',
									flexDirection: 'column',
									gap: 'var(--space-2)',
									padding: 'var(--space-3)',
									border: `1px solid ${T.bd}`,
									borderRadius: 'var(--radius-lg)',
									background: T.surf,
								}}
							>
								<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
									<span style={{ font: `600 var(--text-sm) ${T.sans}`, flex: 1, minWidth: 0 }}>
										{entry.name}
									</span>
									{/* Which half of the runtime this one is: code in the sandbox, or the host's own
									    template renderer drawing declared data. */}
									<Badge status="info">
										{t(
											entry.shipsCode
												? 'extensions.plugins.sandboxed'
												: 'extensions.plugins.starterNoCode',
										)}
									</Badge>
								</div>
								<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub, flex: 1 }}>
									{entry.description}
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
				<div
					style={{
						font: `var(--text-xs)/1.5 ${T.sans}`,
						color: T.sub,
						marginBottom: 'var(--space-1)',
					}}
				>
					{t('extensions.plugins.buildIntro')}
				</div>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
					<Button
						variant="primary"
						size="sm"
						icon="add"
						disabled={!canWrite}
						onClick={() => {
							setBuilderEditId(null);
							setGenerated(null);
							setBuilderOpen(true);
						}}
					>
						{t('extensions.plugins.buildTitle')}
					</Button>
					{/* RC-WID-3.2 — the assistant drafts it, the builder reviews it, the DM installs it. */}
					<Button
						variant="secondary"
						size="sm"
						icon="sparkle"
						disabled={!canWrite}
						onClick={() => setGenerateOpen(true)}
					>
						{t('widgetGen.title')}
					</Button>
				</div>
			</Panel>
			<Panel title={t('extensions.plugins.jsonTitle')}>
				<div
					style={{
						font: `var(--text-xs)/1.5 ${T.sans}`,
						color: T.sub,
						marginBottom: 'var(--space-1)',
					}}
				>
					{t('extensions.plugins.jsonIntro')}
				</div>
				<Textarea
					value={jsonDraft}
					onChange={(e: { target: { value: string } }) => setJsonDraft(e.target.value)}
					rows={10}
					placeholder={t('extensions.plugins.jsonPlaceholder')}
					aria-label={t('extensions.plugins.jsonField')}
					maxLength={1024 * 1024}
					style={{ fontFamily: T.mono, fontSize: 'var(--text-xs)' }}
				/>
				<Button
					variant="secondary"
					size="sm"
					icon="import"
					disabled={!canWrite || busy || !jsonDraft.trim()}
					onClick={applyJson}
				>
					{t('extensions.plugins.installUpgrade')}
				</Button>
			</Panel>
			{/* RC-CLD-4.5 — where the app API exists, the community marketplace is Community › Discover,
			    so "unavailable" is said only where it is true. */}
			{!hasMarketplaceBackend() && (
				<Panel
					title={t('extensions.plugins.marketTitle')}
					action={<Badge status="neutral">{t('extensions.plugins.marketBadge')}</Badge>}
				>
					<div style={{ font: `var(--text-sm)/1.55 ${T.sans}`, color: T.sub }}>
						{t('extensions.plugins.marketBody')}
					</div>
				</Panel>
			)}
			{builderOpen && (
				<WidgetBuilder
					editPackage={
						builderEditId ? (runtime.state.widgets.packages[builderEditId]?.package ?? null) : null
					}
					generatedPackage={generated}
					onClose={closeBuilder}
				/>
			)}
			<GenerateDialog
				open={generateOpen}
				onClose={() => setGenerateOpen(false)}
				onGenerated={(pkg) => {
					setGenerateOpen(false);
					setGenerated(pkg);
					setBuilderEditId(null);
					setBuilderOpen(true);
				}}
			/>
			{reviewingId && (
				<TrustReviewSheet packageId={reviewingId} onClose={() => setReviewingId(null)} />
			)}
		</div>
	);
}
