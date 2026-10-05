import { useState } from 'react';
import { availableSlots } from '@dndtools/core';
import { Badge, Button, EmptyState, Icon, SpellSlots } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { CharacterResourcesPanel } from '../../app/character/Resources';
import { RestDialog, type RestSubject } from '../../app/character/RestDialog';
import { useI18n } from '../../i18n';
import type { SheetCapabilities } from '../characters/sheet/capabilities';
import type { SheetIO, SheetSubject } from '../characters/sheet/subject';

/**
 * RC-CHR-6.2 — the sheet body's Resources section: the in-play economy (concentration, spell slots,
 * class resources), rests and prepared spells. Each panel draws a control only when the capability its
 * command needs is held: CHAR-007 (`caps.combat`) spends a slot or drops concentration, CHAR-008
 * (`caps.manage`, owner or DM) recovers slots, toggles prepared spells, manages resources and rests.
 * The hit points and conditions moved to the Combat panel (`characters/sheet/VitalsBlock`).
 */

interface SectionProps {
	subject: SheetSubject;
	caps: SheetCapabilities;
	actorId: string;
	io: SheetIO;
}

/** RC-CHR-1.2 — what the rest dialog needs about the character (hit dice, hit points, exhaustion). */
export function restSubjectOf(subject: SheetSubject): RestSubject {
	const { view } = subject;
	return {
		id: subject.id,
		name: view.name,
		hp: view.combat.hp,
		maxHp: view.combat.maxHp,
		hitDice: view.proficiencies.hitDice,
		conMod: Math.floor(((view.abilityScores.con ?? 10) - 10) / 2),
		exhaustion: subject.resources?.exhaustion ?? 0,
	};
}

