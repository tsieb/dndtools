import { useCallback, useEffect, useMemo, useState } from 'react';
import { exportWidgetPackage, type WidgetPackageDefinition } from '@dndtools/core';
import { Button, Dialog, EmptyState, Icon, Input, Skeleton, Textarea, Toaster } from '../../ds';
import { LoadingRegion, Panel, T } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useAuth } from '../../cloud/AuthContext';
import { isAccountApiConfigured } from '../../cloud/config';
import { deleteModule, listModules, publishModule, type ModuleListing } from '../../cloud/appApi';
import { MarketplaceGate, errText } from './shared';
import { useI18n } from '../../i18n';

export function CommPublish() {
	const { t, formatDate } = useI18n();
	const isPhone = useViewport() === 'phone';
	const runtime = useRuntime();
	const auth = useAuth();
	const cloudReady = isAccountApiConfigured && auth.status === 'signed-in';
	const [mine, setMine] = useState<ModuleListing[] | null>(null);
	// Failure is its own state — `mine === null` means LOADING, so folding errors into it would
	// leave a permanent fake "Loading…" after a failed fetch.
	const [mineFailed, setMineFailed] = useState(false);
	const [busy, setBusy] = useState(false);
	const [draft, setDraft] = useState<{
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
			packageId: def.id,
			name: def.displayName ?? def.id,
			summary: '',
			version: def.version,
		});

	const publish = () => {
		if (!draft) return;
		if (!draft.name.trim() || !draft.summary.trim() || !draft.version.trim()) {
			Toaster.error(t('community.publish.allRequired'));
			return;
		}
		const exported = exportWidgetPackage(
			runtime.state.widgets,
			{ ids: () => runtime.newId() },
			draft.packageId,
		);
		if ('kind' in exported) {
			Toaster.error(
				t('extensions.plugins.exportFailed', {
					id: draft.packageId,
					reason: exported.reason,
				}),
			);
			return;
		}
		setBusy(true);
		publishModule({
			name: draft.name.trim(),
			summary: draft.summary.trim(),
			version: draft.version.trim(),
			package: exported.package,
		})
			.then(() => {
				Toaster.success(t('community.publish.published', { name: draft.name.trim() }));
				setDraft(null);
				loadMine();
			})
			.catch((e: unknown) => Toaster.error(errText(e, t('community.error'))))
			.finally(() => setBusy(false));
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
