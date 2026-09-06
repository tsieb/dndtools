import { getHandoutsForActor, getHandoutStatusForDm } from '@dndtools/core';
import { Badge, Button, Field, IconButton, Input, Textarea } from '../../ds';
import { useI18n, type MessageKey } from '../../i18n';
import { Panel, T } from '../../app/screen-kit';

type HandoutView = ReturnType<typeof getHandoutsForActor>[number];
type HandoutStatusView = ReturnType<typeof getHandoutStatusForDm>[number];

// Spoken labels for the handout kinds — the raw kind token never renders to users.
const HANDOUT_KIND_LABEL: Record<string, MessageKey> = {
	handout: 'session.handouts.kind.handout',
	image: 'session.handouts.kind.image',
	note: 'session.handouts.kind.note',
	'map-fragment': 'session.handouts.kind.mapFragment',
	cipher: 'session.handouts.kind.cipher',
	rumor: 'session.handouts.kind.rumor',
};

export function HandoutsPanel({
	handouts,
	status,
	isDm,
	isLive,
	previewing,
	canDeliver,
	title,
	body,
	onTitle,
	onBody,
	onDeliver,
	onRevoke,
	onAcknowledge,
}: {
	handouts: HandoutView[];
	status: HandoutStatusView[];
	isDm: boolean;
	isLive: boolean;
	previewing: boolean;
	canDeliver: boolean;
	title: string;
	body: string;
	onTitle: (v: string) => void;
	onBody: (v: string) => void;
	onDeliver: () => void;
	onRevoke: (id: string) => void;
	onAcknowledge: (id: string) => void;
}) {
	const { t } = useI18n();
	const statusById = new Map(status.map((s) => [s.handoutId, s]));
	return (
		<Panel title={t('session.handouts.title')}>
			{isDm ? (
				<>
					{!isLive && (
						<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
							{t('session.handouts.goLive')}
						</div>
					)}
					<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
						{/* These were the only two unlabelled fields on the screen: a `placeholder` is
						    not a label, and it disappears the moment the DM types (WCAG 3.3.2). axe
						    cannot flag it, because HTML-AAM accepts placeholder as an accname
						    fallback — so the a11y gate stayed green over it. */}
						<Field label={t('session.handouts.titleField')}>
							<Input
								value={title}
								onChange={(e: { target: { value: string } }) => onTitle(e.target.value)}
								placeholder={t('session.handouts.titleField')}
							/>
						</Field>
						<Field label={t('session.handouts.bodyField')}>
							<Textarea
								value={body}
								onChange={(e: { target: { value: string } }) => onBody(e.target.value)}
								placeholder={t('session.handouts.bodyPlaceholder')}
								rows={3}
							/>
						</Field>
						<Button
							variant="primary"
							size="sm"
							icon="send"
							// A successful push CLEARS the title, so this button natively disabled itself
							// the instant the DM used it — under their own focus, which then fell to
							// <body> and restarted the next Tab at the top of the page. Soft-disabled it
							// keeps the tab stop and, for the first time, says why it is unavailable.
							// (DS `Button` only swallows `aria-disabled={true}`, so guard the handler too.)
							aria-disabled={!canDeliver || !title.trim() || undefined}
							title={
								!canDeliver
									? t('session.handouts.blockedNotLive')
									: !title.trim()
										? t('session.handouts.blockedNoTitle')
										: undefined
							}
							onClick={() => {
								if (!canDeliver || !title.trim()) return;
								onDeliver();
							}}
						>
							{t('session.handouts.push')}
						</Button>
					</div>
				</>
			) : (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
					{t('session.handouts.playerIntro')}
				</div>
			)}

			{handouts.length === 0 ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>{t('session.handouts.empty')}</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{handouts.map((h) => {
						const st = statusById.get(h.id);
						const delivered = st ? st.recipients.length : 0;
						const opened = st ? st.recipients.filter((r) => r.acknowledged).length : 0;
						return (
							<div
								key={h.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '8px 10px',
									borderRadius: 9,
									border: `1px solid ${T.bd}`,
									background: T.surf,
								}}
							>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div
										style={{
											font: `600 13px ${T.sans}`,
											color: T.ink,
											whiteSpace: 'nowrap',
											overflow: 'hidden',
											textOverflow: 'ellipsis',
										}}
									>
										{h.title}
									</div>
									<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
										{t('session.handouts.meta', {
											kind: t(HANDOUT_KIND_LABEL[h.handoutKind] ?? 'session.handouts.kind.handout'),
											sections: h.sections.length,
										})}
										{isDm ? ` · ${t('session.handouts.opened', { opened, delivered })}` : ''}
									</div>
								</div>
								{isDm ? (
									<IconButton
										icon="close"
										label={t('session.handouts.revoke', { title: h.title })}
										variant="ghost"
										size="sm"
										disabled={previewing}
										onClick={() => onRevoke(h.id)}
									/>
								) : h.acknowledged ? (
									<Badge status="success">{t('session.handouts.read')}</Badge>
								) : (
									<Button
										variant="secondary"
										size="sm"
										aria-label={t('session.handouts.markReadFor', { title: h.title })}
										disabled={previewing}
										onClick={() => onAcknowledge(h.id)}
									>
										{t('session.handouts.markRead')}
									</Button>
								)}
							</div>
						);
					})}
				</div>
			)}
		</Panel>
	);
}
