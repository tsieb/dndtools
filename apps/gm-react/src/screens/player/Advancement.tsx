import { useState } from 'react';
import {
	validateAdvancement,
	xpForLevel,
	type AdvancementState,
	type EligibilityResult,
} from '@dndtools/core';
import { Badge, Button, Icon, Input, ProgressMeter } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import type { Dispatch } from './shared';

// ── Level up — the REAL staged CHAR-009 advancement flow (same commands as /characters) ──────────
const STEP_META: Record<
	string,
	{ label: MessageKey; kind: MessageKey; detail: MessageKey; number?: boolean }
> = {
	className: {
		label: 'player.levelUp.step.class',
		kind: 'player.levelUp.kind.class',
		detail: 'player.levelUp.step.classDetail',
	},
	hitPointsGained: {
		label: 'player.levelUp.step.hp',
		kind: 'player.levelUp.kind.hp',
		detail: 'player.levelUp.step.hpDetail',
		number: true,
	},
	subclass: {
		label: 'player.levelUp.step.subclass',
		kind: 'player.levelUp.kind.choice',
		detail: 'player.levelUp.step.subclassDetail',
	},
	abilityOrFeat: {
		label: 'player.levelUp.step.abilityOrFeat',
		kind: 'player.levelUp.kind.choice',
		detail: 'player.levelUp.step.abilityOrFeatDetail',
	},
};

