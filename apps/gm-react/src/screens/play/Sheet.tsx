import type { CSSProperties } from 'react';
import { availableSlots } from '@dndtools/core';
import { Avatar, Badge, Chip, ConditionBadge, Stat } from '../../ds';
import { T, eb } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { ABIL_ORDER, abilMod, sgn } from '../../app/character/abilities';
import { ABIL_FULL, condKey, Panel, PvPage, SectionHead, type LiveData } from './shared';
import { useI18n } from '../../i18n';

// 2 · MY CHARACTER — the player's own sheet, read-only on the live device.
export function SheetSection({ data }: { data: LiveData }) {
	const { t } = useI18n();
	const viewport = useViewport();
	const C = data.pc;
	if (!C) {
		return (
			<PvPage max={1140}>
				<SectionHead title={t('play.sheet.title')} />
				<Panel>
					<div style={{ font: `13px ${T.sans}`, color: T.ter }}>{t('play.sheet.unassigned')}</div>
				</Panel>
			</PvPage>
		);
	}
	const r = data.resources;
	const slots = r ? Object.values(r.spellSlots).sort((a, b) => a.level - b.level) : [];
	// Real sheet identity: the `data.class` field the draft flow writes + the CHAR-009 level.
	const cls = typeof C.data?.class === 'string' && C.data.class.trim() !== '' ? C.data.class : null;
	const clsLabel = cls ? cls.charAt(0).toUpperCase() + cls.slice(1) : t('play.sheet.adventurer');
	const cardBox: CSSProperties = {
		textAlign: 'center',
		padding: `${T.space.two} ${T.space.oneHalf}`,
		borderRadius: T.radius.lg,
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
					gap: T.space.four,
					padding:
						viewport === 'phone'
							? `${T.space.three} ${T.space.four}`
							: `${T.space.three} ${T.space.eight}`,
					background: 'color-mix(in srgb, var(--color-surface) 94%, transparent)',
					backdropFilter: 'blur(6px)',
					borderBottom: `1px solid ${T.bd}`,
					flexWrap: 'wrap',
				}}
			>
				<Avatar name={C.name} size="md" ring="active" />
				<div style={{ minWidth: 0 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: T.space.two }}>
						{/* Every other section renders SectionHead's <h1>; the sheet jumped straight to this
						    strip, so the ONE section a player lives in had no heading at all. */}
						<h1 style={{ margin: T.space.zero, font: `700 16px ${T.sans}`, color: T.ink }}>
							{C.name}
						</h1>
						<Badge status="success">{t('play.sheet.pc')}</Badge>
					</div>
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
						{clsLabel}
						{data.level != null ? t('play.sheet.characterLevel', { level: data.level }) : ''}
					</div>
				</div>
				<div
					style={{
						textAlign: 'center',
						minWidth: 70,
						padding: `${T.space.oneHalf} ${T.space.three}`,
						borderRadius: T.radius.lg,
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
					<div style={{ ...eb, color: T.ter }}>{t('play.sheet.hitPoints')}</div>
				</div>
				<Stat label={t('play.sheet.armorClass')} value={String(C.combat.ac)} icon="shield" />
				<div style={{ display: 'flex', gap: T.space.oneHalf, flexWrap: 'wrap' }}>
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
						gap: T.space.four,
						alignItems: 'start',
					}}
				>
					<div
						style={{
							display: viewport === 'phone' ? 'grid' : 'flex',
							gridTemplateColumns: viewport === 'phone' ? 'repeat(3,1fr)' : undefined,
							flexDirection: 'column',
							gap: T.space.two,
							width: viewport === 'phone' ? 'auto' : 116,
						}}
					>
						{ABIL_ORDER.map((key) => {
							const score = (C.abilityScores as Record<string, number | undefined>)[key];
							return (
								<div key={key} style={cardBox}>
									<div style={{ ...eb, color: T.ter }}>{t(ABIL_FULL[key])}</div>
									<div style={{ font: `700 24px ${T.mono}`, lineHeight: 1, color: T.ink }}>
										{sgn(abilMod(score))}
									</div>
									<div style={{ font: `11px ${T.mono}`, color: T.ter, marginTop: T.space.half }}>
										{score ?? '—'}
									</div>
								</div>
							);
						})}
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.four }}>
						<Panel title={t('play.sheet.spellSlots')}>
							{slots.length === 0 ? (
								<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
									{t('play.sheet.noSpellSlots')}
								</div>
							) : (
								<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.three }}>
									{slots.map((s) => {
										const avail = availableSlots(s);
										return (
											<div
												key={s.level}
												style={{ display: 'flex', alignItems: 'center', gap: T.space.three }}
											>
												<span style={{ font: `600 12px ${T.sans}`, color: T.sub, width: 48 }}>
													{t('play.sheet.slotLevel', { level: s.level })}
												</span>
												<div style={{ display: 'flex', gap: T.space.oneHalf, flex: 1 }}>
													{Array.from({ length: s.max }).map((_, i) => (
														<span
															key={i}
															style={{
																width: 18,
																height: 18,
																transform: 'rotate(45deg)',
																borderRadius: T.radius.sm,
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
						<Panel title={t('play.sheet.conditions')}>
							<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
								{t('play.sheet.conditionsHelp')}
							</div>
						</Panel>
					</div>
				</div>
			</PvPage>
		</div>
	);
}
