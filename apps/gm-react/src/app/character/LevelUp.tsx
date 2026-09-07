import { useMemo, useState, type ReactNode } from 'react';
import {
	evaluateFormula,
	getActiveSystemForActor,
	getCharacterForActor,
	getDiceHistoryForActor,
	resourceMaxFromPackage,
	validateAdvancement,
	xpForLevel,
	type AdvancementDraft,
	type AdvancementState,
	type CoreCommand,
	type EligibilityResult,
	type SystemPackage,
} from '@dndtools/core';
import { Badge, Button, Icon, Input, ProgressMeter, Stepper, type DSChangeEvent } from '../../ds';
import { Panel, T } from '../screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';

/**
 * RC-CHR-2.1 — the guided level-up wizard, over the EXISTING staged advancement (CHAR-009).
 *
 * v1 was one flat list of every choice with a Save button beside each. v2 walks the same draft one
 * step at a time — the choices the core validator actually requires at this level, then what the
 * level unlocks, then the resources whose maximum moves, then a review — because a level-up is a
 * decision sequence, not a form. Nothing new is stored: every step writes through
 * `character.set-advancement-choices` and the last step commits with `character.commit-advancement`,
 * so the draft on the character remains the single source of progress. That is also what makes
 * exit/resume free: leaving the screen keeps the draft, and reopening lands on the first step whose
 * choice is still missing (`stepCursor` below).
 *
 * Two things are DERIVED, never invented (rule 8, no fake success):
 *  - the required steps come from `validateAdvancement` run against empty choices, so a package or
 *    rule change moves the wizard without touching this file;
 *  - "unlocks" and "slots and resources" are the active package's own `derived` formulas and
 *    resource `maxFormula`s evaluated at `fromLevel` vs `toLevel`. When the package declares
 *    nothing that changes, the step says so rather than listing a made-up feature. There is no
 *    class-feature compendium in the vault yet, so this file will not pretend there is.
 *
 * Hit points offer the two honest inputs: the die's average, and a real `dice.roll` through the
 * core (which requires a live session — the button says so when there is none instead of failing
 * silently). Either way the number lands in the draft through the same command.
 */

/** The choice fields the core draft carries, in the order a level-up asks for them. */
const CHOICE_ORDER = ['className', 'hitPointsGained', 'subclass', 'abilityOrFeat'] as const;
type ChoiceField = (typeof CHOICE_ORDER)[number];

/** The derived steps that always close the wizard, after every required choice. */
const DERIVED_STEPS = ['unlocks', 'resources', 'review'] as const;
type StepId = ChoiceField | (typeof DERIVED_STEPS)[number];

const STEP_TITLE: Record<StepId, MessageKey> = {
	className: 'character.levelUp.step.class',
	hitPointsGained: 'character.levelUp.step.hp',
	subclass: 'character.levelUp.step.subclass',
	abilityOrFeat: 'character.levelUp.step.abilityOrFeat',
	unlocks: 'character.levelUp.step.unlocks',
	resources: 'character.levelUp.step.resources',
	review: 'character.levelUp.step.review',
};
const STEP_DETAIL: Record<StepId, MessageKey> = {
	className: 'character.levelUp.detail.class',
	hitPointsGained: 'character.levelUp.detail.hp',
	subclass: 'character.levelUp.detail.subclass',
	abilityOrFeat: 'character.levelUp.detail.abilityOrFeat',
	unlocks: 'character.levelUp.detail.unlocks',
	resources: 'character.levelUp.detail.resources',
	review: 'character.levelUp.detail.review',
};

export type LevelUpDispatch = (command: CoreCommand) => Promise<boolean> | boolean;

/** One package rule whose value moves between the two levels. */
interface Change {
	key: string;
	label: string;
	from: number;
	to: number;
}

/** What the active package says changes from `fromLevel` to `toLevel`, derived on read. */
interface LevelChanges {
	/** Derived values (proficiency bonus and friends) whose only input is the level. */
	derived: Change[];
	/** Resources that come online at the new level (0 → something). */
	unlocked: Change[];
	/** Resources the character already had, whose maximum grows. */
	increased: Change[];
}

