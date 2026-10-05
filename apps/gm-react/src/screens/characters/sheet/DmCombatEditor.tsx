import { useState } from 'react';
import { Button, Field, Input } from '../../../ds';
import type { DSChangeEvent } from '../../../ds';
import type { CharacterView } from '@dndtools/core';
import { T } from '../../../app/screen-kit';
import { useI18n } from '../../../i18n';
import { clamp } from '../shared';
import type { SheetIO } from './subject';

/**
 * The DM's absolute hit-point and armour-class editor: the durable, DM-only `character.set-combat`
 * (no session gate). Drawn only for an actor with DM authority, inside the Combat panel's edit mode.
 */
export function DmCombatEditor({
	id,
	view,
	actorId,
	io,
}: {
	id: string;
	view: CharacterView;
	actorId: string;
	io: SheetIO;
}) {
	const { t } = useI18n();
	const [hpAmount, setHpAmount] = useState(1);
	const [hpDraft, setHpDraft] = useState('1');
	const [acDraft, setAcDraft] = useState('');
	// Damage/Heal must use what is currently TYPED, not the last committed value: React fires no blur
	// when the pointer goes straight from the field to the button on touch.
	const typedHpAmount = () => {
		const parsed = Number(hpDraft);
		return hpDraft.trim() === '' || !Number.isFinite(parsed)
			? hpAmount
			: Math.max(1, Math.trunc(parsed));
	};
	const commitHpAmount = () => {
		const next = typedHpAmount();
		setHpAmount(next);
		setHpDraft(String(next));
	};
	async function applyHp(delta: number) {
		const current = view.combat.hp;
		const next = clamp(current + delta, 0, view.combat.maxHp);
		// At 0 HP a Damage press, and at full HP a Heal press, would be a durable no-op announced as a
		// change. It is a refusal, so it belongs in the visible alert, not in the success channel.
		if (next === current) {
			io.refuse(
				delta < 0
					? `Already at 0 hit points — no damage applied.`
					: `Already at full health — ${current} of ${view.combat.maxHp} hit points.`,
			);
			return;
		}
		await io.dispatch(
			{ type: 'character.set-combat', actorId, payload: { characterId: id, hp: next } },
			`${delta < 0 ? 'Damaged' : 'Healed'} ${Math.abs(delta)}. ${next} of ${view.combat.maxHp} hit points.`,
		);
	}
	async function applyAc() {
		// `Number('')` is 0, which is finite, so a blank field would overwrite the AC with 0 while the
		// placeholder showed the current value. Say why instead of returning silently.
		if (acDraft.trim() === '') {
			io.refuse('Enter an armour class before applying.', 'ac');
			return;
		}
		const n = Math.trunc(Number(acDraft));
		if (!Number.isFinite(n) || n < 0) {
			io.refuse('Armour class must be a number of 0 or more.', 'ac');
			return;
		}
		if (
			await io.dispatch(
				{ type: 'character.set-combat', actorId, payload: { characterId: id, ac: n } },
				`Armour class set to ${n}.`,
			)
		)
			setAcDraft('');
	}
	const row = {
		display: 'flex',
		gap: T.space.two,
		alignItems: 'flex-end',
		flexWrap: 'wrap',
	} as const;
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: T.space.two,
				borderTop: `1px solid ${T.bd}`,
				paddingTop: T.space.three,
			}}
		>
			<div style={row}>
				<Field label={t('characters.amount')} style={{ width: 90 }}>
					<Input
						type="number"
						min={1}
						// Hold the text and commit on blur: coercing per keystroke snapped a cleared field to 1.
						value={hpDraft}
						onChange={(e: DSChangeEvent) => setHpDraft(e.target.value)}
						onBlur={commitHpAmount}
					/>
				</Field>
				<Button variant="secondary" size="sm" onClick={() => applyHp(-typedHpAmount())}>
					{t('characters.damage')}
				</Button>
				<Button variant="secondary" size="sm" onClick={() => applyHp(typedHpAmount())}>
					{t('characters.heal')}
				</Button>
			</div>
			<div style={row}>
				<Field label={t('characters.setAc')} style={{ width: 90 }}>
					<Input
						type="number"
						value={acDraft}
						placeholder={String(view.combat.ac)}
						onChange={(e: DSChangeEvent) => setAcDraft(e.target.value)}
					/>
				</Field>
				<Button variant="secondary" size="sm" onClick={applyAc}>
					{t('characters.setAc')}
				</Button>
				{io.fieldError('ac')}
			</div>
		</div>
	);
}
