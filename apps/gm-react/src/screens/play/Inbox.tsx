import { useState } from 'react';
import { Badge, Icon } from '../../ds';
import { T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { Panel, PvPage, SectionHead, type LiveData } from './shared';
import { renderMarkdown } from '../../app/markdown/render';

// 7 · INBOX (RC-CLD-3.3) — the between-session async catch-up: the wiki recap feed of every session
// the DM has written a recap for, newest first. Read-only, actor-filtered by `getSessionRecapFeedForActor`
// (`data.recapFeed`), so a hidden/unauthored archive never appears here — there is nothing to "catch up
// on" until the DM authors a recap.

function formatArchivedAt(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

export function InboxSection({ data }: { data: LiveData }) {
	const { t } = useI18n();
	const feed = data.recapFeed;
	// undefined = open the most recent entry by default; null = the player explicitly collapsed it.
	const [open, setOpen] = useState<string | null | undefined>(undefined);
	const openId =
		open === null
			? null
			: feed.some((e) => e.archiveId === open)
				? open
				: (feed[0]?.archiveId ?? null);

	return (
		<PvPage max={900}>
			<SectionHead
				title={t('play.inbox.title')}
				sub={t('play.inbox.sub')}
				action={<Badge status="neutral">{t('play.inbox.count', { count: feed.length })}</Badge>}
			/>
			{feed.length === 0 ? (
				<Panel>
					<div style={{ font: `13px ${T.sans}`, color: T.ter }}>{t('play.inbox.empty')}</div>
				</Panel>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					{feed.map((entry) => {
						const isOpen = openId === entry.archiveId;
						const title = entry.title ?? t('play.inbox.untitledSession');
						return (
							<div
								key={entry.archiveId}
								data-testid="inbox-recap"
								style={{
									border: `1px solid ${isOpen ? T.accBd : T.bd}`,
									borderRadius: 10,
									background: T.surf,
									boxShadow: isOpen ? T.ssm : 'none',
									overflow: 'hidden',
								}}
							>
								<button
									type="button"
									aria-expanded={isOpen}
									aria-controls={`inbox-recap-${entry.archiveId}-panel`}
									onClick={() => setOpen(isOpen ? null : entry.archiveId)}
									style={{
										width: '100%',
										display: 'flex',
										alignItems: 'center',
										gap: 12,
										padding: '13px 16px',
										cursor: 'pointer',
										border: 'none',
										background: 'transparent',
										textAlign: 'left',
									}}
								>
									<div
										style={{
											width: 40,
											height: 40,
											flex: '0 0 auto',
											borderRadius: 9,
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											background: T.alt,
											border: `1px solid ${T.bd}`,
										}}
									>
										<Icon name="campaign-scroll" size={20} color={T.acc} />
									</div>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div
											style={{
												font: `600 13.5px ${T.sans}`,
												color: T.ink,
												overflow: 'hidden',
												textOverflow: 'ellipsis',
												whiteSpace: 'nowrap',
											}}
										>
											{title}
										</div>
										<div style={{ font: `12px ${T.sans}`, color: T.ter, marginTop: 2 }}>
											{t('play.inbox.archivedOn', { date: formatArchivedAt(entry.archivedAt) })}
										</div>
									</div>
									<Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={T.ter} />
								</button>
								{isOpen && (
									<div
										id={`inbox-recap-${entry.archiveId}-panel`}
										style={{ padding: '4px 16px 18px clamp(16px, 8vw, 68px)' }}
									>
										<div
											style={{
												minWidth: 0,
												padding: '12px 16px',
												borderRadius: 9,
												background: T.alt,
												borderLeft: `3px solid ${T.acc}`,
												font: `13.5px/1.6 ${T.sans}`,
												color: T.sub,
												overflowWrap: 'anywhere',
											}}
										>
											{/* Same markdown pipeline the DM authored the recap in (RC-SES-009), so a
											    shared table or callout reads correctly here too. No inline-roll logger:
											    a recap is a look BACK at what already happened, not a live handout. */}
											{renderMarkdown(entry.markdown, { t })}
										</div>
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</PvPage>
	);
}
