import { useState } from 'react';
import { availableSlots, type CharacterResources, type ResourceInstance } from '@dndtools/core';
import {
	Badge,
	Button,
	ConditionTracker,
	EmptyState,
	HPBar,
	Icon,
	IconButton,
	Input,
	Select,
	SpellSlots,
	useConditionCatalog,
} from '../../ds';
import type { DSChangeEvent } from '../../ds';
import { Panel, T, eb } from '../../app/screen-kit';
import { CharacterResourcesPanel } from '../../app/character/Resources';
import { RestDialog, type RestSubject } from '../../app/character/RestDialog';
import { useI18n } from '../../i18n';
import type { Dispatch } from './shared';

/** RC-CHR-6.1 — the hit points and conditions the vitals block shows and edits. */
export interface VitalsSubject {
	hp: number;
	maxHp: number;
	tempHp: number;
	conditions: string[];
}

/** RC-CHR-6.1 — one CHAR-007 hit-point, temporary-HP or condition change. */
export type VitalsWrite =
	| { kind: 'hp'; delta: number }
	| { kind: 'temp-hp'; value: number }
	| { kind: 'condition'; condition: string; present: boolean };

/** The last hit-point change, the writes that reverse it, and the state it left behind. */
interface HpUndo {
	sign: 1 | -1;
	amount: number;
	writes: VitalsWrite[];
	hp: number;
	tempHp: number;
}

/**
 * RC-CHR-6.1 — what reverses an HP change EXACTLY, worked out with the core's own rule (damage eats
 * temporary HP first, hit points clamp to 0…max), or null when nothing changed or no exact reversal
 * exists. Healing is reversed with damage, which would raise a concentration check that never
 * happened, so a heal taken while concentrating offers no undo.
 */
export function hpUndoFor(
	before: VitalsSubject,
	sign: 1 | -1,
	amount: number,
	concentrating: boolean,
): HpUndo | null {
	if (sign < 0) {
		const absorbed = Math.min(before.tempHp, amount);
		const lost = Math.min(before.hp, amount - absorbed);
		if (absorbed + lost === 0) return null;
		const writes: VitalsWrite[] = [];
		if (lost > 0) writes.push({ kind: 'hp', delta: lost });
		// Temporary HP never stack, so setting the old value back restores it outright.
		if (absorbed > 0) writes.push({ kind: 'temp-hp', value: before.tempHp });
		return { sign, amount, writes, hp: before.hp - lost, tempHp: before.tempHp - absorbed };
	}
	const gained = Math.min(Math.max(0, before.maxHp - before.hp), amount);
	if (gained === 0 || concentrating) return null;
	// Damage drains temporary HP before hit points: take both, then grant the temporary HP back.
	const writes: VitalsWrite[] = [{ kind: 'hp', delta: -(gained + before.tempHp) }];
	if (before.tempHp > 0) writes.push({ kind: 'temp-hp', value: before.tempHp });
	return { sign, amount, writes, hp: before.hp + gained, tempHp: before.tempHp };
}

/**
 * RC-CHR-6.1 — the HP stepper (with undo), temporary hit points and conditions, shared by `/player`
 * and the `/play` companion. Every control is a CHAR-007 write, so all of them are drawn only when
 * `canUpdate` says the core would take it; without it the block is a plain readout.
 */
