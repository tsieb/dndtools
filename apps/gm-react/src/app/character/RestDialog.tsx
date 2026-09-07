import { useState } from 'react';
import type { CharacterProficiencies } from '@dndtools/core';
import { Button, Dialog, Field, Select } from '../../ds';
import { Seg, T } from '../screen-kit';
import { useI18n } from '../../i18n';

/**
 * RC-CHR-1.2 — the REST dialog. A rest used to be one press that quietly recovered whatever the
 * package said and told the player nothing; this asks the two questions a rest actually raises —
 * which rest, and how many hit dice to spend on it — and states what each answer will do BEFORE it
 * is dispatched.
 *
 * The dialog computes nothing durable: the hit points a die produces are resolved in the core, from
 * a seed the command records, so a rolled rest reads the same on every device. What is shown here for
 * the `average` mode is exactly the arithmetic the core applies (die average + the CON modifier, at
 * least 0 per die); the `roll` mode states its range rather than pretending to know the outcome.
 *
 * Fail closed: a character with no hit dice recorded is told so and offered the rest without them,
 * rather than shown a stepper that can only produce a rejection.
 */

/** What the dialog needs to know about the character resting. All of it is actor-scoped read data. */
export interface RestSubject {
	id: string;
	name: string;
	hp: number;
	maxHp: number;
	hitDice: CharacterProficiencies['hitDice'];
	/** The CON modifier the core will add to each spent die. */
	conMod: number;
	exhaustion: number;
}

/** The `character.rest` payload the dialog asks for, minus the character it applies to. */
export interface RestChoice {
	rest: 'short' | 'long';
	hitDice?: { spend: number; mode: 'roll' | 'average' };
}

/** The faces on a hit die string (`d8`), or null when the recorded value is not a die. */
function hitDieFaces(die: string): number | null {
	const match = /^d?(\d+)$/i.exec(die.trim());
	if (!match) return null;
	const faces = Number(match[1]);
	return Number.isInteger(faces) && faces >= 2 ? faces : null;
}

export function RestDialog({
	open,
	subject,
	defaultRest,
	onClose,
	onConfirm,
}: {
	open: boolean;
	subject: RestSubject | null;
	defaultRest: 'short' | 'long';
	onClose: () => void;
	onConfirm: (choice: RestChoice) => void;
}) {
	// Unmounted while closed, so every open starts from the current character and rest rather than
	// from whatever was half-chosen and cancelled last time.
	if (!open || !subject) return null;
	return (
		<RestForm
			key={`${subject.id}:${defaultRest}`}
			subject={subject}
			defaultRest={defaultRest}
			onClose={onClose}
			onConfirm={onConfirm}
		/>
	);
}

function RestForm({
	subject,
	defaultRest,
	onClose,
	onConfirm,
}: {
	subject: RestSubject;
	defaultRest: 'short' | 'long';
	onClose: () => void;
	onConfirm: (choice: RestChoice) => void;
}) {
	const { t } = useI18n();
	const [rest, setRest] = useState<'short' | 'long'>(defaultRest);
	const [spend, setSpend] = useState(0);
	const [mode, setMode] = useState<'roll' | 'average'>('average');

	const faces = hitDieFaces(subject.hitDice.die);
	const available = Math.max(0, subject.hitDice.total - subject.hitDice.spent);
	const canSpend = rest === 'short' && faces !== null && available > 0;
	const spending = canSpend ? Math.min(spend, available) : 0;
	// The core's own average: half the die's faces rounded up, plus the CON modifier, never below 0.
	const perDie = faces === null ? 0 : Math.max(0, Math.floor(faces / 2) + 1 + subject.conMod);
	const missing = Math.max(0, subject.maxHp - subject.hp);
	// A long rest hands back half the character's hit dice, rounded down, at least one — capped at
	// what is actually spent. The same rule the core applies, stated before it runs.
	const returned =
		subject.hitDice.total > 0
			? Math.min(subject.hitDice.spent, Math.max(1, Math.floor(subject.hitDice.total / 2)))
			: 0;

	const summary =
		rest === 'long'
			? t('character.rest.longSummary', {
					hp: missing,
					dice: returned,
					exhaustion: Math.max(0, subject.exhaustion - 1),
				})
			: spending === 0
				? t('character.rest.shortSummaryNoDice')
				: mode === 'average'
					? t('character.rest.shortSummaryAverage', {
							dice: spending,
							hp: Math.min(missing, spending * perDie),
						})
					: t('character.rest.shortSummaryRoll', { dice: spending, die: subject.hitDice.die });

	return (
		<Dialog
			open
			onClose={onClose}
			title={t('character.rest.title', { name: subject.name })}
			description={t('character.rest.description')}
			icon="recent"
			size="sm"
			footer={
				<>
					<Button variant="secondary" size="sm" onClick={onClose}>
						{t('character.rest.cancel')}
					</Button>
					<Button
						variant="primary"
						size="sm"
						icon={rest === 'long' ? 'theme' : 'recent'}
						onClick={() =>
							onConfirm(spending > 0 ? { rest, hitDice: { spend: spending, mode } } : { rest })
						}
					>
						{rest === 'long' ? t('character.rest.takeLong') : t('character.rest.takeShort')}
					</Button>
				</>
			}
		>
			<div style={{ display: 'grid', gap: 14 }}>
				<Seg
					value={rest}
					ariaLabel={t('character.rest.kindLabel')}
					onChange={(value) => setRest(value as 'short' | 'long')}
					options={[
						{ value: 'short', label: t('character.rest.short') },
						{ value: 'long', label: t('character.rest.long') },
					]}
				/>
				{rest === 'short' ? (
					faces === null || subject.hitDice.total === 0 ? (
						// Honest empty state: no stepper, and the reason the rest cannot spend anything.
						<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub }}>
							{t('character.rest.noHitDice')}
						</div>
					) : (
						<>
							<Field
								label={t('character.rest.hitDiceLabel', { die: subject.hitDice.die })}
								help={t('character.rest.hitDiceHelp', { available, die: subject.hitDice.die })}
							>
								<Select
									value={String(spending)}
									onChange={(e: { target: { value: string } }) => setSpend(Number(e.target.value))}
									options={Array.from({ length: available + 1 }, (_, n) => ({
										value: String(n),
										label:
											n === 0
												? t('character.rest.spendNone')
												: t('character.rest.spendCount', { count: n, die: subject.hitDice.die }),
									}))}
								/>
							</Field>
							{spending > 0 ? (
								<Seg
									value={mode}
									ariaLabel={t('character.rest.modeLabel')}
									onChange={(value) => setMode(value as 'roll' | 'average')}
									options={[
										{ value: 'average', label: t('character.rest.average') },
										{ value: 'roll', label: t('character.rest.roll') },
									]}
								/>
							) : null}
						</>
					)
				) : null}
				<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub }}>{summary}</div>
			</div>
		</Dialog>
	);
}
