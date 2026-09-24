import { type PublishChecklistResult } from '@dndtools/core';
import { LoadingRegion, Panel, T } from '../../app/screen-kit';
import { Badge, Button, Dialog, EmptyState, Icon, Input, Skeleton, Textarea } from '../../ds';
import { type MessageKey } from '../../i18n';
import { MarketplaceGate } from './shared';

// RC-CLD-4.3 — the checklist item id → its label key. camelCase (not the item's own kebab id) because
// message keys are addressed by dotted path only (i18n/index.test.ts), never a hyphen.
const CHECKLIST_LABEL: Record<PublishChecklistResult['items'][number]['id'], MessageKey> = {
	semver: 'community.publish.checklistSemver',
	license: 'community.publish.checklistLicense',
	changelog: 'community.publish.checklistChangelog',
	'broken-links': 'community.publish.checklistBrokenLinks',
	'missing-assets': 'community.publish.checklistMissingAssets',
};

import { usePublishModel } from './usePublishModel';

export function CommPublish() {
	const {
		t,
		formatDate,
		isPhone,
		cloudReady,
		packages,
		mine,
		mineFailed,
		busy,
		draft,
		setDraft,
		checklist,
		confirmUnpublish,
		setConfirmUnpublish,
		openDraft,
		openContentDraft,
		loadMine,
		unpublish,
		publish,
	} = usePublishModel();
	if (!cloudReady) return <MarketplaceGate signInPrompt="community.market.signInPublish" />;
	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: isPhone ? '1fr' : '1.3fr 1fr',
				gap: T.space.five,
				alignItems: 'start',
			}}
		>
			<Panel title={t('community.publish.title')}>
				<div
					style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.ter, marginBottom: T.space.one }}
				>
					{t('community.publish.intro')}
				</div>
				{packages.length === 0 ? (
					<EmptyState
						illustration="publish-empty"
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
									gap: T.space.three,
									padding: `${T.space.three} ${T.space.zero}`,
									borderTop: i ? `1px solid ${T.bd}` : 'none',
								}}
							>
								<span
									style={{
										width: 34,
										height: 34,
										borderRadius: T.radius.md,
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
									<div style={{ font: `600 var(--text-sm) ${T.sans}` }}>
										{def.displayName ?? def.id}
									</div>
									<div style={{ font: `var(--text-xs) ${T.mono}`, color: T.ter }}>
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
						gap: T.space.three,
						padding: `${T.space.three} ${T.space.zero}`,
						borderTop: `1px solid ${T.bd}`,
					}}
				>
					<span
						style={{
							width: 34,
							height: 34,
							borderRadius: T.radius.md,
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
						<div style={{ font: `600 var(--text-sm) ${T.sans}` }}>
							{t('community.publish.contentModuleTitle')}
						</div>
						<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.ter }}>
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
						illustration="connection-lost"
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
						style={{ display: 'flex', flexDirection: 'column', gap: T.space.three }}
					>
						<Skeleton height={44} />
						<Skeleton height={44} />
					</LoadingRegion>
				) : mine.length === 0 ? (
					<EmptyState
						inset
						illustration="publish-empty"
						title={t('community.publish.nothingYet')}
					/>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{mine.map((m, i) => (
							<div
								key={m.moduleId}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: T.space.three,
									padding: `${T.space.three} ${T.space.zero}`,
									borderTop: i ? `1px solid ${T.bd}` : 'none',
								}}
							>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ font: `600 var(--text-sm) ${T.sans}` }}>{m.name}</div>
									<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
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
				<div style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
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
						<Button
							variant="primary"
							size="sm"
							icon="upload"
							disabled={busy || !checklist?.readyToPublish}
							onClick={publish}
						>
							{busy ? t('community.publish.publishing') : t('community.publish.publishModule')}
						</Button>
					</>
				}
			>
				{draft && (
					<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.three }}>
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
						<Input
							value={draft.license}
							onChange={(e: { target: { value: string } }) =>
								setDraft((d) => (d ? { ...d, license: e.target.value } : d))
							}
							placeholder={t('community.publish.licensePlaceholder')}
							aria-label={t('community.publish.license')}
							maxLength={80}
						/>
						<Textarea
							value={draft.changelog}
							onChange={(e: { target: { value: string } }) =>
								setDraft((d) => (d ? { ...d, changelog: e.target.value } : d))
							}
							placeholder={t('community.publish.changelogPlaceholder')}
							aria-label={t('community.publish.changelog')}
							rows={2}
							maxLength={2000}
						/>
						{/* RC-CLD-4.3 — the publish checklist: license/changelog/semver block (fail closed,
						    guardrail 9); a broken link or an asset the module can't bundle yet is a warning the
						    DM reads and decides on, never a block (ADR-002/025 — propose, never dispose). */}
						{checklist && (
							<div
								data-testid="publish-checklist"
								style={{
									display: 'flex',
									flexDirection: 'column',
									gap: T.space.oneHalf,
									padding: `${T.space.three} ${T.space.three}`,
									borderRadius: T.radius.md,
									background: T.alt,
									border: `1px solid ${T.bd}`,
								}}
							>
								<span style={{ font: `600 var(--text-xs) ${T.sans}`, color: T.ter }}>
									{t('community.publish.checklistTitle')}
								</span>
								{checklist.items.map((item) => (
									<div
										key={item.id}
										data-testid={`publish-checklist-${item.id}`}
										style={{ display: 'flex', alignItems: 'center', gap: T.space.two }}
									>
										<Badge
											status={
												item.severity === 'pass'
													? 'success'
													: item.severity === 'warning'
														? 'warning'
														: 'error'
											}
										>
											{t(CHECKLIST_LABEL[item.id])}
										</Badge>
										<span style={{ font: `var(--text-xs)/1.4 ${T.sans}`, color: T.sub }}>
											{item.message}
										</span>
									</div>
								))}
							</div>
						)}
					</div>
				)}
			</Dialog>
		</div>
	);
}