export function CharacterVitals({
	subject,
	concentrating,
	canUpdate,
	onWrite,
}: {
	subject: VitalsSubject;
	concentrating: boolean;
	canUpdate: boolean;
	/** Apply one write; resolves false when it was refused (the caller says why). */
	onWrite: (write: VitalsWrite) => Promise<boolean>;
}) {
	const { t } = useI18n();
	const { conditions: catalog, registry } = useConditionCatalog();
	const [amount, setAmount] = useState('1');
	const [tempDraft, setTempDraft] = useState('');
	const [note, setNote] = useState('');
	const [undo, setUndo] = useState<HpUndo | null>(null);
	const addable = catalog.filter((c) => !subject.conditions.includes(c.key));
	const [picked, setPicked] = useState('');
	const pick = addable.some((c) => c.key === picked) ? picked : (addable[0]?.key ?? '');
	const label = (key: string) => registry[key]?.label ?? key;

	const step = () => {
		const n = Math.trunc(Number(amount));
		return Number.isFinite(n) && n > 0 ? n : 1;
	};
	const writeAll = async (writes: VitalsWrite[]) => {
		for (const write of writes) if (!(await onWrite(write))) return false;
		return true;
	};
	const stepHp = async (sign: 1 | -1) => {
		const n = step();
		const reversal = hpUndoFor(subject, sign, n, concentrating);
		setNote('');
		setUndo(null);
		if (!(await onWrite({ kind: 'hp', delta: sign * n }))) return;
		setUndo(reversal);
		setNote(t(sign < 0 ? 'player.hp.damaged' : 'player.hp.healed', { amount: n }));
	};
	const undoLast = async () => {
		if (!undo) return;
		const writes = undo.writes;
		setUndo(null);
		if (await writeAll(writes)) setNote(t('player.hp.undone'));
	};
	const grantTemp = async () => {
		const value = Math.trunc(Number(tempDraft));
		if (!Number.isFinite(value) || value < 0) return;
		setNote('');
		if (await onWrite({ kind: 'temp-hp', value })) {
			setTempDraft('');
			setNote(t('player.hp.tempGranted', { count: Math.max(subject.tempHp, value) }));
		}
	};
	const setCondition = async (condition: string, present: boolean) => {
		setNote('');
		if (await onWrite({ kind: 'condition', condition, present })) {
			setNote(
				t(present ? 'player.vitals.conditionAdded' : 'player.vitals.conditionRemoved', {
					condition: label(condition),
				}),
			);
		}
	};
	// The undo stands only while the sheet still shows what the change left: once anyone else moves the
	// hit points, reversing "the last change" would reverse theirs too.
	const undoable = undo && undo.hp === subject.hp && undo.tempHp === subject.tempHp ? undo : null;

	return (
		<Panel title={t('player.hp.label')}>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						flexWrap: 'wrap',
						gap: 'var(--space-2)',
					}}
				>
					{canUpdate && (
						<IconButton
							icon="chevron-down"
							label={t('player.hp.damageBy', { amount: step() })}
							variant="outline"
							size="sm"
							onClick={() => void stepHp(-1)}
						/>
					)}
					<div style={{ textAlign: 'center', minWidth: 74 }} data-testid="vitals-hp">
						<div
							style={{
								font: `700 var(--text-lg) ${T.mono}`,
								color: subject.maxHp > 0 && subject.hp / subject.maxHp < 0.3 ? T.err : T.ink,
								lineHeight: 1,
							}}
						>
							{subject.hp}
							<span style={{ font: `var(--text-sm) ${T.mono}`, color: T.ter }}>
								{' '}
								/ {subject.maxHp}
							</span>
						</div>
						{subject.tempHp > 0 && (
							<div style={{ font: `var(--text-xs) ${T.mono}`, color: T.acc }}>
								{t('player.hp.tempValue', { count: subject.tempHp })}
							</div>
						)}
					</div>
					{canUpdate && (
						<>
							<IconButton
								icon="chevron-up"
								label={t('player.hp.healBy', { amount: step() })}
								variant="outline"
								size="sm"
								onClick={() => void stepHp(1)}
							/>
							<Input
								type="text"
								inputMode="numeric"
								aria-label={t('player.hp.amountLabel')}
								value={amount}
								onChange={(e: DSChangeEvent) => setAmount(e.target.value)}
								onBlur={() => setAmount(String(step()))}
								style={{ width: 'var(--space-16)', textAlign: 'center' }}
							/>
							{undoable && (
								<Button variant="ghost" size="sm" onClick={() => void undoLast()}>
									{t(undoable.sign < 0 ? 'player.hp.undoDamage' : 'player.hp.undoHeal', {
										amount: undoable.amount,
									})}
								</Button>
							)}
						</>
					)}
				</div>
				<HPBar current={subject.hp} max={subject.maxHp} size="md" />
				{canUpdate && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							flexWrap: 'wrap',
							gap: 'var(--space-2)',
						}}
					>
						<Input
							type="text"
							inputMode="numeric"
							aria-label={t('player.hp.tempLabel')}
							placeholder={t('player.hp.temp')}
							value={tempDraft}
							onChange={(e: DSChangeEvent) => setTempDraft(e.target.value)}
							style={{ width: 'var(--space-24)' }}
						/>
						<Button variant="secondary" size="sm" onClick={() => void grantTemp()}>
							{t('player.hp.tempGrant')}
						</Button>
						<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
							{t('player.hp.tempHelp')}
						</span>
					</div>
				)}
				<div>
					<div style={{ ...eb, color: T.ter, marginBottom: 'var(--space-1-5)' }}>
						{t('player.vitals.conditions')}
					</div>
					<ConditionTracker
						entries={subject.conditions}
						addable={false}
						onRemove={canUpdate ? (key) => void setCondition(key, false) : undefined}
					/>
				</div>
				{canUpdate && addable.length > 0 && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							flexWrap: 'wrap',
							gap: 'var(--space-2)',
						}}
					>
						<Select
							aria-label={t('player.vitals.addConditionLabel')}
							value={pick}
							onChange={(e: DSChangeEvent) => setPicked(e.target.value)}
							options={addable.map((c) => ({ value: c.key, label: c.label ?? c.key }))}
							style={{ minWidth: 160 }}
						/>
						<Button
							variant="secondary"
							size="sm"
							icon="add"
							onClick={() => void setCondition(pick, true)}
						>
							{t('player.vitals.addCondition')}
						</Button>
					</div>
				)}
				{/* A successful write otherwise only changes a number, which announces nothing. */}
				<div role="status" style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
					{note}
				</div>
			</div>
		</Panel>
	);
}

