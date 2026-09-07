import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	buildContentModuleBundle,
	exportWidgetPackage,
	type ContentExport,
	type CoreEvent,
	type WidgetPackageDefinition,
} from '@dndtools/core';
import { Button, Dialog, EmptyState, Icon, Input, Skeleton, Textarea, Toaster } from '../../ds';
import { LoadingRegion, Panel, T } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useAuth } from '../../cloud/AuthContext';
import { isAccountApiConfigured } from '../../cloud/config';
import { deleteModule, listModules, publishModule, type ModuleListing } from '../../cloud/appApi';
import { MarketplaceGate, errText, slugify } from './shared';
import { useI18n } from '../../i18n';

export function CommPublish() {
	const { t, formatDate } = useI18n();
	const isPhone = useViewport() === 'phone';
	const runtime = useRuntime();
	const auth = useAuth();
	const dmId = runtime.defaultActorId;
	const cloudReady = isAccountApiConfigured && auth.status === 'signed-in';
	const [mine, setMine] = useState<ModuleListing[] | null>(null);
	// Failure is its own state — `mine === null` means LOADING, so folding errors into it would
	// leave a permanent fake "Loading…" after a failed fetch.
	const [mineFailed, setMineFailed] = useState(false);
	const [busy, setBusy] = useState(false);
	// RC-CLD-4.1 — a draft publishes as one of the marketplace's listing KINDS. A widget package
	// still ships as its bare definition (what every existing listing is); a content module ships as
	// a `.dndmodule` bundle whose payload is the `content.export` result verbatim.
	const [draft, setDraft] = useState<{
		kind: 'widget-package' | 'content-module';
		packageId: string;
		name: string;
		summary: string;
		version: string;
	} | null>(null);
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

	if (!cloudReady) return <MarketplaceGate signInPrompt="community.market.signInPublish" />;

	const openDraft = (def: WidgetPackageDefinition) =>
		setDraft({
			kind: 'widget-package',
			packageId: def.id,
			name: def.displayName ?? def.id,
			summary: '',
			version: def.version,
		});

	// A content module is built from the vault's PORTABLE export — the same visibility-filtered,
	// secret-scrubbed projection the Export tab downloads. DM-only content is never in it.
	const openContentDraft = () =>
		setDraft({
			kind: 'content-module',
			packageId: '',
			name: '',
			summary: '',
			version: '1.0.0',
		});

	/** Build the `.dndmodule` payload for the draft, or report why it cannot be built. */
	const buildContentModule = async (
		current: NonNullable<typeof draft>,
	): Promise<{ ok: true; payload: unknown } | { ok: false; message: string }> => {
		const res = await runtime.dispatch({
			type: 'content.export',
			actorId: dmId,
			payload: { mode: 'portable' },
		});
		if (res.status !== 'accepted') return { ok: false, message: res.rejection.message };
		const event = res.events.find(
			(e): e is Extract<CoreEvent, { kind: 'content.exported' }> => e.kind === 'content.exported',
		);
		if (!event) return { ok: false, message: t('community.publish.contentEmpty') };
		const exported: ContentExport = event.export;
		if (exported.files.length === 0)
			return { ok: false, message: t('community.publish.contentEmpty') };
		const bundle = buildContentModuleBundle({
			manifest: {
				id: slugify(current.name) || 'content-module',
				name: current.name.trim(),
				summary: current.summary.trim(),
				version: current.version.trim(),
			},
			export: exported,
		});
		if (!bundle.ok) return { ok: false, message: bundle.reason };
		return { ok: true, payload: bundle.bundle };
	};

	const publish = () => {
		if (!draft) return;
		if (!draft.name.trim() || !draft.summary.trim() || !draft.version.trim()) {
			Toaster.error(t('community.publish.allRequired'));
			return;
		}
		const current = draft;
		setBusy(true);
		void (async () => {
			try {
				let payload: unknown;
				if (current.kind === 'content-module') {
					const built = await buildContentModule(current);
					if (!built.ok) {
						Toaster.error(built.message);
						return;
					}
					payload = built.payload;
				} else {
					const exported = exportWidgetPackage(
						runtime.state.widgets,
						{ ids: () => runtime.newId() },
						current.packageId,
					);
					if ('kind' in exported) {
						Toaster.error(
							t('extensions.plugins.exportFailed', {
								id: current.packageId,
								reason: exported.reason,
							}),
						);
						return;
					}
					payload = exported.package;
				}
				await publishModule({
					name: current.name.trim(),
					summary: current.summary.trim(),
					version: current.version.trim(),
					kind: current.kind,
					package: payload,
				});
				Toaster.success(t('community.publish.published', { name: current.name.trim() }));
				setDraft(null);
				loadMine();
			} catch (e) {
				Toaster.error(errText(e, t('community.error')));
			} finally {
				setBusy(false);
			}
		})();
	};

	const unpublish = (listing: ModuleListing) => {
		setBusy(true);
		deleteModule(listing.moduleId)
			.then(() => {
				setConfirmUnpublish(null);
				Toaster.success(t('community.discover.listingRemoved'));
				setMine((list) => (list ? list.filter((m) => m.moduleId !== listing.moduleId) : list));
			})
			.catch((e: unknown) => Toaster.error(errText(e, t('community.error'))))
			.finally(() => setBusy(false));
	};

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: isPhone ? '1fr' : '1.3fr 1fr',
				gap: 18,
				alignItems: 'start',
			}}
		>
			<Panel title={t('community.publish.title')}>
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					{t('community.publish.intro')}
				</div>
				{packages.length === 0 ? (
					<EmptyState
						icon="widget"
						title={t('community.publish.emptyTitle')}
						description={t('community.publish.emptyBody')}
					/>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{packages.map((def, i) => (
							<div
								key={def.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 12,
									padding: '11px 0',
									borderTop: i ? `1px solid ${T.bd}` : 'none',
								}}
							>
								<span
									style={{
										width: 34,
										height: 34,
										borderRadius: 8,
										flex: '0 0 auto',
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										background: T.alt,
										color: T.acc,
									}}
								>
									<Icon name="widget" size="sm" />
								</span>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ font: `600 13px ${T.sans}` }}>{def.displayName ?? def.id}</div>
									<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>
										{def.id} · v{def.version} ·{' '}
										{t('community.discover.widgetCount', { count: def.widgets.length })}
									</div>
								</div>
								<Button
									variant="secondary"
									size="sm"
									icon="upload"
									disabled={busy}
									onClick={() => openDraft(def)}
								>
									{t('community.publish.action')}
								</Button>
							</div>
						))}
					</div>
				)}
				{/* RC-CLD-4.1 — the other thing a DM can publish: their campaign content, as a
				    `.dndmodule` built from the PORTABLE export (no DM-only content ever leaves). */}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 12,
						padding: '11px 0',
						borderTop: `1px solid ${T.bd}`,
					}}
				>
					<span
						style={{
							width: 34,
							height: 34,
							borderRadius: 8,
							flex: '0 0 auto',
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							background: T.alt,
							color: T.acc,
						}}
					>
						<Icon name="book" size="sm" />
					</span>
					<div style={{ flex: 1, minWidth: 0 }}>
						<div style={{ font: `600 13px ${T.sans}` }}>
							{t('community.publish.contentModuleTitle')}
						</div>
						<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>
							{t('community.publish.contentModuleNote')}
						</div>
					</div>
					<Button
						variant="secondary"
						size="sm"
						icon="upload"
						disabled={busy}
						onClick={openContentDraft}
					>
						{t('community.publish.action')}
					</Button>
				</div>
			</Panel>
			<Panel accent title={t('community.publish.yourListings')}>
				{mineFailed ? (
					<EmptyState
						inset
						icon="warning"
						title={t('community.publish.listingsFailed')}
						description={t('community.discover.loadFailedBody')}
						action={
							<Button variant="secondary" size="sm" icon="retry" onClick={loadMine}>
								{t('common.action.retry')}
							</Button>
						}
					/>
				) : mine === null ? (
					<LoadingRegion
						label={t('community.publish.loadingListings')}
						style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
					>
						<Skeleton height={44} />
						<Skeleton height={44} />
					</LoadingRegion>
				) : mine.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						{t('community.publish.nothingYet')}
					</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{mine.map((m, i) => (
							<div
								key={m.moduleId}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '10px 0',
									borderTop: i ? `1px solid ${T.bd}` : 'none',
								}}
							>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ font: `600 13px ${T.sans}` }}>{m.name}</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
										v{m.version} · {formatDate(new Date(m.publishedAt))}
									</div>
								</div>
								<Button
									variant="ghost"
									size="sm"
									disabled={busy}
									onClick={() => setConfirmUnpublish(m)}
								>
									{t('common.action.remove')}
								</Button>
							</div>
						))}
					</div>
				)}
			</Panel>
			<Dialog
				open={confirmUnpublish !== null}
				onClose={() => setConfirmUnpublish(null)}
				title={t('community.discover.removeTitle')}
				description={t('community.discover.removeDescription')}
				tone="danger"
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							size="sm"
							disabled={busy}
							onClick={() => setConfirmUnpublish(null)}
						>
							{t('common.action.cancel')}
						</Button>
						<Button
							variant="danger"
							size="sm"
							icon="trash"
							disabled={busy}
							onClick={() => confirmUnpublish && unpublish(confirmUnpublish)}
						>
							{busy ? t('community.discover.removing') : t('community.discover.removeListing')}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					<strong style={{ color: T.ink }}>{confirmUnpublish?.name}</strong>{' '}
					{t('community.publish.unpublishBody')}
				</div>
			</Dialog>
			<Dialog
				open={draft !== null}
				onClose={() => setDraft(null)}
				title={t('community.publish.dialogTitle')}
				description={t('community.publish.dialogDescription')}
				icon="upload"
				size="md"
				footer={
					<>
						<Button variant="secondary" size="sm" disabled={busy} onClick={() => setDraft(null)}>
							{t('common.action.cancel')}
						</Button>
						<Button variant="primary" size="sm" icon="upload" disabled={busy} onClick={publish}>
							{busy ? t('community.publish.publishing') : t('community.publish.publishModule')}
						</Button>
					</>
				}
			>
				{draft && (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						<Input
							value={draft.name}
							onChange={(e: { target: { value: string } }) =>
								setDraft((d) => (d ? { ...d, name: e.target.value } : d))
							}
							placeholder={t('community.publish.name')}
							aria-label={t('community.publish.name')}
							maxLength={80}
						/>
						<Textarea
							value={draft.summary}
							onChange={(e: { target: { value: string } }) =>
								setDraft((d) => (d ? { ...d, summary: e.target.value } : d))
							}
							placeholder={t('community.publish.summaryPlaceholder')}
							aria-label={t('community.publish.summary')}
							rows={3}
							maxLength={280}
						/>
						<Input
							value={draft.version}
							onChange={(e: { target: { value: string } }) =>
								setDraft((d) => (d ? { ...d, version: e.target.value } : d))
							}
							placeholder={t('community.publish.versionPlaceholder')}
							aria-label={t('community.publish.version')}
							maxLength={20}
						/>
					</div>
				)}
			</Dialog>
		</div>
	);
}