export function ResourcesPanel({
	subject,
	caps,
	actorId,
	io,
	compact,
}: SectionProps & { compact: boolean }) {
	const { t } = useI18n();
	const charId = subject.id;
	const dispatch = io.dispatch;
	const canManageResources = caps.manage;
	const canUpdateCombat = caps.combat;
	const r = subject.resources;
	const slots = r ? Object.values(r.spellSlots).sort((a, b) => a.level - b.level) : [];
	const con = r?.concentration?.effect ? r.concentration : null;
	// RC-CHR-6.1 — a combat participant who is not the owner may SPEND a slot (CHAR-007) but not
	// recover one (CHAR-008 management), so they get a spend button per level instead of pips.
	const spendSlot = (level: number) =>
		dispatch({
			type: 'character.update-combat-resource',
			actorId,
			payload: { characterId: charId, kind: 'spell-slot', level },
		});
	// Real spell-slot toggle: set the level's `expended` directly (manage path, not session-gated).
	const toggleSlot = (level: number, max: number, expended: number, idx: number) => {
		const avail = max - expended;
		const isFilled = idx < avail; // clicking a filled diamond expends it; an empty one recovers it
		const nextExpended = isFilled ? expended + 1 : Math.max(0, expended - 1);
		return dispatch({
			type: 'character.set-spell-slots',
			actorId,
			payload: { characterId: charId, level, max, expended: nextExpended },
		});
	};
	const dropConcentration = () =>
		dispatch({
			type: 'character.update-combat-resource',
			actorId,
			payload: { characterId: charId, kind: 'concentration', effect: null },
		});
	// RC-CHR-1.3 — damage taken while concentrating raises a check. The core states the DC; the
	// player rolls it at the table and reports which way it went. Nothing here rolls or decides.
	const concentrationCheck = con?.check ?? null;
	const resolveCheck = (outcome: 'kept' | 'lost') =>
		dispatch({
			type: 'character.update-combat-resource',
			actorId,
			payload: { characterId: charId, kind: 'concentration-check', outcome },
		});
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
			{con && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-3)',
						padding: 'var(--space-3) var(--space-4)',
						borderRadius: 'var(--radius-lg)',
						background: T.accSub,
						border: `1px solid ${T.accBd}`,
					}}
				>
					<Icon name="concentration" size="lg" color={T.acc} />
					<div style={{ flex: 1 }}>
						<div style={{ font: `700 var(--text-sm) ${T.sans}` }}>
							{t('player.vitals.concentrating', { effect: con.effect ?? '' })}
						</div>
						<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
							{t('player.vitals.maintainedEffect')}
						</div>
					</div>
					{canUpdateCombat && (
						<Button variant="ghost" size="sm" onClick={dropConcentration}>
							{t('player.vitals.drop')}
						</Button>
					)}
				</div>
			)}
			{concentrationCheck && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						flexWrap: 'wrap',
						gap: 'var(--space-3)',
						padding: 'var(--space-3) var(--space-4)',
						borderRadius: 'var(--radius-lg)',
						background: T.accSub,
						border: `1px solid ${T.accBd}`,
					}}
				>
					<div style={{ flex: 1, minWidth: 160 }}>
						<div style={{ font: `700 var(--text-sm) ${T.sans}` }}>
							{t('player.vitals.concCheck', { dc: concentrationCheck.dc })}
						</div>
						<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
							{t('player.vitals.concCheckHelp', { damage: concentrationCheck.damage })}
						</div>
					</div>
					{canUpdateCombat && (
						<>
							<Button variant="secondary" size="sm" onClick={() => void resolveCheck('kept')}>
								{t('player.vitals.concKept')}
							</Button>
							<Button variant="ghost" size="sm" onClick={() => void resolveCheck('lost')}>
								{t('player.vitals.concLost')}
							</Button>
						</>
					)}
				</div>
			)}
			<Panel title={t('player.vitals.spellSlots')}>
				{slots.length === 0 ? (
					<EmptyState
						inset
						illustration="spells-empty"
						title={t('player.vitals.noSlotsTitle')}
						description={t('player.vitals.noSlotsBody')}
					/>
				) : (
					<>
						{/* The DS SpellSlots economy (same component as the roster sheet) — a pip click
							    spends/recovers through the same character.set-spell-slots write as before.
							    RC-CHR-6.1: only the owner (or DM) may recover, so anyone else reads pips. */}
						<SpellSlots
							readOnly={!canManageResources}
							levels={slots.map((s) => ({
								level: s.level,
								total: s.max,
								used: s.max - availableSlots(s),
							}))}
							onToggle={(level: number, idx: number) => {
								const s = slots.find((x) => x.level === level);
								if (s) void toggleSlot(s.level, s.max, s.expended, idx);
							}}
						/>
						{!canManageResources && canUpdateCombat && (
							<div
								style={{
									display: 'flex',
									flexWrap: 'wrap',
									gap: 'var(--space-1-5)',
									marginTop: 'var(--space-3)',
								}}
							>
								{slots
									.filter((s) => availableSlots(s) > 0)
									.map((s) => (
										<Button
											key={s.level}
											variant="secondary"
											size="sm"
											onClick={() => void spendSlot(s.level)}
										>
											{t('player.vitals.spendSlot', { level: s.level })}
										</Button>
									))}
							</div>
						)}
					</>
				)}
			</Panel>
			{/* RC-CHR-1.1 — the class-resource economy moved to `app/character/Resources.tsx`, driven
				    by the ACTIVE system package rather than by whatever was copied onto the sheet: a monk's
				    ki and a Generic stress clock are the same rows here, and a level-up moves the maxima. */}
			<CharacterResourcesPanel
				characterId={charId}
				actorId={actorId}
				resources={subject.view.resources ?? []}
				canManage={canManageResources}
				compact={compact}
				dispatch={io.dispatch}
			/>
		</div>
	);
}

/** Rests (`character.rest`, owner or DM): drawn only where the plan admits `rest`. */
export function RestPanel({ subject, actorId, io }: Omit<SectionProps, 'caps'>) {
	const { t } = useI18n();
	// RC-CHR-1.2 — the rest asks how many hit dice to spend and states what the answer will do first.
	const [restKind, setRestKind] = useState<'short' | 'long' | null>(null);
	const restSubject = restSubjectOf(subject);
	return (
		<>
			<Panel
				title={t('player.vitals.rest')}
				action={
					<div style={{ display: 'flex', gap: 'var(--space-1-5)' }}>
						<Button
							variant="secondary"
							size="sm"
							icon="recent"
							onClick={() => setRestKind('short')}
						>
							{t('player.vitals.shortRest')}
						</Button>
						<Button variant="secondary" size="sm" icon="theme" onClick={() => setRestKind('long')}>
							{t('player.vitals.longRest')}
						</Button>
					</div>
				}
			>
				<div style={{ font: `var(--text-sm)/1.55 ${T.sans}`, color: T.sub }}>
					{t('player.vitals.restHelp')}
				</div>
			</Panel>

			<RestDialog
				open={restKind !== null}
				subject={restSubject}
				defaultRest={restKind ?? 'short'}
				onClose={() => setRestKind(null)}
				onConfirm={(choice) => {
					setRestKind(null);
					void io.dispatch({
						type: 'character.rest',
						actorId,
						payload: { characterId: subject.id, ...choice },
					});
				}}
			/>
		</>
	);
}

