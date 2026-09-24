import { LoadingRegion, Panel, T, eb, radioGroupKeyDown } from '../../app/screen-kit';
import { isAccountApiConfigured } from '../../cloud/config';
import { Badge, Button, Checkbox, Dialog, EmptyState, Icon, Input, Skeleton, Stat } from '../../ds';
import { useI18n } from '../../i18n';
import { WIKI_ACCESS_MODES, kb, wikiPublicUrl } from './shared';
import { WikiPreview } from './WikiPreview';

import { useWikiModel } from './useWikiModel';

export function CommWiki() {
	const {
		t,
		formatDate,
		formatTime,
		isPhone,
		auth,
		navigate,
		planLoading,
		canChangePlan,
		canPublish,
		title,
		setTitle,
		access,
		setAccess,
		password,
		setPassword,
		includeRecaps,
		setIncludeRecaps,
		status,
		statusFailed,
		busy,
		confirmUnpublish,
		setConfirmUnpublish,
		eligible,
		notes,
		eligibleNotes,
		pages,
		loadStatus,
		publish,
		unpublish,
		copyLink,
	} = useWikiModel();
	// The settings/publish column adapts to the tier; the reading preview is always shown.
	let settings: React.ReactNode;
	if (!isAccountApiConfigured) {
		settings = (
			<Panel
				title={t('community.wiki.settingsTitle')}
				action={<Badge status="neutral">{t('community.market.localOnly')}</Badge>}
			>
				<div style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
					{t('community.wiki.localOnlyBody')}
				</div>
				<EligibilityStat eligible={eligible} total={notes.length} />
				<Checkbox
					label={t('community.wiki.includeRecaps')}
					checked={includeRecaps}
					onChange={setIncludeRecaps}
				/>
			</Panel>
		);
	} else if (auth.status !== 'signed-in') {
		settings = (
			<Panel
				title={t('community.wiki.settingsTitle')}
				action={<Badge status="neutral">{t('community.market.signedOut')}</Badge>}
			>
				<div
					style={{ display: 'flex', alignItems: 'center', gap: T.space.three, flexWrap: 'wrap' }}
				>
					<div style={{ flex: '1 1 220px', font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
						{t('community.wiki.signInPrompt')}
					</div>
					<Button
						variant="primary"
						size="sm"
						icon="UserCircle"
						onClick={() => auth.openAuthModal()}
					>
						{t('community.market.signIn')}
					</Button>
				</div>
				<EligibilityStat eligible={eligible} total={notes.length} />
				<Checkbox
					label={t('community.wiki.includeRecaps')}
					checked={includeRecaps}
					onChange={setIncludeRecaps}
				/>
			</Panel>
		);
	} else if (!canPublish && status === null) {
		settings = (
			<Panel
				title={t('community.wiki.settingsTitle')}
				action={<Badge status="accent">{t('community.wiki.beacon')}</Badge>}
			>
				<div style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
					{t(
						planLoading
							? 'community.wiki.checkingPlan'
							: canChangePlan
								? 'community.wiki.beaconTryable'
								: 'community.wiki.beaconLocked',
					)}
				</div>
				<Button
					variant="primary"
					size="md"
					icon="sparkle"
					disabled={planLoading}
					onClick={() => navigate('/upgrade')}
				>
					{t('community.wiki.seePlans')}
				</Button>
				<EligibilityStat eligible={eligible} total={notes.length} />
				<Checkbox
					label={t('community.wiki.includeRecaps')}
					checked={includeRecaps}
					onChange={setIncludeRecaps}
				/>
			</Panel>
		);
	} else if (statusFailed) {
		settings = (
			<Panel title={t('community.wiki.settingsTitle')}>
				<EmptyState
					inset
					illustration="connection-lost"
					icon="warning"
					title={t('community.wiki.loadFailed')}
					description={t('community.discover.loadFailedBody')}
					action={
						<Button variant="secondary" size="sm" icon="retry" onClick={loadStatus}>
							{t('common.action.retry')}
						</Button>
					}
				/>
			</Panel>
		);
	} else if (status === undefined) {
		settings = (
			<Panel title={t('community.wiki.settingsTitle')}>
				<LoadingRegion
					label={t('community.wiki.loadingStatus')}
					style={{ display: 'flex', flexDirection: 'column', gap: T.space.three }}
				>
					<Skeleton height={44} />
					<Skeleton height={96} />
				</LoadingRegion>
			</Panel>
		);
	} else if (status) {
		const url = wikiPublicUrl(status.wikiId);
		settings = (
			// "ok" was not a Badge status — it fell through to `neutral`, dropping both the green and
			// the status icon this positive state relies on for colour-independent meaning.
			<Panel
				title={t('community.wiki.publishedTitle')}
				action={<Badge status="success">{t('community.wiki.live')}</Badge>}
			>
				<div style={{ ...eb }}>{t('community.wiki.publicLink')}</div>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: T.space.two,
						padding: `${T.space.two} ${T.space.three}`,
						borderRadius: T.radius.md,
						background: T.alt,
						border: `1px solid ${T.bd}`,
					}}
				>
					<Icon name="globe" size={15} color={T.acc} />
					<span
						style={{
							font: `var(--text-xs) ${T.mono}`,
							color: T.sub,
							flex: 1,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{url ?? t('community.wiki.urlUnconfigured')}
					</span>
					<Button
						variant="ghost"
						size="sm"
						icon="link"
						disabled={!url}
						onClick={() => {
							if (url) void copyLink(url);
						}}
					>
						{t('common.action.copy')}
					</Button>
				</div>
				<div
					style={{
						display: 'flex',
						flexWrap: 'wrap',
						alignItems: 'center',
						gap: T.space.four,
						marginTop: T.space.oneHalf,
					}}
				>
					<Stat
						label={t('community.wiki.access')}
						value={(() => {
							const mode = WIKI_ACCESS_MODES.find((m) => m.value === status.access);
							return mode ? t(mode.label) : status.access;
						})()}
						icon="lock"
					/>
					<Stat
						label={t('community.wiki.pages')}
						value={String(status.pageCount)}
						icon="knowledge-book"
					/>
					<Stat label={t('community.wiki.size')} value={kb(status.size)} icon="upload" />
				</div>
				<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.ter }}>
					{t('community.wiki.publishedMeta', {
						published: formatDate(new Date(status.publishedAt)),
						updated: `${formatDate(new Date(status.updatedAt))} ${formatTime(
							new Date(status.updatedAt),
						)}`,
					})}
				</div>
				<Checkbox
					label={t('community.wiki.includeRecaps')}
					checked={includeRecaps}
					disabled={!canPublish || busy}
					onChange={setIncludeRecaps}
				/>
				{!canPublish && (
					<div
						style={{
							padding: `${T.space.three} ${T.space.three}`,
							borderRadius: T.radius.md,
							background: T.accSub,
							border: `1px solid ${T.accBd}`,
							font: `var(--text-xs)/1.5 ${T.sans}`,
							color: T.sub,
						}}
					>
						{t('community.wiki.remainsLive')}{' '}
						{t(
							canChangePlan
								? 'community.wiki.remainsLiveTryable'
								: 'community.wiki.remainsLiveLocked',
						)}
					</div>
				)}
				<div style={{ display: 'flex', gap: T.space.two, flexWrap: 'wrap' }}>
					{canPublish ? (
						<Button variant="secondary" size="md" icon="upload" disabled={busy} onClick={publish}>
							{busy ? t('community.discover.working') : t('community.wiki.republish')}
						</Button>
					) : (
						<Button variant="primary" size="md" icon="sparkle" onClick={() => navigate('/upgrade')}>
							{t(canChangePlan ? 'community.wiki.tryBeacon' : 'community.wiki.viewPlan')}
						</Button>
					)}
					<Button
						variant="ghost"
						size="md"
						icon="delete"
						disabled={busy}
						onClick={() => setConfirmUnpublish(true)}
					>
						{t('community.wiki.unpublish')}
					</Button>
				</div>
				<Dialog
					open={confirmUnpublish}
					onClose={() => setConfirmUnpublish(false)}
					title={t('community.wiki.unpublishTitle')}
					description={t('community.wiki.unpublishDescription')}
					tone="danger"
					size="sm"
					footer={
						<>
							<Button
								variant="secondary"
								size="sm"
								disabled={busy}
								onClick={() => setConfirmUnpublish(false)}
							>
								{t('common.action.cancel')}
							</Button>
							<Button variant="danger" size="sm" icon="delete" disabled={busy} onClick={unpublish}>
								{busy ? t('community.wiki.unpublishing') : t('community.wiki.unpublishWiki')}
							</Button>
						</>
					}
				>
					<div style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
						{t('community.wiki.unpublishBody')}
					</div>
				</Dialog>
			</Panel>
		);
	} else {
		// Signed-in, Beacon, nothing published yet: the publish form.
		settings = (
			<Panel title={t('community.wiki.settingsTitle')}>
				<div style={{ ...eb }}>{t('common.field.title')}</div>
				<Input
					value={title}
					onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
					placeholder={t('community.wiki.titlePlaceholder')}
					aria-label={t('community.wiki.titleField')}
					maxLength={120}
				/>
				<div style={{ ...eb, marginTop: T.space.three }}>{t('community.wiki.access')}</div>
				<div
					role="radiogroup"
					aria-label={t('community.wiki.accessField')}
					onKeyDown={radioGroupKeyDown}
					style={{ display: 'flex', flexDirection: 'column', gap: T.space.two }}
				>
					{WIKI_ACCESS_MODES.map((m) => (
						<button
							key={m.value}
							type="button"
							role="radio"
							aria-checked={access === m.value}
							tabIndex={access === m.value ? 0 : -1}
							onClick={() => setAccess(m.value)}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: T.space.three,
								padding: `${T.space.three} ${T.space.three}`,
								borderRadius: T.radius.md,
								cursor: 'pointer',
								textAlign: 'left',
								border: `1px solid ${access === m.value ? T.accBd : T.bd}`,
								background: access === m.value ? T.accSub : T.surf,
							}}
						>
							<span
								style={{
									width: 16,
									height: 16,
									borderRadius: T.radius.full,
									flex: '0 0 auto',
									border: `2px solid ${access === m.value ? T.acc : T.bdS}`,
									background: access === m.value ? T.acc : 'transparent',
								}}
							/>
							<span style={{ flex: 1 }}>
								<div style={{ font: `600 var(--text-sm) ${T.sans}` }}>{t(m.label)}</div>
								<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>{t(m.note)}</div>
							</span>
						</button>
					))}
				</div>
				{access === 'password' && (
					<Input
						type="password"
						value={password}
						onChange={(e: { target: { value: string } }) => setPassword(e.target.value)}
						placeholder={t('community.wiki.passwordPlaceholder')}
						aria-label={t('community.wiki.passwordField')}
						maxLength={100}
					/>
				)}
				<EligibilityStat eligible={eligible} total={notes.length} />
				<Checkbox
					label={t('community.wiki.includeRecaps')}
					checked={includeRecaps}
					onChange={setIncludeRecaps}
				/>
				<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.ter }}>
					{t('community.wiki.publishNote')}
				</div>
				<Button
					variant="primary"
					size="md"
					icon="upload"
					disabled={busy || pages.length === 0}
					onClick={publish}
				>
					{busy ? t('community.publish.publishing') : t('community.wiki.publishWiki')}
				</Button>
			</Panel>
		);
	}

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: isPhone ? '1fr' : '1fr 1.1fr',
				gap: T.space.five,
				alignItems: 'start',
			}}
		>
			{settings}
			<WikiPreview title={title} eligibleNotes={eligibleNotes} />
		</div>
	);
}

/** The shared eligibility stat row (eligible player-visible notes / total notes). */
export function EligibilityStat({ eligible, total }: { eligible: number; total: number }) {
	const { t } = useI18n();
	return (
		<div
			style={{
				display: 'flex',
				flexWrap: 'wrap',
				alignItems: 'center',
				gap: T.space.four,
				marginTop: T.space.oneHalf,
			}}
		>
			<Stat
				label={t('community.wiki.eligiblePages')}
				value={`${eligible}/${total}`}
				icon="knowledge-book"
			/>
			<Badge icon="theme">
				{t('community.wiki.theme')}: {t('settings.appearance.themeParchment')}
			</Badge>
		</div>
	);
}
