import { useState } from 'react';
import { Badge, Icon } from '../../ds';
import { T } from '../../app/screen-kit';
import { Panel, PvPage, SectionHead, type LiveData } from './shared';

// 5 · HANDOUTS — everything the DM has shared with this player (visible notes). Read-only.
const HANDOUT_ICON: Record<string, string> = {
	note: 'knowledge-book',
	scene: 'atlas-map',
	recap: 'campaign-scroll',
};
export function HandoutsSection({ data }: { data: LiveData }) {
	const shared = data.handouts;
	// undefined means "pick the first available item"; null is an explicit user collapse.
	// Keeping those states distinct lets live data reconcile a removed selection without making
	// the first row impossible to close.
	const [open, setOpen] = useState<string | null | undefined>(undefined);
	const openId =
		open === null ? null : shared.some((item) => item.id === open) ? open : (shared[0]?.id ?? null);
	return (
		<PvPage max={900}>
			<SectionHead
				title="Handouts"
				sub="Notes and props your DM has revealed to you"
				action={<Badge status="neutral">{shared.length} shared</Badge>}
			/>
			{shared.length === 0 ? (
				<Panel>
					<div style={{ font: `13px ${T.sans}`, color: T.ter }}>
						Your DM hasn't shared any handouts with you yet.
					</div>
				</Panel>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					{shared.map((n) => {
						const isOpen = openId === n.id;
						return (
							<div
								key={n.id}
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
									aria-controls={`handout-${n.id}-panel`}
									onClick={() => setOpen(isOpen ? null : n.id)}
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
										<Icon name={HANDOUT_ICON[n.kind] || 'knowledge-book'} size={20} color={T.acc} />
									</div>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
											<span style={{ font: `600 14px ${T.sans}`, color: T.ink }}>{n.title}</span>
											<Badge status="info">{n.kind}</Badge>
										</div>
										<div style={{ font: `12px ${T.sans}`, color: T.ter, marginTop: 2 }}>
											Updated {new Date(n.updatedAt).toLocaleDateString()}
										</div>
									</div>
									<Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={T.ter} />
								</button>
								{isOpen && (
									<div
										id={`handout-${n.id}-panel`}
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
												whiteSpace: 'pre-wrap',
												overflowWrap: 'anywhere',
											}}
										>
											{n.body}
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