/** Prepared spells; the prepared toggle (`character.set-spell`) is owner-or-DM, a read for anyone else. */
export function PreparedSpellsPanel({ subject, caps, actorId, io }: SectionProps) {
	const { t } = useI18n();
	const spells = subject.resources?.spells ?? [];
	const canManageResources = caps.manage;
	// Real prepared toggle: `character.set-spell` upserts the spell with the flipped flag (CHAR-008).
	const togglePrepared = (s: { id: string; name: string; level: number; prepared: boolean }) =>
		io.dispatch({
			type: 'character.set-spell',
			actorId,
			payload: {
				characterId: subject.id,
				id: s.id,
				name: s.name,
				level: s.level,
				prepared: !s.prepared,
			},
		});
	return (
		<Panel
			title={t('player.vitals.preparedSpells', {
				count: spells.filter((s) => s.prepared).length,
			})}
		>
			{spells.length === 0 ? (
				<EmptyState
					inset
					illustration="spells-empty"
					title={t('player.vitals.noSpellsTitle')}
					description={t('player.vitals.noSpellsBody')}
				/>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
					{spells.map((s) => (
						<div
							key={s.id}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--space-2)',
								padding: 'var(--space-2) var(--space-2)',
								borderRadius: 'var(--radius-md)',
								border: `1px solid ${T.bd}`,
								background: T.surf,
							}}
						>
							<span
								style={{
									width: 24,
									height: 24,
									borderRadius: 'var(--radius-md)',
									flex: '0 0 auto',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									font: `700 var(--text-xs) ${T.mono}`,
									background: T.alt,
									color: T.acc,
								}}
							>
								{s.level}
							</span>
							<div style={{ flex: 1, minWidth: 0 }}>
								<span style={{ display: 'block', font: `600 var(--text-sm) ${T.sans}` }}>
									{s.name}
								</span>
								{/* extended PreparedSpell detail fields — shown only when the record carries them */}
								{(s.school || s.castingTime || s.range || s.components || s.duration) && (
									<span
										style={{
											display: 'block',
											font: `var(--text-xs) ${T.sans}`,
											color: T.ter,
											marginTop: 'var(--space-0-5)',
										}}
									>
										{[s.school, s.castingTime, s.range, s.components, s.duration]
											.filter(Boolean)
											.join(' · ')}
									</span>
								)}
							</div>
							{/* real prepared toggle → character.set-spell; owner-only, so a read for anyone else */}
							{canManageResources ? (
								<button
									type="button"
									aria-pressed={s.prepared}
									onClick={() => togglePrepared(s)}
									style={{
										display: 'inline-flex',
										alignItems: 'center',
										gap: 'var(--space-1)',
										padding: 'var(--space-0-5) var(--space-2)',
										borderRadius: 'var(--radius-lg)',
										cursor: 'pointer',
										font: `var(--text-xs) ${T.sans}`,
										border: `1px solid ${s.prepared ? T.accBd : T.bd}`,
										background: s.prepared ? T.accSub : T.surf,
										color: s.prepared ? T.acc : T.ter,
									}}
								>
									{s.prepared && <Icon name="check" size={12} />}
									{t(s.prepared ? 'player.vitals.prepared' : 'player.vitals.notPrepared')}
								</button>
							) : (
								<Badge status={s.prepared ? 'success' : 'neutral'}>
									{t(s.prepared ? 'player.vitals.prepared' : 'player.vitals.notPrepared')}
								</Badge>
							)}
						</div>
					))}
				</div>
			)}
		</Panel>
	);
}
