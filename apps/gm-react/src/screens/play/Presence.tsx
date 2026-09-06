import { Avatar, Badge, Chip, ConditionBadge, HPBar } from '../../ds';
import { T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { condKey, Panel, PvPage, SectionHead, type LiveData } from './shared';

// 4 · PARTY — the visible party (PCs), from the actor-filtered overview.
export function PartySection({ data }: { data: LiveData }) {
	const { t } = useI18n();
	const members = data.party.members.filter((m) => m.kind === 'pc');
	return (
		<PvPage max={1140}>
			<SectionHead
				title={t('play.party.title')}
				sub={t('play.party.sub')}
				action={
					<Badge status="neutral">{t('play.party.members', { count: members.length })}</Badge>
				}
			/>
			<Panel title={t('play.party.roster')}>
				{members.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>{t('play.party.empty')}</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
						{members.map((p) => {
							const downed = p.hp === 0;
							const self = p.characterId === data.pcId;
							return (
								<div
									key={p.characterId}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 13,
										padding: 12,
										borderRadius: 11,
										border: `1px solid ${downed ? 'var(--color-status-error-border)' : self ? T.accBd : T.bd}`,
										background: downed
											? 'var(--color-status-error-subtle)'
											: self
												? T.accSub
												: T.surf,
									}}
								>
									<Avatar
										name={p.name}
										size="sm"
										ring={downed ? 'danger' : self ? 'active' : 'none'}
									/>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
											<span style={{ font: `600 13.5px ${T.sans}`, color: T.ink }}>{p.name}</span>
											{self && <Badge status="accent">{t('play.party.you')}</Badge>}
											<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
												{t('play.party.armorClass', { value: p.ac })}
											</span>
										</div>
										<div style={{ marginTop: 5, maxWidth: 240 }}>
											<HPBar current={p.hp} max={p.maxHp} size="sm" />
										</div>
									</div>
									<div
										style={{
											display: 'flex',
											flexDirection: 'column',
											gap: 5,
											alignItems: 'flex-end',
										}}
									>
										{p.conditions.length ? (
											p.conditions.map((c) => {
												const k = condKey(c);
												return k ? (
													<ConditionBadge key={c} condition={k} compact />
												) : (
													<Chip key={c} tone="neutral">
														{c}
													</Chip>
												);
											})
										) : (
											<span style={{ font: `11px ${T.sans}`, color: T.ter }}>—</span>
										)}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</Panel>
		</PvPage>
	);
}
