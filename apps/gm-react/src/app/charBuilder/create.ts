/**
 * CharBuilder's durable create paths — the REAL core dispatches behind the wizard's final button
 * and behind the reviewed import plan.
 *
 * Split out of the former single-file `app/CharBuilder.tsx` (RC-STB-2.4) — a pure move, no
 * behaviour change. The functions read the wizard's field values through the same `Wizard` bag the
 * steps render from, so each one is the byte-equivalent of the closure it used to be.
 */
import { Toaster } from '../../ds';
import type { SceneRuntime } from '../../runtime/SceneRuntime';
import type { ImportPlan } from '../charImport/ddbJson';
import { eventField, type AttackRow } from './data';
import type { Wizard } from './wizard';

export interface CreateContext {
	runtime: SceneRuntime;
	dmActorId: string;
	/** The DM-facing ability block the core commands take (the wizard's effective scores). */
	coreAbilities: Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number>;
	w: Wizard;
	setError: (message: string | null) => void;
}

/** Build the durable attack entries ({name, detail}) from the editor rows. */
export function attackEntries(attacks: AttackRow[]): { name: string; detail: string }[] {
	return attacks
		.filter((a) => a.name.trim())
		.map((a) => ({
			name: a.name.trim(),
			detail: [
				a.kind.trim(),
				a.hit.trim() ? `${a.hit.trim()} to hit` : '',
				[a.dmg.trim(), a.type.trim()].filter(Boolean).join(' '),
			]
				.filter(Boolean)
				.join(' · '),
		}));
}

/** PC: the guided draft flow exactly as demo-seed §0★ — DM creates the draft for a player owner,
 *  the OWNER fills identity/abilities/class (+ the optional `kit` step: AC/HP + custom attacks,
 *  which `character.finalize-draft` carries onto the character) and finalizes, then the DM
 *  applies extras. */
export async function createPc(ctx: CreateContext): Promise<string | null> {
	const { runtime, dmActorId, coreAbilities, setError, w } = ctx;
	const {
		ownerId,
		name,
		bgId,
		clsId,
		attacks,
		hp,
		ac,
		raceObj,
		align,
		speed,
		grad,
		level,
		subclass,
		bio,
	} = w;
	const created = await runtime.dispatch({
		type: 'character.create-draft',
		actorId: dmActorId,
		payload: { ownerActorId: ownerId, name: name.trim() },
	});
	if (created.status === 'rejected') {
		setError(created.rejection.message);
		return null;
	}
	const draftId = eventField(created, 'character.draft-created', 'draftId');
	if (!draftId) {
		setError('The character draft couldn’t be started — try again.');
		return null;
	}

	const steps: [string, Record<string, unknown>][] = [
		['identity', { name: name.trim(), background: bgId }],
		['abilities', { ...coreAbilities }],
		['class', { class: clsId }],
		// The OPTIONAL kit step: finalize-draft reads it tolerantly and carries AC / HP / the
		// draft's CUSTOM ATTACKS onto the finalized character (it doesn't gate completeness).
		['kit', { attacks: attackEntries(attacks), hp, maxHp: hp, ac }],
	];
	for (const [stepId, values] of steps) {
		const r = await runtime.dispatch({
			type: 'character.update-draft-step',
			actorId: ownerId,
			payload: { draftId, stepId, values },
		});
		if (r.status === 'rejected') {
			setError(r.rejection.message);
			return null;
		}
	}
	const finalized = await runtime.dispatch({
		type: 'character.finalize-draft',
		actorId: ownerId,
		payload: { draftId },
	});
	if (finalized.status === 'rejected') {
		setError(finalized.rejection.message);
		return null;
	}
	const characterId = eventField(finalized, 'character.created', 'characterId');
	if (!characterId) {
		setError('The character couldn’t be created — try again.');
		return null;
	}

	// finalize-draft consumed the kit step above (AC / HP / attacks land on the character).

	// finalize-draft does NOT auto-grant the `owner` capability set (PERM-004 grants are explicit) —
	// without this the owning player can't level up or journal on their own PC (demo-seed §0★).
	const grant = await runtime.dispatch({
		type: 'permission.grant-capability-set',
		actorId: dmActorId,
		payload: {
			entityType: 'character',
			entityId: characterId,
			playerActorId: ownerId,
			capabilitySet: 'owner',
			expiresAt: null,
		},
	});
	if (grant.status === 'rejected')
		Toaster.warning(`The player couldn’t be given access: ${grant.rejection.message}`);

	// Sheet extras through the validated field-edit surface (`data.*` holds strings; the DM may
	// edit any field). `data.level` is the same field the CHAR-009 advancement flow maintains.
	const FIELD_PATH_LABEL: Record<string, string> = {
		'data.race': 'Race',
		'data.alignment': 'Alignment',
		'data.speed': 'Speed',
		'data.grad': 'Gradient',
		'data.level': 'Level',
		'data.subclass': 'Subclass',
		'data.bio': 'Bio',
	};
	const extras: [string, string][] = [
		['data.race', raceObj.name],
		['data.alignment', align],
		['data.speed', String(speed)],
		['data.grad', String(grad)],
	];
	if (level > 1) extras.push(['data.level', String(level)]);
	if (subclass) extras.push(['data.subclass', subclass]);
	if (bio.trim()) extras.push(['data.bio', bio.trim()]);
	for (const [path, value] of extras) {
		const r = await runtime.dispatch({
			type: 'character.edit-field',
			actorId: dmActorId,
			payload: { characterId, path, value },
		});
		if (r.status === 'rejected')
			Toaster.warning(
				`One field (${FIELD_PATH_LABEL[path] ?? path}) wasn’t saved: ${r.rejection.message}`,
			);
	}
	return characterId;
}