export function PlayerResources({
	charId,
	resources,
	resourceInstances,
	canManageResources,
	canUpdateCombat = canManageResources,
	vitals = null,
	onVitalsWrite,
	actorId,
	compact,
	restSubject,
	dispatch,
}: {
	charId: string;
	resources: CharacterResources | null;
	/** RC-CHR-1.1 — every resource the active system package declares for this character. */
	resourceInstances: ResourceInstance[];
	canManageResources: boolean;
	/**
	 * RC-CHR-6.1 — CHAR-007 authority (owner or combat-participant): HP, temporary HP, conditions,
	 * spending a slot, concentration. Defaults to `canManageResources`, which implies it.
	 */
	canUpdateCombat?: boolean;
	/** RC-CHR-6.1 — the hit points and conditions for the vitals panel; omitted, the panel is not drawn. */
	vitals?: VitalsSubject | null;
	/**
	 * RC-CHR-6.1 — how a vitals change is applied. Defaults to the character's own
	 * `character.update-combat-resource`; the companion also mirrors it onto the PC's tracker row.
	 */
	onVitalsWrite?: (write: VitalsWrite) => Promise<boolean>;
	actorId: string;
	compact: boolean;
	/**
	 * RC-CHR-1.2 — what the rest dialog needs about this character (hit dice, hit points, exhaustion).
	 * Null while no character is resolved, which is also when the rest controls are not offered.
	 */
	restSubject: RestSubject | null;
	dispatch: Dispatch;
}) {
	const { t } = useI18n();
	// RC-CHR-1.2 — resting used to be two buttons that fired immediately and said nothing. The rest
	// they open now asks how many hit dice to spend and states what the answer will do first.
	const [restKind, setRestKind] = useState<'short' | 'long' | null>(null);
	const r = resources;
	const slots = r ? Object.values(r.spellSlots).sort((a, b) => a.level - b.level) : [];
	const spells = r?.spells ?? [];
	const con = r?.concentration?.effect ? r.concentration : null;
	const death = r?.deathSaves ?? { successes: 0, failures: 0, stable: false };

	const writeVitals =
		onVitalsWrite ??
		((write: VitalsWrite) =>
			dispatch({
				type: 'character.update-combat-resource',
				actorId,
				payload: { characterId: charId, ...write },
			}));
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
	// Real prepared toggle: `character.set-spell` upserts the spell with the flipped flag (CHAR-008).
	const togglePrepared = (s: { id: string; name: string; level: number; prepared: boolean }) =>
		dispatch({
			type: 'character.set-spell',
			actorId,
			payload: {
				characterId: charId,
				id: s.id,
				name: s.name,
				level: s.level,
				prepared: !s.prepared,
			},
		});
	const rest = (choice: {
		rest: 'short' | 'long';
		hitDice?: { spend: number; mode: 'roll' | 'average' };
	}) =>
		dispatch({
			type: 'character.rest',
			actorId,
			payload: { characterId: charId, ...choice },
		});
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
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: compact ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))',
				gap: 'var(--space-4)',
				alignItems: 'start',
			}}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
				{vitals && (
					<CharacterVitals
						subject={vitals}
						concentrating={!!con}
						canUpdate={canUpdateCombat}
						onWrite={writeVitals}
					/>
				)}
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
					resources={resourceInstances}
					canManage={canManageResources}
					compact={compact}
					dispatch={dispatch}
				/>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
				<Panel
					title={t('player.vitals.deathSaves')}
					action={
						<Badge status={death.stable ? 'success' : 'neutral'}>
							{t(death.stable ? 'player.vitals.stable' : 'player.vitals.conscious')}
						</Badge>
					}
				>
					<div style={{ display: 'flex', gap: 'var(--space-6)' }}>
						{(['successes', 'failures'] as const).map((k) => (
							<div key={k}>
								<div
									style={{
										...eb,
										color: k === 'failures' ? T.err : T.ok,
										marginBottom: 'var(--space-1-5)',
									}}
								>
									{t(
										k === 'failures'
											? 'player.vitals.deathFailures'
											: 'player.vitals.deathSuccesses',
									)}
								</div>
								{/* The pips were filled-vs-transparent ONLY: colour as the sole carrier of the
								    state (WCAG 1.4.1), with no text equivalent anywhere (1.1.1), so the count
								    was simply unavailable to assistive tech and invisible under
								    forced-colors, which flattens both tints. One `role="img"` names the whole
								    group; the visible `n/3` gives every reader the number. */}
								<div
									role="img"
									aria-label={t(
										k === 'failures'
											? 'player.vitals.deathFailuresCount'
											: 'player.vitals.deathSuccessesCount',
										{ count: death[k] },
									)}
									style={{ display: 'flex', gap: 'var(--space-1-5)', alignItems: 'center' }}
								>
									{Array.from({ length: 3 }).map((_, i) => (
										<span
											key={i}
											style={{
												width: 18,
												height: 18,
												borderRadius: 'var(--radius-full)',
												background:
													i < death[k] ? (k === 'failures' ? T.err : T.ok) : 'transparent',
												border: `1.5px solid ${k === 'failures' ? T.err : T.ok}`,
											}}
										/>
									))}
									<span
										aria-hidden="true"
										style={{ font: `var(--text-xs) ${T.mono}`, color: T.ter }}
									>
										{death[k]}/3
									</span>
								</div>
							</div>
						))}
					</div>
				</Panel>
				{canManageResources && (
					<Panel
						title={t('player.vitals.rest')}
						action={
							<div style={{ display: 'flex', gap: 'var(--space-1-5)' }}>
								<Button
									variant="secondary"
									size="sm"
									icon="recent"
									disabled={!restSubject}
									onClick={() => setRestKind('short')}
								>
									{t('player.vitals.shortRest')}
								</Button>
								<Button
									variant="primary"
									size="sm"
									icon="theme"
									disabled={!restSubject}
									onClick={() => setRestKind('long')}
								>
									{t('player.vitals.longRest')}
								</Button>
							</div>
						}
					>
						<div style={{ font: `var(--text-sm)/1.55 ${T.sans}`, color: T.sub }}>
							{t('player.vitals.restHelp')}
						</div>
					</Panel>
				)}
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
			</div>
			<RestDialog
				open={restKind !== null}
				subject={restSubject}
				defaultRest={restKind ?? 'short'}
				onClose={() => setRestKind(null)}
				onConfirm={(choice) => {
					setRestKind(null);
					void rest(choice);
				}}
			/>
		</div>
	);
}
