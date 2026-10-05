import { useState } from 'react';
import {
	Button,
	ConditionTracker,
	HPBar,
	IconButton,
	Input,
	Select,
	useConditionCatalog,
} from '../../../ds';
import type { DSChangeEvent } from '../../../ds';
import { T, eb } from '../../../app/screen-kit';
import { useI18n } from '../../../i18n';
import { condKey } from '../shared';

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
 * RC-CHR-6.1/6.2 — the HP stepper (with undo), temporary hit points and conditions inside the sheet's
 * Combat panel. Every control is a CHAR-007 write, so all of them are drawn only when `canUpdate` says
 * the core would take it; without it the block is a plain readout. Successes are announced through the
 * frame's status (`announce`), so a sheet keeps one polite region.
 */
export function VitalsBlock({
	subject,
	concentrating,
	canUpdate,
	onWrite,
	announce,
}: {
	subject: VitalsSubject;
	concentrating: boolean;
	canUpdate: boolean;
	/** Apply one write; resolves false when it was refused (the frame says why). */
	onWrite: (write: VitalsWrite) => Promise<boolean>;
	announce: (text: string) => void;
}) {
	const { t } = useI18n();
	const { conditions: catalog, registry } = useConditionCatalog();
	const [amount, setAmount] = useState('1');
	const [tempDraft, setTempDraft] = useState('');
	const [undo, setUndo] = useState<HpUndo | null>(null);
	const present = new Set(subject.conditions.map((c) => condKey(c) ?? c));
	const addable = catalog.filter((c) => !present.has(c.key));
	const [picked, setPicked] = useState('');
	const pick = addable.some((c) => c.key === picked) ? picked : (addable[0]?.key ?? '');
	const label = (key: string) => registry[condKey(key) ?? key]?.label ?? key;

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
		setUndo(null);
		if (!(await onWrite({ kind: 'hp', delta: sign * n }))) return;
		setUndo(reversal);
		announce(t(sign < 0 ? 'player.hp.damaged' : 'player.hp.healed', { amount: n }));
	};
	const undoLast = async () => {
		if (!undo) return;
		const writes = undo.writes;
		setUndo(null);
		if (await writeAll(writes)) announce(t('player.hp.undone'));
	};
	const grantTemp = async () => {
		const value = Math.trunc(Number(tempDraft));
		if (!Number.isFinite(value) || value < 0) return;
		if (await onWrite({ kind: 'temp-hp', value })) {
			setTempDraft('');
			announce(t('player.hp.tempGranted', { count: Math.max(subject.tempHp, value) }));
		}
	};
	const setCondition = async (condition: string, on: boolean) => {
		if (await onWrite({ kind: 'condition', condition, present: on })) {
			announce(
				t(on ? 'player.vitals.conditionAdded' : 'player.vitals.conditionRemoved', {
					condition: label(condition),
				}),
			);
		}
	};
	// The undo stands only while the sheet still shows what the change left: once anyone else moves the
	// hit points, reversing "the last change" would reverse theirs too.
	const undoable = undo && undo.hp === subject.hp && undo.tempHp === subject.tempHp ? undo : null;
	const row = {
		display: 'flex',
		alignItems: 'center',
		flexWrap: 'wrap',
		gap: 'var(--space-2)',
	} as const;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
			<div style={row}>
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
					<div style={{ ...eb, color: T.ter }}>{t('player.hp.label')}</div>
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
			<HPBar current={subject.hp} max={subject.maxHp} size="lg" />
			{canUpdate && (
				<div style={row}>
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
				{subject.conditions.length > 0 ? (
					<ConditionTracker
						entries={subject.conditions.map((c) => condKey(c) ?? c)}
						addable={false}
						onRemove={
							canUpdate
								? (_key: string, index: number) =>
										void setCondition(subject.conditions[index]!, false)
								: undefined
						}
					/>
				) : (
					<span style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter }}>
						{t('characters.none')}
					</span>
				)}
			</div>
			{canUpdate && addable.length > 0 && (
				<div style={row}>
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
		</div>
	);
}
