import type { CSSProperties } from 'react';
import type { CoreCommand } from '@dndtools/core';
import { Avatar, Badge, Chip, ConditionBadge, Stat } from '../../ds';
import { T, eb } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { ABIL_ORDER, abilMod, sgn } from '../../app/character/abilities';
import { PlayerResources, type VitalsWrite } from '../player/Vitals';
import type { CommandRequest } from '../../net/messages';
import { sheetCombatCommands, type SheetWrites } from '../../net/viewModels';
import { ABIL_FULL, condKey, Panel, PvPage, SectionHead, type LiveData } from './shared';
import { useI18n } from '../../i18n';

/**
 * 2 · MY CHARACTER — the player's own sheet. RC-CHR-6.1: the same vitals block `/player` renders (HP
 * with undo, temporary HP, conditions, spell slots, class resources, rest), writing through `onWrite`:
 * a command REQUEST the host stamps when joined, a local dispatch as the viewer when previewing. A
 * control is drawn only when `writes` (the core's authority for this viewer, folded with read-only
 * preview by the caller) says the write would be taken.
 */
export function SheetSection({
	data,
	writes,
	actorId,
	onWrite,
}: {
	data: LiveData;
	writes: SheetWrites;
	actorId: string;
	/** Send one command; resolves false when refused (the caller has already said why). */
	onWrite: (command: CommandRequest) => Promise<boolean>;
}) {
	const { t } = useI18n();
	const viewport = useViewport();
	const C = data.pc;
	const pcId = data.pcId;
	if (!C || !pcId) {
		return (
			<PvPage max={1140}>
				<SectionHead title={t('play.sheet.title')} />
				<Panel>
					<div style={{ font: `13px ${T.sans}`, color: T.ter }}>{t('play.sheet.unassigned')}</div>
				</Panel>
			</PvPage>
		);
	}
	// The vitals block takes the `/player` dispatch shape; the actor it names is dropped here, because
	// the host (joined) or the caller (preview) stamps the real one.
	const dispatch = (command: CoreCommand) =>
		onWrite({ type: command.type, payload: command.payload });
	// While the PC fights, the change also lands on its tracker row (see `sheetCombatCommands`).
	const writeVitals = async (write: VitalsWrite) => {
		for (const command of sheetCombatCommands(pcId, data.pcCombatantId ?? null, write)) {
			if (!(await onWrite(command))) return false;
		}
		return true;
	};
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
					<PlayerResources
						charId={pcId}
						resources={data.resources}
						resourceInstances={C.resources ?? []}
						canManageResources={writes.manage}
						canUpdateCombat={writes.combat}
						vitals={{
							hp: C.combat.hp,
							maxHp: C.combat.maxHp,
							tempHp: C.combat.tempHp ?? 0,
							conditions: C.combat.conditions,
						}}
						onVitalsWrite={writeVitals}
						actorId={actorId}
						compact={viewport !== 'desktop'}
						restSubject={{
							id: pcId,
							name: C.name,
							hp: C.combat.hp,
							maxHp: C.combat.maxHp,
							hitDice: C.proficiencies.hitDice,
							conMod: Math.floor(((C.abilityScores.con ?? 10) - 10) / 2),
							exhaustion: data.resources?.exhaustion ?? 0,
						}}
						dispatch={dispatch}
					/>
				</div>
			</PvPage>
		</div>
	);
}
