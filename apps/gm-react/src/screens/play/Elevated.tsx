import { useState } from 'react';
import { Avatar, Badge, Chip, HPBar, Icon, VisibilityChip } from '../../ds';
import { T } from '../../app/screen-kit';
import { ABIL_ORDER } from '../../app/character/abilities';
import { kindLabel, Panel, PvPage, SectionHead, type LiveData } from './shared';

// ELEVATED · ATLAS — every scene the Co-DM may see, INCLUDING dm-only scenes a player never gets.
export function AtlasSection({ data }: { data: LiveData }) {
	const scenes = data.elevated?.scenes ?? [];
	return (
		<PvPage max={1140}>
			<SectionHead
				title="Maps & scenes"
				sub="The full atlas — including scenes your DM keeps hidden from the table"
				action={
					<Badge status="accent" icon="atlas-map">
						{scenes.length} scenes
					</Badge>
				}
			/>
			{scenes.length === 0 ? (
				<Panel>
					<div style={{ font: `13px ${T.sans}`, color: T.ter }}>
						No scenes have been authored in this campaign yet.
					</div>
				</Panel>
			) : (
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
						gap: 12,
					}}
				>
					{scenes.map((s) => (
						<div
							key={s.id}
							style={{
								padding: 14,
								borderRadius: 11,
								border: `1px solid ${s.visibility === 'dm-only' ? T.accBd : T.bd}`,
								background: s.visibility === 'dm-only' ? T.accSub : T.surf,
							}}
						>
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									gap: 8,
								}}
							>
								<span
									style={{
										font: `600 14px ${T.sans}`,
										color: T.ink,
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap',
									}}
								>
									{s.name}
								</span>
								<VisibilityChip level={s.visibility} compact />
							</div>
							<div style={{ font: `11.5px ${T.sans}`, color: T.ter, marginTop: 6 }}>
								Updated {new Date(s.updatedAt).toLocaleDateString()}
							</div>
							{s.tags.length > 0 && (
								<div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
									{s.tags.slice(0, 4).map((t) => (
										<Chip key={t} tone="neutral">
											{t}
										</Chip>
									))}
								</div>
							)}
						</div>
					))}
				</div>
			)}
		</PvPage>
	);
}

// ELEVATED · BESTIARY — the DM's creature/NPC roster (non-PC characters) the Co-DM may see.
export function BestiarySection({ data }: { data: LiveData }) {
	const creatures = data.elevated?.bestiary ?? [];
	const [open, setOpen] = useState<string | null | undefined>(undefined);
	const openId =
		open === null
			? null
			: creatures.some((creature) => creature.id === open)
				? open
				: (creatures[0]?.id ?? null);
	return (
		<PvPage max={900}>
			<SectionHead
				title="Bestiary"
				sub="NPCs and monsters your DM has authored — hidden from players"
				action={
					<Badge status="accent" icon="campaign-scroll">
						{creatures.length}
					</Badge>
				}
			/>
			{creatures.length === 0 ? (
				<Panel>
					<div style={{ font: `13px ${T.sans}`, color: T.ter }}>
						No NPCs or monsters have been authored yet.
					</div>
				</Panel>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					{creatures.map((c) => {
						const isOpen = openId === c.id;
						const res = c.combat;
						return (
							<div
								key={c.id}
								style={{
									border: `1px solid ${isOpen ? T.accBd : T.bd}`,
									borderRadius: 10,
									background: T.surf,
									overflow: 'hidden',
								}}
							>
								<button
									type="button"
									aria-expanded={isOpen}
									aria-controls={`bestiary-${c.id}-panel`}
									onClick={() => setOpen(isOpen ? null : c.id)}
									style={{
										width: '100%',
										display: 'flex',
										alignItems: 'center',
										gap: 12,
										padding: '12px 15px',
										cursor: 'pointer',
										border: 'none',
										background: 'transparent',
										textAlign: 'left',
									}}
								>
									<Avatar name={c.name} size="sm" />
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
											<span style={{ font: `600 13.5px ${T.sans}`, color: T.ink }}>{c.name}</span>
											<Badge status="neutral">{kindLabel(c.kind)}</Badge>
										</div>
										{res && (
											<div style={{ font: `11.5px ${T.sans}`, color: T.ter, marginTop: 2 }}>
												HP {res.hp}/{res.maxHp} · AC {res.ac}
											</div>
										)}
									</div>
									<Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={T.ter} />
								</button>
								{isOpen && (
									<div
										id={`bestiary-${c.id}-panel`}
										style={{
											padding: '0 15px 15px 15px',
											display: 'flex',
											flexWrap: 'wrap',
											gap: 14,
										}}
									>
										{ABIL_ORDER.map((a) => (
											<div key={a} style={{ textAlign: 'center' }}>
												<div
													style={{
														font: `10px ${T.sans}`,
														color: T.ter,
														textTransform: 'uppercase',
														letterSpacing: '.06em',
													}}
												>
													{a}
												</div>
												<div style={{ font: `600 14px ${T.mono}`, color: T.ink }}>
													{c.abilityScores?.[a] ?? '—'}
												</div>
											</div>
										))}
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

// ELEVATED · COMBAT ASSIST — the FULL combat tracker: hidden combatants + real HP a player never sees.
export function AssistSection({ data }: { data: LiveData }) {
	const combat = data.elevated?.combat ?? null;
	const running = combat?.status === 'running';
	const combatants = combat?.combatants ?? [];
	return (
		<PvPage max={1000}>
			<SectionHead
				title="Combat assist"
				sub="The live initiative order — including hidden combatants and full stat blocks"
				action={
					<Badge status={running ? 'success' : 'neutral'} icon="session-bolt">
						{running ? `Round ${combat?.round}` : 'No combat'}
					</Badge>
				}
			/>
			{!running || combatants.length === 0 ? (
				<Panel>
					<div style={{ font: `13px ${T.sans}`, color: T.ter }}>
						No combat is running. When the DM starts an encounter the full order appears here.
					</div>
				</Panel>
			) : (
				<Panel title="Initiative order">
					<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
						{combatants.map((c) => (
							<div
								key={c.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									flexWrap: 'wrap',
									gap: 12,
									padding: 11,
									borderRadius: 10,
									border: `1px solid ${c.isActive ? T.accBd : T.bd}`,
									background: c.isActive ? T.accSub : c.hidden ? T.alt : T.surf,
								}}
							>
								<div
									style={{
										width: 34,
										textAlign: 'center',
										font: `600 15px ${T.mono}`,
										color: c.isActive ? T.acc : T.sub,
									}}
								>
									{c.statBlock.initiative ?? '—'}
								</div>
								<div style={{ flex: '1 1 180px', minWidth: 0 }}>
									<div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
										<span
											style={{
												minWidth: 0,
												font: `600 13.5px ${T.sans}`,
												color: T.ink,
												overflowWrap: 'anywhere',
											}}
										>
											{c.name}
										</span>
										{c.hidden && <Badge status="accent">Hidden</Badge>}
										{c.isActive && <Badge status="success">Active</Badge>}
										<Badge status="neutral">{kindLabel(c.kind)}</Badge>
									</div>
								</div>
								{c.resources ? (
									<div style={{ flex: '1 1 150px', minWidth: 0 }}>
										<HPBar current={c.resources.hp} max={c.resources.maxHp} size="sm" />
									</div>
								) : (
									<span style={{ font: `11px ${T.sans}`, color: T.ter }}>—</span>
								)}
							</div>
						))}
					</div>
				</Panel>
			)}
		</PvPage>
	);
}
