import { useState } from 'react';
import {
	checkAdvancementEligibility,
	validateAdvancement,
	type AdvancementState,
	type Character,
} from '@dndtools/core';

/**
 * The level-up panel's local inputs, derived eligibility and the five staged advancement dispatches
 * (`character.{set-xp,open/set-choices/commit/cancel-advancement}`). Extracted from Characters.tsx
 * unchanged (RC-STB-2.6) — the bodies, the guards and the announcements are the originals; only the
 * `dispatch` / `setError` choke points arrive as arguments instead of closing over the component.
 */
export function useAdvancementEditor({
	record,
	advancement,
	actorId,
	id,
	isDm,
	dispatch,
	setError,
}: {
	record: Character | null;
	advancement: AdvancementState | null;
	actorId: string;
	id: string;
	isDm: boolean;
	dispatch: (
		command: { type: string; actorId: string; payload: Record<string, unknown> },
		okNote?: string,
	) => Promise<boolean>;
	setError: (next: { text: string; field?: 'ac' | 'slots' | 'xp' }) => void;
}) {
	// XP / advancement local inputs.
	const [xpInput, setXpInput] = useState('');
	const [className, setClassName] = useState('');
	const [hpGained, setHpGained] = useState('');
	const [subclass, setSubclass] = useState('');
	const [abilityOrFeat, setAbilityOrFeat] = useState('');

	// Advancement (CHAR-009) — DM/owner only. set-combat authority differs (DM-only) from advancement
	// (DM or character owner); the core re-enforces both on dispatch.
	const canAdvance = isDm; // owner grants aren't surfaced on this screen; the DM is the default actor.
	const draft = advancement?.draft ?? null;
	const xpEligible = record ? checkAdvancementEligibility(record, 'xp') : null;
	const draftValidation = draft ? validateAdvancement(draft) : null;
	// `set-advancement-choices` requires at least one choice (schema `.refine`); guard the button so a
	// blank "Save choices" can't fire a rejected dispatch.
	const hasAdvancementChoice = !!(
		className.trim() ||
		hpGained.trim() ||
		subclass.trim() ||
		abilityOrFeat.trim()
	);

	async function setXp() {
		// Same trap as applyAc: `Number('') || 0` is 0, so an empty field reset accumulated XP to
		// zero (and revoked level-up eligibility) on a single stray click.
		if (xpInput.trim() === '') {
			setError({ text: 'Enter an XP total before setting it.', field: 'xp' });
			return;
		}
		const parsed = Number(xpInput);
		if (!Number.isFinite(parsed)) {
			setError({ text: 'XP must be a number.', field: 'xp' });
			return;
		}
		const n = Math.max(0, Math.trunc(parsed));
		if (
			await dispatch(
				{ type: 'character.set-xp', actorId, payload: { characterId: id, xp: n } },
				`Experience set to ${n}.`,
			)
		)
			setXpInput('');
	}
	async function openAdvancement(mode: 'xp' | 'milestone') {
		await dispatch({
			type: 'character.open-advancement',
			actorId,
			payload: { characterId: id, mode },
		});
	}
	async function saveChoices() {
		const payload: Record<string, unknown> = { characterId: id };
		if (className.trim()) payload.className = className.trim();
		if (hpGained.trim()) payload.hitPointsGained = Math.trunc(Number(hpGained));
		if (subclass.trim()) payload.subclass = subclass.trim();
		if (abilityOrFeat.trim()) payload.abilityOrFeat = abilityOrFeat.trim();
		await dispatch(
			{ type: 'character.set-advancement-choices', actorId, payload },
			'Level-up choices saved.',
		);
	}
	async function commitAdvancement() {
		if (
			await dispatch(
				{ type: 'character.commit-advancement', actorId, payload: { characterId: id } },
				'Level-up complete.',
			)
		) {
			setClassName('');
			setHpGained('');
			setSubclass('');
			setAbilityOrFeat('');
		}
	}
	async function cancelAdvancement() {
		await dispatch({ type: 'character.cancel-advancement', actorId, payload: { characterId: id } });
	}

	return {
		canAdvance,
		draft,
		xpEligible,
		draftValidation,
		hasAdvancementChoice,
		xpInput,
		setXpInput,
		className,
		setClassName,
		hpGained,
		setHpGained,
		subclass,
		setSubclass,
		abilityOrFeat,
		setAbilityOrFeat,
		setXp,
		openAdvancement,
		saveChoices,
		commitAdvancement,
		cancelAdvancement,
	};
}
