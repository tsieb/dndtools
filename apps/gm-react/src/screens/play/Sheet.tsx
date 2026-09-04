import type { CSSProperties } from 'react';
import { availableSlots } from '@dndtools/core';
import { Avatar, Badge, Chip, ConditionBadge, Stat } from '../../ds';
import { T, eb } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { ABIL_ORDER, abilMod, sgn } from '../../app/character/abilities';
import { ABIL_FULL, condKey, Panel, PvPage, SectionHead, type LiveData } from './shared';

// 2 · MY CHARACTER — the player's own sheet, read-only on the live device.
export function SheetSection({ data }: { data: LiveData }) {
	const viewport = useViewport();
	const C = data.pc;
	if (!C) {
		return (
			<PvPage max={1140}>
				<SectionHead title="My character" />
				<Panel>
					<div style={{ font: `13px ${T.sans}`, color: T.ter }}>
						No character has been assigned to you yet.
					</div>
				</Panel>
			</PvPage>
		);
	}
	const r = data.resources;
	const slots = r ? Object.values(r.spellSlots).sort((a, b) => a.level - b.level) : [];
	// Real sheet identity: the `data.class` field the draft flow writes + the CHAR-009 level.
	const cls = typeof C.data?.class === 'string' && C.data.class.trim() !== '' ? C.data.class : null;
	const clsLabel = cls ? cls.charAt(0).toUpperCase() + cls.slice(1) : 'Adventurer';
	const cardBox: CSSProperties = {
		textAlign: 'center',
		padding: '10px 6px',
		borderRadius: 11,
		border: `1px solid ${T.bd}`,
		background: T.surf,
	};
	return (
		<div>
			<div
				style={{
					position: 'sticky',
					top: 'var(--native-titlebar-height)',
					zIndex: 5,
					display: 'flex',
					alignItems: 'center',
					gap: 16,
					padding: viewport === 'phone' ? '12px 14px' : '12px 28px',
					background: 'color-mix(in srgb, var(--color-surface) 94%, transparent)',
					backdropFilter: 'blur(6px)',
					borderBottom: `1px solid ${T.bd}`,
					flexWrap: 'wrap',
				}}
			>
				<Avatar name={C.name} size="md" ring="active" />
				<div style={{ minWidth: 0 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
						{/* Every other section renders SectionHead's <h1>; the sheet jumped straight to this
						    strip, so the ONE section a player lives in had no heading at all. */}
						<h1 style={{ margin: 0, font: `700 16px ${T.disp}`, color: T.ink }}>{C.name}</h1>
						<Badge status="success">PC</Badge>
					</div>
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
						{clsLabel}
						{data.level != null ? ` · Level ${data.level}` : ''}
					</div>
				</div>
				<div
					style={{
						textAlign: 'center',
						minWidth: 70,
						padding: '6px 12px',
						borderRadius: 11,
						background: T.alt,
						border: `1px solid ${T.bd}`,
					}}
				>
					<div
						style={{
							font: `700 18px ${T.mono}`,
							color: C.combat.maxHp > 0 && C.combat.hp / C.combat.maxHp < 0.3 ? T.err : T.ink,
							lineHeight: 1,
						}}
					>
						{C.combat.hp}
						<span style={{ font: `13px ${T.mono}`, color: T.ter }}> / {C.combat.maxHp}</span>
					</div>
					<div style={{ ...eb, color: T.ter }}>Hit points</div>
				</div>
				<Stat label="AC" value={String(C.combat.ac)} icon="shield" />
				<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
					{C.combat.conditions.map((c) => {
						const k = condKey(c);
						return k ? (
							<ConditionBadge key={c} condition={k} compact />
						) : (
							<Chip key={c} tone="accent">
								{c}
							</Chip>
						);
					})}
				</div>
			</div>
			<PvPage max={1140}>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: viewport === 'phone' ? 'minmax(0,1fr)' : 'auto minmax(0,1fr)',
						gap: 18,
						alignItems: 'start',
					}}
				>
					<div
						style={{
							display: viewport === 'phone' ? 'grid' : 'flex',
							gridTemplateColumns: viewport === 'phone' ? 'repeat(3,1fr)' : undefined,
							flexDirection: 'column',
							gap: 10,
							width: viewport === 'phone' ? 'auto' : 116,
						}}
					>
						{ABIL_ORDER.map((key) => {
							const score = (C.abilityScores as Record<string, number | undefined>)[key];
							return (
								<div key={key} style={cardBox}>
									<div style={{ ...eb, color: T.ter }}>{ABIL_FULL[key]}</div>
									<div style={{ font: `700 24px ${T.mono}`, lineHeight: 1, color: T.ink }}>
										{sgn(abilMod(score))}
									</div>
									<div style={{ font: `11px ${T.mono}`, color: T.ter, marginTop: 2 }}>
										{score ?? '—'}
									</div>
								</div>
							);
						})}
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
						<Panel title="Spell slots">
							{slots.length === 0 ? (
								<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
									No spell slots tracked.
								</div>
							) : (
								<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
									{slots.map((s) => {
										const avail = availableSlots(s);
										return (
											<div key={s.level} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
												<span style={{ font: `600 12px ${T.sans}`, color: T.sub, width: 48 }}>
													Level {s.level}
												</span>
												<div style={{ display: 'flex', gap: 7, flex: 1 }}>
													{Array.from({ length: s.max }).map((_, i) => (
														<span
															key={i}
															style={{
																width: 18,
																height: 18,
																transform: 'rotate(45deg)',
																borderRadius: 3,
																background: i < avail ? T.acc : 'transparent',
																border: `1.5px solid ${i < avail ? T.acc : T.bdS}`,
															}}
														/>
													))}
												</div>
												<span style={{ font: `12px ${T.mono}`, color: T.ter }}>
													{avail}/{s.max}
												</span>
											</div>
										);
									})}
								</div>
							)}
						</Panel>
						<Panel title="Conditions & status">
							<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
								This is your live sheet as the table sees it. Edits are made in your full character
								app.
							</div>
						</Panel>
					</div>
				</div>
			</PvPage>
		</div>
	);
}