function levelChanges(pkg: SystemPackage | undefined, from: number, to: number): LevelChanges {
	const changes: LevelChanges = { derived: [], unlocked: [], increased: [] };
	if (!pkg) return changes;
	for (const value of pkg.derived) {
		// Only formulas the level alone answers can be projected; anything reading a score or a
		// modifier needs inputs this step does not have, and a guess would be a lie.
		if (value.inputs.length !== 1 || value.inputs[0] !== 'level') continue;
		const before = evaluateFormula(value.formula, { level: from });
		const after = evaluateFormula(value.formula, { level: to });
		if (!before.ok || !after.ok || before.value === after.value) continue;
		changes.derived.push({
			key: value.key,
			label: value.label,
			from: before.value,
			to: after.value,
		});
	}
	for (const resource of pkg.resources) {
		const before = resourceMaxFromPackage(resource, { level: from });
		const after = resourceMaxFromPackage(resource, { level: to });
		if (before === null || after === null || after <= before) continue;
		const change = { key: resource.key, label: resource.label, from: before, to: after };
		if (before === 0) changes.unlocked.push(change);
		else changes.increased.push(change);
	}
	return changes;
}

/** The faces of a hit die written in dice notation (`d8`, `1d10`), or null when it is unreadable. */
function dieFaces(die: string | null | undefined): number | null {
	if (!die) return null;
	const match = /^\s*\d*d(\d+)\s*$/i.exec(die);
	if (!match) return null;
	const faces = Number(match[1]);
	return Number.isFinite(faces) && faces > 0 ? faces : null;
}

/** The rounded-up average of one die, the value a table takes when it does not want to roll. */
function dieAverage(faces: number): number {
	return Math.floor(faces / 2) + 1;
}