/** NPC / Monster / Sidekick: one durable `character.quick-create` (CHAR-001). */
export async function createOther(ctx: CreateContext): Promise<string | null> {
	const { runtime, dmActorId, coreAbilities, setError, w } = ctx;
	const {
		attacks,
		clsObj,
		bgObj,
		raceObj,
		align,
		level,
		speed,
		grad,
		subclass,
		bio,
		dmNotes,
		kind,
		name,
		vis,
		hp,
		ac,
	} = w;
	const attackRows = attackEntries(attacks);
	const data: Record<string, unknown> = {
		class: clsObj.name,
		background: bgObj.name,
		race: raceObj.name,
		alignment: align,
		level: String(level),
		speed: String(speed),
		grad: String(grad),
	};
	if (subclass) data.subclass = subclass;
	if (bio.trim()) data.bio = bio.trim();
	const dmOnlyFields: string[] = [];
	if (dmNotes.trim()) {
		data.dmNotes = dmNotes.trim();
		dmOnlyFields.push('data.dmNotes');
	}

	const result = await runtime.dispatch({
		type: 'character.quick-create',
		actorId: dmActorId,
		payload: {
			kind,
			name: name.trim(),
			visibility: vis === 'players' ? 'player-visible' : 'dm-only',
			abilityScores: { ...coreAbilities },
			attacks: attackRows,
			combat: { hp, maxHp: hp, ac },
			data,
			dmOnlyFields,
		},
	});
	if (result.status === 'rejected') {
		setError(result.rejection.message);
		return null;
	}
	return eventField(result, 'character.created', 'characterId');
}

/** Execute the reviewed plan: quick-create → set-proficiencies → set-spell ×N → update-attacks. */
export async function runImport(ctx: {
	runtime: SceneRuntime;
	dmActorId: string;
	importPlan: ImportPlan | null;
	setError: (message: string | null) => void;
	setSubmitting: (value: boolean) => void;
	onCreated: (id: string) => void;
}) {
	const { runtime, dmActorId, importPlan, setError, setSubmitting, onCreated } = ctx;
	if (!importPlan) return;
	setError(null);
	setSubmitting(true);
	try {
		const created = await runtime.dispatch({
			type: 'character.quick-create',
			actorId: dmActorId,
			payload: importPlan.quickCreate,
		});
		if (created.status === 'rejected') {
			setError(created.rejection.message);
			return;
		}
		const characterId = eventField(created, 'character.created', 'characterId');
		if (!characterId) {
			setError('The character couldn’t be created — try again.');
			return;
		}

		if (importPlan.proficiencies) {
			const r = await runtime.dispatch({
				type: 'character.set-proficiencies',
				actorId: dmActorId,
				payload: { characterId, ...importPlan.proficiencies },
			});
			if (r.status === 'rejected')
				Toaster.warning(`Proficiencies were not applied: ${r.rejection.message}`);
		}
		let spellFailures = 0;
		for (const spell of importPlan.spells) {
			const r = await runtime.dispatch({
				type: 'character.set-spell',
				actorId: dmActorId,
				payload: { characterId, id: runtime.newId(), ...spell },
			});
			if (r.status === 'rejected') spellFailures += 1;
		}
		if (spellFailures > 0)
			Toaster.warning(
				`${spellFailures} spell${spellFailures === 1 ? '' : 's'} could not be applied.`,
			);
		if (importPlan.attacks.length > 0) {
			const r = await runtime.dispatch({
				type: 'character.update-attacks',
				actorId: dmActorId,
				payload: { characterId, attacks: importPlan.attacks },
			});
			if (r.status === 'rejected')
				Toaster.warning(`Attacks were not applied: ${r.rejection.message}`);
		}
		Toaster.success(`${importPlan.name} imported to the roster (DM-only)`);
		onCreated(characterId);
	} finally {
		setSubmitting(false);
	}
}