export function PlayerLevelUp({
	charId,
	actorId,
	advancement,
	xpEligible,
	milestoneEligible,
	dispatch,
}: {
	charId: string;
	actorId: string;
	advancement: AdvancementState | null;
	xpEligible: EligibilityResult | null;
	milestoneEligible: EligibilityResult | null;
	dispatch: Dispatch;
}) {
	const { t, formatNumber } = useI18n();
	const [inputs, setInputs] = useState<Record<string, string>>({});
	const draft = advancement?.draft ?? null;
	const level = advancement?.level ?? 1;
	const xp = advancement?.xp ?? 0;
	const nextXp = level < 20 ? xpForLevel(level + 1) : null;

	const open = (mode: 'xp' | 'milestone') =>
		dispatch({
			type: 'character.open-advancement',
			actorId,
			payload: { characterId: charId, mode },
		});
	const cancel = () =>
		dispatch({ type: 'character.cancel-advancement', actorId, payload: { characterId: charId } });
	const finish = async () => {
		if (
			await dispatch({
				type: 'character.commit-advancement',
				actorId,
				payload: { characterId: charId },
			})
		)
			setInputs({});
	};
	// Per-step save through the real merge path (`set-advancement-choices` merges into the draft).
	const saveChoice = (field: string) => {
		const raw = (inputs[field] ?? '').trim();
		if (!raw) return;
		const value = STEP_META[field]?.number ? Math.trunc(Number(raw)) : raw;
		if (STEP_META[field]?.number && !Number.isFinite(value as number)) return;
		return dispatch({
			type: 'character.set-advancement-choices',
			actorId,
			payload: { characterId: charId, [field]: value },
		});
	};

	if (!draft) {
		return (
			<div style={{ maxWidth: 680, margin: '0 auto' }}>
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
							background: T.acc,
							color: T.accFg,
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							font: `700 20px ${T.mono}`,
						}}
					>
						{level}
					</span>
					<div style={{ flex: 1 }}>
						<div style={{ font: `700 18px ${T.disp}` }}>{t('player.levelUp.level', { level })}</div>
						<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
							{level >= 20
								? t('player.levelUp.maxLevel')
								: t('player.levelUp.next', { level: level + 1 })}
						</div>
					</div>
				</div>
				{nextXp !== null && (
					<Panel title={t('player.levelUp.experience')} pad={14} style={{ marginBottom: 16 }}>
						<ProgressMeter
							value={Math.min(xp, nextXp)}
							max={nextXp}
							label={t('player.levelUp.xpMeter', {
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
						onClick={() => open('xp')}
					>
						{t('player.levelUp.byXp')}
					</Button>
					<Button
						variant="secondary"
						size="md"
						disabled={!milestoneEligible?.eligible}
						onClick={() => open('milestone')}
					>
						{t('player.levelUp.byMilestone')}
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

	// The steps this level actually requires, derived from the core validator itself (an empty-choices
	// validation lists every required field; the current validation marks which are still open).
	const required = validateAdvancement({ ...draft, choices: {} }).issues.filter(
		(i) => i.field !== 'mode',
	);
	const openIssues = validateAdvancement(draft);
	const pending = new Map(openIssues.issues.map((i) => [i.field as string, i.message]));
	const doneCount = required.filter((i) => !pending.has(i.field as string)).length;

	return (
		<div style={{ maxWidth: 680, margin: '0 auto' }}>
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
						background: T.acc,
						color: T.accFg,
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						font: `700 20px ${T.mono}`,
					}}
				>
					{draft.toLevel}
				</span>
				<div style={{ flex: 1 }}>
					<div style={{ font: `700 18px ${T.disp}` }}>
						{t('player.levelUp.fromTo', { from: draft.fromLevel, to: draft.toLevel })}
					</div>
					<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
						{/* `draft.mode` is the raw core enum, so this read "xp advancement" / "milestone
						    advancement" — lowercase, and XP as a word rather than the initialism. */}
						{t('player.levelUp.progress', {
							mode: t(
								draft.mode === 'xp' ? 'player.levelUp.modeXp' : 'player.levelUp.modeMilestone',
							),
							done: doneCount,
							total: required.length,
						})}
					</div>
				</div>
				<Button variant="ghost" size="sm" onClick={cancel}>
					{t('common.action.cancel')}
				</Button>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
				{required.map((req, i) => {
					const field = req.field as string;
					const meta = STEP_META[field] ?? null;
					const stepLabel = meta ? t(meta.label) : field;
					const saved = (draft.choices as Record<string, unknown>)[field];
					const done = !pending.has(field);
					return (
						<div
							key={field}
							style={{
								display: 'flex',
								gap: 13,
								padding: 14,
								borderRadius: 11,
								border: `1px solid ${done ? T.bd : T.accBd}`,
								background: T.surf,
							}}
						>
							<span
								style={{
									width: 28,
									height: 28,
									borderRadius: '50%',
									flex: '0 0 auto',
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center',
									background: done ? T.ok : T.alt,
									color: done ? T.accFg : T.ter,
								}}
							>
								{done ? (
									<Icon name="check" size={15} />
								) : (
									<span style={{ font: `700 12px ${T.mono}` }}>{i + 1}</span>
								)}
							</span>
							<div style={{ flex: 1 }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
									<span style={{ font: `600 13.5px ${T.sans}` }}>{stepLabel}</span>
									{meta && <Badge status="neutral">{t(meta.kind)}</Badge>}
								</div>
								{done ? (
									<div style={{ font: `12.5px ${T.sans}`, color: T.acc }}>{String(saved)}</div>
								) : (
									<div style={{ font: `12px ${T.sans}`, color: T.warn }}>{pending.get(field)}</div>
								)}
								<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub, marginTop: 2 }}>
									{meta ? t(meta.detail) : ''}
								</div>
								<div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
									<Input
										type={meta?.number ? 'number' : 'text'}
										value={inputs[field] ?? ''}
										placeholder={done ? String(saved) : stepLabel}
										aria-label={stepLabel}
										onChange={(e: any) => setInputs((v) => ({ ...v, [field]: e.target.value }))}
										style={{ maxWidth: 220 }}
									/>
									<Button
										variant="secondary"
										size="sm"
										disabled={!(inputs[field] ?? '').trim()}
										onClick={() => saveChoice(field)}
									>
										{t(done ? 'player.levelUp.change' : 'player.levelUp.choose')}
									</Button>
								</div>
							</div>
						</div>
					);
				})}
			</div>
			<div style={{ marginTop: 16, textAlign: 'center' }}>
				<Button
					variant="primary"
					size="md"
					icon="flag"
					disabled={!openIssues.complete}
					onClick={finish}
				>
					{openIssues.complete
						? t('player.levelUp.finish', { level: draft.toLevel })
						: t('player.levelUp.incomplete')}
				</Button>
			</div>
		</div>
	);
}