export function CharacterLevelUpWizard({
	characterId,
	actorId,
	advancement,
	xpEligible,
	milestoneEligible,
	dispatch,
}: {
	characterId: string;
	actorId: string;
	advancement: AdvancementState | null;
	xpEligible: EligibilityResult | null;
	milestoneEligible: EligibilityResult | null;
	dispatch: LevelUpDispatch;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const state = runtime.state;
	const draft = advancement?.draft ?? null;

	// Actor-scoped reads only: the package the actor's campaign runs, the character as this actor may
	// see it (the hit die and the resource rows come from there), and the actor's own roll history.
	const read = useMemo(() => {
		const pkg = getActiveSystemForActor(state.systems, state.permissions, actorId).activePackage;
		const view = getCharacterForActor(
			state.characters,
			state.permissions,
			actorId,
			characterId,
			pkg,
		);
		const history = getDiceHistoryForActor(state.session, state.permissions, actorId);
		return {
			pkg,
			view,
			rolls: history.rolls,
			sessionLive: state.session.workflow === 'active',
		};
	}, [state, actorId, characterId]);

	// The typed inputs, one per choice field. They are drafts: the durable value is the draft's.
	const [inputs, setInputs] = useState<Record<string, string>>({});
	// The one-node live region, pre-existing so a change to it is announced (the sheet's pattern).
	const [note, setNote] = useState('');
	// Which step the wizard is on, tagged with the draft it belongs to so opening a NEW level-up
	// starts at the top rather than wherever the last one ended.
	const [cursor, setCursor] = useState<{ key: string; index: number } | null>(null);

	const hitDie = read.view?.proficiencies.hitDice.die ?? null;
	const faces = dieFaces(hitDie);
	const average = faces === null ? null : dieAverage(faces);
	// The hit-die roll this level-up asked for, most recent first. `dice.roll` records the label we
	// send, so a roll made for another purpose never prefills the field.
	const rollLabel = draft ? t('character.levelUp.rollLabel', { level: draft.toLevel }) : '';
	const lastRoll = draft
		? [...read.rolls].reverse().find((r) => r.actorId === actorId && r.label === rollLabel)
		: undefined;

	const open = (mode: 'xp' | 'milestone') =>
		dispatch({
			type: 'character.open-advancement',
			actorId,
			payload: { characterId, mode },
		});

	if (!draft) {
		return (
			<LevelUpEntry
				level={advancement?.level ?? 1}
				xp={advancement?.xp ?? 0}
				xpEligible={xpEligible}
				milestoneEligible={milestoneEligible}
				onOpen={open}
			/>
		);
	}

	// The steps this level actually requires: an empty-choices validation lists every required field,
	// and the live validation says which of them are still open.
	const required = validateAdvancement({ ...draft, choices: {} }).issues.map((i) => i.field);
	const validation = validateAdvancement(draft);
	const pending = new Map(validation.issues.map((i) => [i.field as string, i.message]));
	const choiceSteps = CHOICE_ORDER.filter((field) => required.includes(field));
	const steps: StepId[] = [...choiceSteps, ...DERIVED_STEPS];
	const firstOpen = steps.findIndex((step) => pending.has(step));
	const draftKey = `${draft.openedAt}:${draft.toLevel}`;
	const index =
		cursor && cursor.key === draftKey
			? Math.min(cursor.index, steps.length - 1)
			: firstOpen === -1
				? steps.length - 1
				: firstOpen;
	const step = steps[index]!;
	const goTo = (next: number) =>
		setCursor({ key: draftKey, index: Math.max(0, Math.min(steps.length - 1, next)) });

	const changes = levelChanges(read.pkg, draft.fromLevel, draft.toLevel);
	const savedOf = (field: ChoiceField): unknown =>
		(draft.choices as Record<string, unknown>)[field];

	async function saveChoice(field: ChoiceField, raw: string): Promise<void> {
		const text = raw.trim();
		if (!text) return;
		const value = field === 'hitPointsGained' ? Math.trunc(Number(text)) : text;
		if (field === 'hitPointsGained' && !(Number.isFinite(value as number) && (value as number) > 0))
			return;
		const ok = await dispatch({
			type: 'character.set-advancement-choices',
			actorId,
			payload: { characterId, [field]: value },
		});
		if (!ok) return;
		setInputs((prev) => ({ ...prev, [field]: '' }));
		// Hold the step the choice was made on. Without a cursor the wizard sits on the first
		// unresolved step, so saving would jump the reader forward before they had seen the result
		// land; advancing stays theirs to do.
		setCursor({ key: draftKey, index });
		setNote(t('character.levelUp.saved', { step: t(STEP_TITLE[field]), value: String(value) }));
	}

	async function rollHitPoints(): Promise<void> {
		if (!hitDie) return;
		const ok = await dispatch({
			type: 'dice.roll',
			actorId,
			payload: { expression: `1${hitDie.replace(/^\d+/, '')}`, label: rollLabel },
		});
		if (ok) setNote(t('character.levelUp.rolled'));
	}

	const targetLevel = draft.toLevel;
	async function finish(): Promise<void> {
		const ok = await dispatch({
			type: 'character.commit-advancement',
			actorId,
			payload: { characterId },
		});
		if (ok) {
			setInputs({});
			setCursor(null);
			setNote(t('character.levelUp.done', { level: targetLevel }));
		}
	}

	const cancel = () =>
		dispatch({ type: 'character.cancel-advancement', actorId, payload: { characterId } });

	return (
		<div style={{ maxWidth: 680, margin: '0 auto' }}>
			<WizardHeader draft={draft} onCancel={cancel} />
			<Stepper
				steps={steps.map((id) => t(STEP_TITLE[id]))}
				current={index}
				ariaLabel={t('character.levelUp.stepsLabel')}
				style={{ overflowX: 'auto', paddingBottom: 6, marginBottom: 14 }}
			/>
			<div role="status" style={{ font: `12px ${T.sans}`, color: T.ok, minHeight: 16 }}>
				{note}
			</div>

			<Panel title={t(STEP_TITLE[step])} pad={16} style={{ marginTop: 6 }}>
				<p style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub, margin: '0 0 12px' }}>
					{t(STEP_DETAIL[step])}
				</p>

				{step === 'hitPointsGained' ? (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
							<Badge status="neutral">
								{hitDie
									? t('character.levelUp.hitDie', { die: hitDie })
									: t('character.levelUp.noHitDie')}
							</Badge>
							{average !== null && (
								<Button
									variant="secondary"
									size="sm"
									onClick={() => void saveChoice('hitPointsGained', String(average))}
								>
									{t('character.levelUp.takeAverage', { value: average })}
								</Button>
							)}
							<Button
								variant="secondary"
								size="sm"
								icon="dice"
								disabled={!hitDie || !read.sessionLive}
								onClick={() => void rollHitPoints()}
							>
								{t('character.levelUp.roll', { die: hitDie ?? '' })}
							</Button>
						</div>
						{!read.sessionLive && (
							<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
								{t('character.levelUp.rollNeedsSession')}
							</div>
						)}
						{lastRoll && (
							<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
								<span style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
									{t('character.levelUp.rollResult', {
										die: lastRoll.expression,
										total: lastRoll.total,
									})}
								</span>
								<Button
									variant="secondary"
									size="sm"
									onClick={() => void saveChoice('hitPointsGained', String(lastRoll.total))}
								>
									{t('character.levelUp.useRoll', { total: lastRoll.total })}
								</Button>
							</div>
						)}
						<ChoiceInput
							label={t(STEP_TITLE.hitPointsGained)}
							numeric
							value={inputs.hitPointsGained ?? ''}
							saved={savedOf('hitPointsGained')}
							onChange={(v) => setInputs((prev) => ({ ...prev, hitPointsGained: v }))}
							onSave={(v) => void saveChoice('hitPointsGained', v)}
						/>
					</div>
				) : step === 'unlocks' ? (
					<ChangeList
						rows={[...changes.derived, ...changes.unlocked]}
						empty={t('character.levelUp.noUnlocks')}
					/>
				) : step === 'resources' ? (
					<>
						<ChangeList rows={changes.increased} empty={t('character.levelUp.noResourceChange')} />
						<p style={{ font: `12px/1.6 ${T.sans}`, color: T.ter, margin: '10px 0 0' }}>
							{t('character.levelUp.slotsAreAuthored')}
						</p>
					</>
				) : step === 'review' ? (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
						{choiceSteps.map((field) => (
							<div
								key={field}
								style={{
									display: 'flex',
									justifyContent: 'space-between',
									gap: 12,
									padding: '8px 10px',
									borderRadius: 9,
									background: T.alt,
								}}
							>
								<span style={{ font: `600 12.5px ${T.sans}` }}>{t(STEP_TITLE[field])}</span>
								<span
									style={{
										font: `12.5px ${T.mono}`,
										color: pending.has(field) ? T.warn : T.ink,
										textAlign: 'right',
									}}
								>
									{pending.has(field)
										? t('character.levelUp.notChosen')
										: String(savedOf(field) ?? '')}
								</span>
							</div>
						))}
						<Button
							variant="primary"
							size="md"
							icon="flag"
							disabled={!validation.complete}
							onClick={() => void finish()}
							style={{ marginTop: 6 }}
						>
							{validation.complete
								? t('character.levelUp.finish', { level: draft.toLevel })
								: t('character.levelUp.incomplete')}
						</Button>
					</div>
				) : (
					<ChoiceInput
						label={t(STEP_TITLE[step])}
						value={inputs[step] ?? ''}
						saved={savedOf(step)}
						onChange={(v) => setInputs((prev) => ({ ...prev, [step]: v }))}
						onSave={(v) => void saveChoice(step, v)}
					/>
				)}

				{pending.has(step) && (
					<div style={{ font: `12px ${T.sans}`, color: T.warn, marginTop: 10 }}>
						{pending.get(step)}
					</div>
				)}
			</Panel>

			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					gap: 8,
					marginTop: 14,
					flexWrap: 'wrap',
				}}
			>
				<Button variant="ghost" size="sm" disabled={index === 0} onClick={() => goTo(index - 1)}>
					{t('character.levelUp.back')}
				</Button>
				<Button
					variant="secondary"
					size="sm"
					disabled={index >= steps.length - 1 || pending.has(step)}
					onClick={() => goTo(index + 1)}
				>
					{t('character.levelUp.nextStep')}
				</Button>
			</div>
			<p
				style={{
					font: `12px/1.6 ${T.sans}`,
					color: T.ter,
					textAlign: 'center',
					margin: '12px 0 0',
				}}
			>
				{t('character.levelUp.resumeHint')}
			</p>
		</div>
	);
}

