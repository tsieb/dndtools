import { useState } from 'react';
import {
	validateAdvancement,
	xpForLevel,
	type AdvancementState,
	type EligibilityResult,
} from '@dndtools/core';
import { Badge, Button, Icon, Input, ProgressMeter } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import type { Dispatch } from './shared';

// ── Level up — the REAL staged CHAR-009 advancement flow (same commands as /characters) ──────────
const STEP_META: Record<string, { label: string; kind: string; detail: string; number?: boolean }> =
	{
		className: { label: 'Class', kind: 'class', detail: 'Which class gains this level.' },
		hitPointsGained: {
			label: 'Hit points',
			kind: 'hp',
			detail: 'HP gained at this level — roll your hit die or take the average.',
			number: true,
		},
		subclass: { label: 'Subclass', kind: 'choice', detail: 'This level unlocks your subclass.' },
		abilityOrFeat: {
			label: 'Ability or feat',
			kind: 'choice',
			detail: 'Choose an ability score improvement or a feat.',
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
						<div style={{ font: `700 18px ${T.disp}` }}>Level {level}</div>
						<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
							{level >= 20 ? 'Maximum level reached.' : `Next: level ${level + 1}`}
						</div>
					</div>
				</div>
				{nextXp !== null && (
					<Panel title="Experience" pad={14} style={{ marginBottom: 16 }}>
						<ProgressMeter
							value={Math.min(xp, nextXp)}
							max={nextXp}
							label={`${xp} / ${nextXp} XP`}
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
						Level up (XP)
					</Button>
					<Button
						variant="secondary"
						size="md"
						disabled={!milestoneEligible?.eligible}
						onClick={() => open('milestone')}
					>
						Level up (milestone)
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
						Level {draft.fromLevel} → {draft.toLevel}
					</div>
					<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
						{/* `draft.mode` is the raw core enum, so this read "xp advancement" / "milestone
						    advancement" — lowercase, and XP as a word rather than the initialism. */}
						{draft.mode === 'xp' ? 'XP' : 'Milestone'} advancement · {doneCount}/{required.length}{' '}
						choices made
					</div>
				</div>
				<Button variant="ghost" size="sm" onClick={cancel}>
					Cancel
				</Button>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
				{required.map((req, i) => {
					const field = req.field as string;
					const meta = STEP_META[field] ?? { label: field, kind: 'choice', detail: '' };
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
									<span style={{ font: `600 13.5px ${T.sans}` }}>{meta.label}</span>
									<Badge status="neutral">{meta.kind}</Badge>
								</div>
								{done ? (
									<div style={{ font: `12.5px ${T.sans}`, color: T.acc }}>{String(saved)}</div>
								) : (
									<div style={{ font: `12px ${T.sans}`, color: T.warn }}>{pending.get(field)}</div>
								)}
								<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub, marginTop: 2 }}>
									{meta.detail}
								</div>
								<div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
									<Input
										type={meta.number ? 'number' : 'text'}
										value={inputs[field] ?? ''}
										placeholder={done ? String(saved) : meta.label}
										aria-label={meta.label}
										onChange={(e: any) => setInputs((v) => ({ ...v, [field]: e.target.value }))}
										style={{ maxWidth: 220 }}
									/>
									<Button
										variant="secondary"
										size="sm"
										disabled={!(inputs[field] ?? '').trim()}
										onClick={() => saveChoice(field)}
									>
										{done ? 'Change' : 'Choose'}
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
						? `Finish — become level ${draft.toLevel}`
						: 'Make all choices to finish'}
				</Button>
			</div>
		</div>
	);
}
