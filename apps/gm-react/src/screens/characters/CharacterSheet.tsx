import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	getCharacterForActor,
	searchVaultForActor,
	resourcesOf,
	advancementStateOf,
	passivePerception,
	effectiveProficiencyBonus,
	type PreparedSpell,
} from '@dndtools/core';
import { EmptyState } from '../../ds';
import { Page, T } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { ABILITIES, BackBar, clamp } from './shared';
import { SheetHeader } from './sheet/SheetHeader';
import { AbilitiesPanel } from './sheet/AbilitiesPanel';
import { AttacksPanel } from './sheet/AttacksPanel';
import { AdvancementPanel } from './sheet/AdvancementPanel';
import { CombatPanel } from './sheet/CombatPanel';
import { SpellsPanel } from './sheet/SpellsPanel';
import { ReferencePanel } from './sheet/ReferencePanel';
import { SharingPanel } from './sheet/SharingPanel';
import { BioPanel } from './sheet/BioPanel';
import { useAdvancementEditor } from './sheet/useAdvancementEditor';
import { useI18n } from '../../i18n';

// ── The live character sheet, bound to the redacted core view ───────────────────────────────────
export function CharacterSheet({ id, onBack }: { id: string; onBack: () => void }) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const navigate = useNavigate();
	const isPhone = useViewport() === 'phone';
	const actorId = runtime.defaultActorId;
	const [editMode, setEditMode] = useState(false);
	// A single screen-level `role="alert"` under the BackBar carried BOTH core rejections and the
	// per-field validation messages — but every validation writer lives deep inside an edit-mode
	// panel, so "Set AC" with a blank field printed its reason hundreds of pixels above the fold and
	// read as a dead button. `field` routes a validation message to its own control instead.
	const [error, setError] = useState<{
		text: string;
		field?: 'ac' | 'slots' | 'xp';
		seq?: number;
	} | null>(null);
	// `role="alert"` announces on INSERTION, and re-rendering the same node with byte-identical text
	// is an `Object.is` bail-out — so a repeated refusal (press Damage twice at 0 HP) was announced
	// exactly once. `seq` keys the alert node, so every raise really is a new node.
	const errSeq = useRef(0);
	const raiseError = (next: { text: string; field?: 'ac' | 'slots' | 'xp' }) => {
		errSeq.current += 1;
		setError({ ...next, seq: errSeq.current });
	};
	// Success channel. Deliberately a `role="status"` rendered from mount with EMPTY text: a live
	// region inserted together with its content is routinely dropped, and an always-present
	// `role="alert"` would make every bare `getByRole('alert')` in the suite ambiguous.
	const [note, setNote] = useState('');
	const fieldError = (field: 'ac' | 'slots' | 'xp') =>
		error?.field === field ? (
			<div
				role="alert"
				style={{
					flexBasis: '100%',
					font: `12px ${T.sans}`,
					color: 'var(--color-status-error-text)',
				}}
			>
				{error.text}
			</div>
		) : null;
	const [hpAmount, setHpAmount] = useState(1);
	const [hpDraft, setHpDraft] = useState('1');
	function commitHpAmount() {
		const parsed = Number(hpDraft);
		const next =
			hpDraft.trim() === '' || !Number.isFinite(parsed)
				? hpAmount
				: Math.max(1, Math.trunc(parsed));
		setHpAmount(next);
		setHpDraft(String(next));
	}
	// Damage/Heal must use what is currently TYPED, not the last committed value: React fires no
	// blur when the pointer goes straight from the field to the button on touch.
	function typedHpAmount(): number {
		const parsed = Number(hpDraft);
		return hpDraft.trim() === '' || !Number.isFinite(parsed)
			? hpAmount
			: Math.max(1, Math.trunc(parsed));
	}
	const [acDraft, setAcDraft] = useState('');
	const [conditionInput, setConditionInput] = useState('');
	const [nameDraft, setNameDraft] = useState('');
	const [editingName, setEditingName] = useState(false);

	// Spellcasting local inputs (edit mode): add a known spell / declare a slot level (CHAR-008).
	const [spellName, setSpellName] = useState('');
	const [spellLevel, setSpellLevel] = useState('1');
	const [slotLevel, setSlotLevel] = useState('1');
	const [slotMax, setSlotMax] = useState('');

	// Attack-list editor rows (null ⇒ not editing). Saved through `character.update-attacks`
	// (full-replacement: the submitted rows ARE the new list; a row without an id is a new attack).
	const [attackRows, setAttackRows] = useState<
		{ id?: string; name: string; detail: string }[] | null
	>(null);
	// Sharing editor draft (null ⇒ read-only). Applied through the DM-only `character.set-sharing`.
	const [shareDraft, setShareDraft] = useState<{ visibility: string; sharedWith: string[] } | null>(
		null,
	);

	// The redacted view gates visibility (null when this actor may not see the character); the raw
	// record is read ONLY after that gate passes, so its resources/advancement never leak (the same
	// pattern as party-overview + the Svelte combat/advancement surfaces).
	const view = getCharacterForActor(
		runtime.state.characters,
		runtime.state.permissions,
		actorId,
		id,
	);
	const actor = runtime.state.permissions.actors[actorId] ?? null;
	const isDm = actor?.role === 'dm';
	const record = view ? (runtime.state.characters.characters[id] ?? null) : null;
	const resources = record ? resourcesOf(record) : null;
	const advancement = record ? advancementStateOf(record) : null;
	const players = runtime.actors.filter((a) => a.role === 'player');

	// Structured proficiency slice (hydrated with safe defaults on the view) + the PURE derived
	// queries: the effective proficiency bonus (explicit override, else derived from `data.level` by
	// the standard 5e progression) and passive perception (10 + WIS mod + perception proficiency).
	// Both derive on read — they can never drift from the stored scores/proficiencies.
	const prof = view?.proficiencies ?? null;
	const profBonus = record ? effectiveProficiencyBonus(record) : null;
	const passivePer = record ? passivePerception(record) : null;
	const hasProficiencyData =
		!!prof &&
		(Object.keys(prof.skills).length > 0 ||
			prof.saves.length > 0 ||
			prof.proficiencyBonus !== null ||
			prof.hitDice.total > 0);

	// Cross-links: notes that mention this character by name (the same actor-filtered full-text
	// read the ⌘K palette uses), so the sheet connects to the lore written about it.
	const mentions = useMemo(() => {
		const name = view?.name.trim();
		if (!name) return [];
		const result = searchVaultForActor(
			runtime.state.content,
			runtime.state.maps,
			runtime.state.permissions,
			runtime.state.session,
			actorId,
			{ query: name },
		);
		return result.hits.filter((h) => h.type === 'note' || h.type === 'object').slice(0, 6);
	}, [runtime.state, actorId, view?.name]);

	// Advancement (CHAR-009) — DM/owner only. set-combat authority differs (DM-only) from advancement
	// (DM or character owner); the core re-enforces both on dispatch. The panel's inputs, eligibility
	// and its five staged dispatches live in ./sheet/useAdvancementEditor.
	const adv = useAdvancementEditor({
		record,
		advancement,
		actorId,
		id,
		isDm,
		dispatch,
		setError,
	});

	if (!view) {
		return (
			<Page max={920}>
				<BackBar onBack={onBack} />
				<EmptyState
					icon="dm-only"
					title={t('characters.unavailableTitle')}
					description={t('characters.unavailableBody')}
				/>
			</Page>
		);
	}

	// `okNote` is what a successful write ANNOUNCES. Every durable edit on this sheet — HP, AC,
	// conditions, rename, prepared spells, slots, attacks, sharing, XP, each advancement step —
	// changes only a number or a pill, which is invisible to assistive tech: the DM's primary
	// authoring surface confirmed nothing at all. `Player.tsx` already carries this one-node pattern.
	async function dispatch(command: any, okNote?: string): Promise<boolean> {
		setError(null);
		// Emptying the region for the duration of the write does two jobs. It stops a stale SUCCESS
		// note sitting under a fresh error (only `error` was being cleared), and — because assistive
		// tech diffs live-region text and drops a byte-identical update — it is what makes the SECOND
		// press of a repeated action audible at all. The multi-field level-up presses "Save choices"
		// once per field and announced only the first.
		setNote('');
		try {
			const result = await runtime.dispatch(command);
			if (result.status === 'rejected') {
				raiseError({ text: result.rejection.message });
				return false;
			}
			if (okNote) setNote(okNote);
			return true;
		} catch (e) {
			// `runtime.dispatch` RETHROWS after a failed persist. Without this the rejection message
			// cleared above never came back and the control simply looked inert.
			raiseError({
				text: e instanceof Error ? e.message : 'That change couldn’t be saved — try again.',
			});
			return false;
		}
	}

	// DM HP/AC/condition edits go through the durable, DM-only `character.set-combat` (no active-session
	// gate — the granular session-gated in-play hot path lives on the Session / Combat surfaces).
	async function applyHp(delta: number) {
		const current = view!.combat.hp;
		const next = clamp(current + delta, 0, view!.combat.maxHp);
		// At 0 HP a Damage press, and at full HP a Heal press, used to dispatch `set-combat` with the
		// UNCHANGED hp — a durable no-op the journal recorded — and then announce "Damaged 7. 0 of 24
		// hit points." The number in the message is real; the verb is not. Say what actually happened.
		if (next === current) {
			// This refusal used to render ONLY into the visually-hidden `role="status"` success host, so
			// a sighted DM pressing Damage at 0 HP got no visible change whatsoever — a dead button with
			// a secret explanation. It is a refusal, so it belongs in the visible alert slot, and the
			// success host has to be emptied or a stale "Damaged 7." sits under it.
			setNote('');
			raiseError({
				text:
					delta < 0
						? `Already at 0 hit points — no damage applied.`
						: `Already at full health — ${current} of ${view!.combat.maxHp} hit points.`,
			});
			return;
		}
		await dispatch(
			{ type: 'character.set-combat', actorId, payload: { characterId: id, hp: next } },
			`${delta < 0 ? 'Damaged' : 'Healed'} ${Math.abs(delta)}. ${next} of ${view!.combat.maxHp} hit points.`,
		);
	}
	async function applyAc() {
		// `Number('')` is 0, which is finite — so a blank field used to sail past the guard and
		// silently overwrite the character's AC with 0. The placeholder shows the current AC, so
		// this read as a no-op right up until the armour class was gone.
		// The guards below protect the stored value, but returning silently left a button that
		// visibly did nothing — worse here because the placeholder shows the CURRENT ac, so the
		// field looks pre-filled. Say why instead.
		if (acDraft.trim() === '') {
			setError({ text: 'Enter an armour class before applying.', field: 'ac' });
			return;
		}
		const n = Math.trunc(Number(acDraft));
		if (!Number.isFinite(n) || n < 0) {
			setError({ text: 'Armour class must be a number of 0 or more.', field: 'ac' });
			return;
		}
		if (
			await dispatch(
				{ type: 'character.set-combat', actorId, payload: { characterId: id, ac: n } },
				`Armour class set to ${n}.`,
			)
		)
			setAcDraft('');
	}
	async function setCondition(name: string, present: boolean) {
		const trimmed = name.trim();
		if (present && !trimmed) return;
		const current = view!.combat.conditions;
		const next = present
			? current.some((c) => c.toLowerCase() === trimmed.toLowerCase())
				? current
				: [...current, trimmed]
			: current.filter((c) => c !== name);
		if (
			(await dispatch(
				{ type: 'character.set-combat', actorId, payload: { characterId: id, conditions: next } },
				present ? `${trimmed} added.` : `${name} removed.`,
			)) &&
			present
		) {
			setConditionInput('');
		}
	}
	async function saveName() {
		setEditingName(false);
		const next = nameDraft.trim();
		if (!next || next === view!.name) return;
		await dispatch(
			{
				type: 'character.edit-field',
				actorId,
				payload: { characterId: id, path: 'name', value: next },
			},
			`Renamed to ${next}.`,
		);
	}

	// CHAR-008 spell/slot writes — DM or character owner, NOT session-gated (unlike CHAR-007's
	// `update-combat-resource`), so the DM sheet can spend/restore slots outside a live session.
	// Same command pattern as the /player resources tab.
	async function toggleSlot(level: number, max: number, expended: number, filled: boolean) {
		// Clicking a filled diamond expends a slot; a hollow one recovers it.
		const nextExpended = filled ? Math.min(max, expended + 1) : Math.max(0, expended - 1);
		await dispatch(
			{
				type: 'character.set-spell-slots',
				actorId,
				payload: { characterId: id, level, max, expended: nextExpended },
			},
			`Level ${level}: ${max - nextExpended} of ${max} slots remaining.`,
		);
	}
	async function togglePrepared(s: PreparedSpell) {
		await dispatch(
			{
				type: 'character.set-spell',
				actorId,
				payload: { characterId: id, id: s.id, name: s.name, level: s.level, prepared: !s.prepared },
			},
			`${s.name} ${s.prepared ? 'unprepared' : 'prepared'}.`,
		);
	}
	async function addSpell() {
		const trimmed = spellName.trim();
		if (!trimmed) return;
		const level = clamp(Math.trunc(Number(spellLevel) || 0), 0, 9);
		if (
			await dispatch(
				{
					type: 'character.set-spell',
					actorId,
					payload: { characterId: id, id: runtime.newId(), name: trimmed, level, prepared: true },
				},
				`${trimmed} added at level ${level}.`,
			)
		) {
			setSpellName('');
		}
	}
	async function declareSlots() {
		const level = clamp(Math.trunc(Number(slotLevel) || 0), 0, 9);
		const max = Math.max(0, Math.trunc(Number(slotMax)));
		if (slotMax.trim() === '' || !Number.isFinite(Number(slotMax))) {
			setError({ text: 'Enter how many slots this level has.', field: 'slots' });
			return;
		}
		if (
			await dispatch(
				{ type: 'character.set-spell-slots', actorId, payload: { characterId: id, level, max } },
				`Level ${level} now has ${max} slots.`,
			)
		) {
			setSlotMax('');
		}
	}

	// Post-create attack editing (owner-or-DM, `character.update-attacks`): the saved rows replace the
	// whole list in one validated step, so add/edit/remove all flow through the same command.
	async function saveAttacks() {
		if (!attackRows) return;
		const attacks = attackRows
			.filter((a) => a.name.trim())
			.map((a) => ({
				...(a.id ? { id: a.id } : {}),
				name: a.name.trim(),
				detail: a.detail.trim(),
			}));
		if (
			await dispatch(
				{ type: 'character.update-attacks', actorId, payload: { characterId: id, attacks } },
				`Saved ${attacks.length} ${attacks.length === 1 ? 'attack' : 'attacks'}.`,
			)
		) {
			setAttackRows(null);
		}
	}

	// Sharing (DM-only `character.set-sharing`): entity visibility + the explicit `sharedWith`
	// delivery list. `sharedWith` is always sent as-is so flipping the level never silently drops a
	// PC's owner from the delivery list (visibility never narrows/widens as a side effect).
	async function applySharing() {
		if (!shareDraft) return;
		if (
			await dispatch(
				{
					type: 'character.set-sharing',
					actorId,
					payload: {
						characterId: id,
						visibility: shareDraft.visibility,
						sharedWith: shareDraft.sharedWith,
					},
				},
				'Sharing updated.',
			)
		) {
			setShareDraft(null);
		}
	}

	const abilityCells = ABILITIES.map((k) => ({
		key: k.toUpperCase(),
		val: view.abilityScores[k],
	})).filter((a) => typeof a.val === 'number') as { key: string; val: number }[];
	const slots = resources
		? Object.values(resources.spellSlots).sort((a, b) => a.level - b.level)
		: [];
	const classResources = resources ? Object.values(resources.classResources) : [];
	const spells = resources
		? [...resources.spells].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
		: [];
	// Show the panel whenever the character has ANY casting structure, or when the DM is editing (so
	// spells/slots can be declared on a character that has none yet).
	const hasSpellcasting =
		slots.length > 0 || classResources.length > 0 || spells.length > 0 || (editMode && isDm);

	return (
		<Page max={1000}>
			<SheetHeader
				view={view}
				isDm={isDm}
				advancement={advancement}
				note={note}
				error={error}
				editMode={editMode}
				setEditMode={setEditMode}
				nameDraft={nameDraft}
				setNameDraft={setNameDraft}
				editingName={editingName}
				setEditingName={setEditingName}
				setAttackRows={setAttackRows}
				setShareDraft={setShareDraft}
				saveName={saveName}
				onBack={onBack}
			/>

			<div
				style={{
					display: 'grid',
					// /characters/:id had no phone branch at all, so the sheet rendered as two ~180px
					// columns whose ability + skills grids then overflowed them.
					gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : 'minmax(0,1.3fr) minmax(0,1fr)',
					gap: 16,
					alignItems: 'start',
				}}
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					<AbilitiesPanel
						view={view}
						prof={prof}
						profBonus={profBonus}
						passivePer={passivePer}
						hasProficiencyData={hasProficiencyData}
						abilityCells={abilityCells}
						isPhone={isPhone}
					/>

					<AttacksPanel
						view={view}
						isDm={isDm}
						editMode={editMode}
						attackRows={attackRows}
						setAttackRows={setAttackRows}
						saveAttacks={saveAttacks}
						isPhone={isPhone}
					/>

					{adv.canAdvance && advancement && (
						<AdvancementPanel
							{...adv}
							advancement={advancement}
							fieldError={fieldError}
							isPhone={isPhone}
						/>
					)}
				</div>

				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					<CombatPanel
						view={view}
						isDm={isDm}
						editMode={editMode}
						resources={resources}
						hpDraft={hpDraft}
						setHpDraft={setHpDraft}
						commitHpAmount={commitHpAmount}
						typedHpAmount={typedHpAmount}
						acDraft={acDraft}
						setAcDraft={setAcDraft}
						conditionInput={conditionInput}
						setConditionInput={setConditionInput}
						applyHp={applyHp}
						applyAc={applyAc}
						setCondition={setCondition}
						fieldError={fieldError}
					/>

					{hasSpellcasting && (
						<SpellsPanel
							isDm={isDm}
							editMode={editMode}
							slots={slots}
							classResources={classResources}
							spells={spells}
							spellName={spellName}
							setSpellName={setSpellName}
							spellLevel={spellLevel}
							setSpellLevel={setSpellLevel}
							slotLevel={slotLevel}
							setSlotLevel={setSlotLevel}
							slotMax={slotMax}
							setSlotMax={setSlotMax}
							toggleSlot={toggleSlot}
							togglePrepared={togglePrepared}
							addSpell={addSpell}
							declareSlots={declareSlots}
							fieldError={fieldError}
						/>
					)}

					<ReferencePanel view={view} />

					{isDm && record && (
						<SharingPanel
							view={view}
							record={record}
							players={players}
							shareDraft={shareDraft}
							setShareDraft={setShareDraft}
							applySharing={applySharing}
						/>
					)}

					<BioPanel
						view={view}
						mentions={mentions}
						onOpenMention={(hit) =>
							navigate(hit.type === 'note' ? `/knowledge/${hit.id}` : '/campaign')
						}
					/>
				</div>
			</div>
		</Page>
	);
}