/** The level card + the two ways in, shown while no advancement is open. */
function LevelUpEntry({
	level,
	xp,
	xpEligible,
	milestoneEligible,
	onOpen,
}: {
	level: number;
	xp: number;
	xpEligible: EligibilityResult | null;
	milestoneEligible: EligibilityResult | null;
	onOpen: (mode: 'xp' | 'milestone') => void;
}) {
	const { t, formatNumber } = useI18n();
	const nextXp = xpForLevel(level + 1);
	return (
		<div style={{ maxWidth: 680, margin: '0 auto' }}>
			<LevelBadgeRow
				badge={level}
				title={t('character.levelUp.level', { level })}
				subtitle={
					nextXp === null
						? t('character.levelUp.maxLevel')
						: t('character.levelUp.next', { level: level + 1 })
				}
			/>
			{nextXp !== null && (
				<Panel title={t('character.levelUp.experience')} pad={14} style={{ marginBottom: 16 }}>
					<ProgressMeter
						value={Math.min(xp, nextXp)}
						max={nextXp}
						label={t('character.levelUp.xpMeter', {
							xp: formatNumber(xp),
							next: formatNumber(nextXp),
						})}
					/>
					{xpEligible && !xpEligible.eligible && (
						<div style={{ font: `12px ${T.sans}`, color: T.ter, marginTop: 6 }}>
							{xpEligible.message}
						</div>
					)}
				</Panel>
			)}
			<div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
				<Button
					variant="primary"
					size="md"
					icon="flag"
					disabled={!xpEligible?.eligible}
					onClick={() => onOpen('xp')}
				>
					{t('character.levelUp.byXp')}
				</Button>
				<Button
					variant="secondary"
					size="md"
					disabled={!milestoneEligible?.eligible}
					onClick={() => onOpen('milestone')}
				>
					{t('character.levelUp.byMilestone')}
				</Button>
			</div>
			{milestoneEligible && !milestoneEligible.eligible && (
				<div style={{ font: `12px ${T.sans}`, color: T.ter, textAlign: 'center', marginTop: 10 }}>
					{milestoneEligible.message}
				</div>
			)}
		</div>
	);
}

function WizardHeader({ draft, onCancel }: { draft: AdvancementDraft; onCancel: () => void }) {
	const { t } = useI18n();
	return (
		<LevelBadgeRow
			badge={draft.toLevel}
			title={t('character.levelUp.fromTo', { from: draft.fromLevel, to: draft.toLevel })}
			subtitle={t(
				draft.mode === 'xp' ? 'character.levelUp.modeXp' : 'character.levelUp.modeMilestone',
			)}
			action={
				<Button variant="ghost" size="sm" onClick={onCancel}>
					{t('character.levelUp.discard')}
				</Button>
			}
		/>
	);
}

function LevelBadgeRow({
	badge,
	title,
	subtitle,
	action,
}: {
	badge: number;
	title: string;
	subtitle: string;
	action?: ReactNode;
}) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 16,
				padding: '16px 20px',
				borderRadius: 14,
				background: `linear-gradient(135deg, ${T.accSub}, ${T.surf})`,
				border: `1px solid ${T.accBd}`,
				marginBottom: 18,
			}}
		>
			<span
				style={{
					width: 50,
					height: 50,
					borderRadius: 12,
					flex: '0 0 auto',
					background: T.acc,
					color: T.accFg,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					font: `700 20px ${T.mono}`,
				}}
			>
				{badge}
			</span>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ font: `700 18px ${T.disp}` }}>{title}</div>
				<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>{subtitle}</div>
			</div>
			{action}
		</div>
	);
}

/** One choice field: what is stored now, a field to change it, and a Save that dispatches. */
function ChoiceInput({
	label,
	value,
	saved,
	numeric,
	onChange,
	onSave,
}: {
	label: string;
	value: string;
	saved: unknown;
	numeric?: boolean;
	onChange: (next: string) => void;
	onSave: (value: string) => void;
}) {
	const { t } = useI18n();
	const stored = saved === undefined || saved === null ? null : String(saved);
	return (
		<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
			<Input
				type={numeric ? 'number' : 'text'}
				value={value}
				placeholder={stored ?? label}
				aria-label={label}
				onChange={(e: DSChangeEvent) => onChange(e.target.value)}
				style={{ maxWidth: 220 }}
			/>
			<Button variant="secondary" size="sm" disabled={!value.trim()} onClick={() => onSave(value)}>
				{stored === null ? t('character.levelUp.choose') : t('character.levelUp.change')}
			</Button>
			{stored !== null && (
				<span
					style={{
						font: `12.5px ${T.sans}`,
						color: T.acc,
						display: 'inline-flex',
						alignItems: 'center',
						gap: 5,
					}}
				>
					<Icon name="check" size={14} />
					{stored}
				</span>
			)}
		</div>
	);
}

/** A derived from → to list, or an honest line when the package declares no change. */
function ChangeList({ rows, empty }: { rows: Change[]; empty: string }) {
	const { t } = useI18n();
	if (rows.length === 0) {
		return <p style={{ font: `12.5px/1.6 ${T.sans}`, color: T.ter, margin: 0 }}>{empty}</p>;
	}
	return (
		<ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 7 }}>
			{rows.map((row) => (
				<li
					key={row.key}
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						gap: 12,
						padding: '8px 10px',
						borderRadius: 9,
						background: T.alt,
					}}
				>
					<span style={{ font: `12.5px ${T.sans}` }}>{row.label}</span>
					<span style={{ font: `12.5px ${T.mono}`, color: T.acc }}>
						{t('character.levelUp.fromToValue', { from: row.from, to: row.to })}
					</span>
				</li>
			))}
		</ul>
	);
}
